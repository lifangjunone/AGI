import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const appPort = 45173;
const providerPort = 45174;
let appProcess;
let provider;
let dataDirectory;
let cookie = "";
let lastGenerationBody = null;

async function waitFor(url) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* retry during startup */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function api(path, options = {}) {
  const response = await fetch(`http://127.0.0.1:${appPort}/flowframe${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...options.headers,
    },
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return { response, body: await response.json() };
}

before(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), "flowframe-test-"));
  provider = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.headers.authorization !== "Bearer secret-key") {
      response.statusCode = 401;
      response.end(JSON.stringify({ error: { message: "invalid key" } }));
      return;
    }
    if (request.method === "POST" && request.url === "/generations") {
      const chunks = [];
      request.on("data", chunk => chunks.push(chunk));
      request.on("end", () => {
        lastGenerationBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        response.statusCode = 201;
        response.end(JSON.stringify({
          id: "provider-job-1",
          status: "queued",
          status_url: `http://127.0.0.1:${providerPort}/generations/provider-job-1`,
        }));
      });
      return;
    }
    if (request.method === "GET" && request.url === "/generations/provider-job-1") {
      response.end(JSON.stringify({
        id: "provider-job-1",
        status: "succeeded",
        output: "https://cdn.example.com/generated.mp4",
      }));
      return;
    }
    response.end(JSON.stringify({ data: [{ id: "real-video-model" }] }));
  });
  await new Promise(resolve => provider.listen(providerPort, "127.0.0.1", resolve));
  appProcess = spawn(process.execPath, ["server.mjs", "--production"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: String(appPort), FLOWFRAME_DATA_DIR: dataDirectory },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitFor(`http://127.0.0.1:${appPort}/flowframe/`);
});

after(async () => {
  appProcess?.kill("SIGTERM");
  await new Promise(resolve => provider?.close(resolve));
  await rm(dataDirectory, { recursive: true, force: true });
});

test("a fake model ID can never pass verification", async () => {
  const { response, body } = await api("/api/model-connections/verify", {
    method: "POST",
    body: JSON.stringify({
      type: "video",
      provider: "本地服务",
      baseUrl: `http://127.0.0.1:${providerPort}`,
      model: "invented-model",
      apiKey: "secret-key",
      auth: "Bearer Token",
    }),
  });
  assert.equal(response.status, 422);
  assert.equal(body.verified, false);
  assert.match(body.message, /不存在/);
});

test("an exact model match verifies, persists, and never exposes its key", async () => {
  const payload = {
    type: "video",
    name: "My real provider",
    provider: "本地服务",
    baseUrl: `http://127.0.0.1:${providerPort}`,
    model: "real-video-model",
    apiKey: "secret-key",
    auth: "Bearer Token",
    mode: "异步任务",
    verify: true,
  };
  const saved = await api("/api/model-configs", { method: "POST", body: JSON.stringify(payload) });
  assert.equal(saved.response.status, 201);
  assert.equal(saved.body.config.status, "verified");
  assert.equal(saved.body.config.hasApiKey, true);
  assert.equal(JSON.stringify(saved.body).includes("secret-key"), false);

  const listed = await api("/api/model-configs");
  assert.equal(listed.body.configs.length, 1);
  assert.equal(listed.body.configs[0].model, "real-video-model");
  assert.equal(JSON.stringify(listed.body).includes("secret-key"), false);
});

test("external providers cannot target loopback or private networks", async () => {
  const { response, body } = await api("/api/model-connections/verify", {
    method: "POST",
    body: JSON.stringify({
      type: "video",
      provider: "Custom API",
      baseUrl: `https://127.0.0.1:${providerPort}`,
      model: "real-video-model",
      apiKey: "secret-key",
      auth: "Bearer Token",
    }),
  });
  assert.equal(response.status, 422);
  assert.equal(body.verified, false);
  assert.match(body.message, /内网|保留网段/);
});

test("generation jobs are created and completed only from provider responses", async () => {
  const listed = await api("/api/model-configs");
  const modelId = listed.body.configs[0].id;
  const created = await api("/api/jobs", {
    method: "POST",
    body: JSON.stringify({
      modelId,
      prompt: "A verified provider generation",
      ratio: "16:9",
      duration: "5 秒",
      mode: "文生视频",
    }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.job.status, "queued");
  assert.equal(created.body.job.externalId, "provider-job-1");
  assert.equal("statusUrl" in created.body.job, false);

  const refreshed = await api(`/api/jobs/${created.body.job.id}`);
  assert.equal(refreshed.response.status, 200);
  assert.equal(refreshed.body.job.status, "done");
  assert.equal(refreshed.body.job.outputUrl, "https://cdn.example.com/generated.mp4");
});

test("projects and timeline state persist inside one isolated workspace", async () => {
  const created = await api("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      title: "Persistent project",
      image: "https://cdn.example.com/cover.jpg",
      ratio: "16:9",
      timeline: { time: 1.2, clips: 2, tool: "媒体", mediaTab: "项目素材", propertyTab: "基础", removedBg: false },
    }),
  });
  assert.equal(created.response.status, 201);
  const id = created.body.project.id;

  const updated = await api(`/api/projects/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      timeline: { time: 4.8, clips: 5, tool: "音频", mediaTab: "生成记录", propertyTab: "调色", removedBg: true },
    }),
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.project.timeline.clips, 5);
  assert.equal(updated.body.project.timeline.removedBg, true);

  const listed = await api("/api/projects");
  const restored = listed.body.projects.find(project => project.id === id);
  assert.equal(restored.timeline.time, 4.8);
  assert.equal(restored.timeline.tool, "音频");

  const isolatedResponse = await fetch(`http://127.0.0.1:${appPort}/flowframe/api/projects`);
  const isolated = await isolatedResponse.json();
  assert.equal(isolated.projects.length, 0);
});

test("uploaded assets persist and remain private to their workspace", async () => {
  const bytes = Buffer.from("flowframe-test-image");
  const uploadedResponse = await fetch(`http://127.0.0.1:${appPort}/flowframe/api/assets`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/octet-stream",
      "X-File-Name": encodeURIComponent("测试素材.png"),
      "X-File-Type": "image/png",
    },
    body: bytes,
  });
  const uploaded = await uploadedResponse.json();
  assert.equal(uploadedResponse.status, 201);
  assert.equal(uploaded.asset.name, "测试素材.png");
  assert.equal(uploaded.asset.category, "image");

  const content = await fetch(`http://127.0.0.1:${appPort}${uploaded.asset.url}`, {
    headers: { Cookie: cookie },
  });
  assert.equal(content.status, 200);
  assert.equal(content.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await content.arrayBuffer()), bytes);

  const isolated = await fetch(`http://127.0.0.1:${appPort}${uploaded.asset.url}`);
  assert.equal(isolated.status, 404);

  const removed = await api(`/api/assets/${uploaded.asset.id}`, { method: "DELETE" });
  assert.equal(removed.response.status, 200);
  const missing = await fetch(`http://127.0.0.1:${appPort}${uploaded.asset.url}`, {
    headers: { Cookie: cookie },
  });
  assert.equal(missing.status, 404);
});

test("image-to-video requires an owned image and sends its real bytes", async () => {
  const listed = await api("/api/model-configs");
  const modelId = listed.body.configs[0].id;
  const missing = await api("/api/jobs", {
    method: "POST",
    body: JSON.stringify({
      modelId,
      prompt: "Animate this image",
      ratio: "16:9",
      duration: "5 秒",
      mode: "图生视频",
    }),
  });
  assert.equal(missing.response.status, 400);
  assert.match(missing.body.message, /必须上传参考图/);

  const imageBytes = Buffer.from("real-reference-bytes");
  const uploadedResponse = await fetch(`http://127.0.0.1:${appPort}/flowframe/api/assets`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/octet-stream",
      "X-File-Name": "reference.png",
      "X-File-Type": "image/png",
    },
    body: imageBytes,
  });
  const uploaded = await uploadedResponse.json();
  const created = await api("/api/jobs", {
    method: "POST",
    body: JSON.stringify({
      modelId,
      prompt: "Animate this image",
      ratio: "16:9",
      duration: "5 秒",
      mode: "图生视频",
      referenceAssetId: uploaded.asset.id,
    }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(
    lastGenerationBody.input.image,
    `data:image/png;base64,${imageBytes.toString("base64")}`,
  );
});
