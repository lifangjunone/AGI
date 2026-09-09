import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "novel-platforms-"));
process.env.NOVEL_STUDIO_DATA_DIRECTORY = dataDirectory;
await writeFile(path.join(dataDirectory, "state.json"), JSON.stringify({
  projects: [{ id: "test-project", novelName: "西游记", status: "completed", createdAt: "2026-09-09T00:00:00.000Z" }],
  updatedAt: "2026-09-09T00:00:00.000Z"
}));
await mkdir(path.join(dataDirectory, "output", "test-project"), { recursive: true });
await writeFile(path.join(dataDirectory, "output", "test-project", "episode-001.mp4"), Buffer.from("0123456789abcdef"));
const { startServer } = await import("../server.mjs");
const instance = await startServer({ host: "127.0.0.1", port: 0, quiet: true });
const origin = `http://127.0.0.1:${instance.port}`;

test.after(async () => {
  await new Promise((resolve) => instance.server.close(resolve));
  await rm(dataDirectory, { recursive: true, force: true });
});

test("web, mobile and desktop entrypoints share the production UI", async () => {
  for (const entry of ["/web/", "/mobile/", "/desktop/"]) {
    const response = await fetch(`${origin}${entry}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /长卷制片厂/);
    assert.match(html, /项目工作台/);
    assert.match(html, /推荐小说/);
    assert.match(html, /创建小说项目/);
    assert.match(html, /导入已授权正文/);
  }
});

test("public-domain recommendations API exposes verified popular works", async () => {
  const response = await fetch(`${origin}/api/recommendations`);
  assert.equal(response.status, 200);
  const catalog = await response.json();
  assert.equal(catalog.items.length, 16);
  assert.equal(catalog.verifiedAt, "2026-09-09");
  assert.ok(catalog.items.every((item) => item.requiresAuthorization === false));
  assert.ok(catalog.items.some((item) => item.title === "西游记"));
  assert.ok(catalog.items.some((item) => item.title === "Frankenstein"));
});

test("project center is the default entry before project-scoped tools", async () => {
  const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(source, /let activeView = "projects"/);
  assert.match(source, /PROJECT_VIEWS\.has\(name\) && !activeProject/);
  assert.match(source, /async function openProject/);
  assert.match(source, /setProjectNavigation\(false\)/);
});

test("search-source registry is exposed and safely persisted", async () => {
  const response = await fetch(`${origin}/api/search-sources`);
  assert.equal(response.status, 200);
  const initial = await response.json();
  assert.ok(initial.sources.some((source) => source.id === "qidian"));
  assert.equal(initial.sources.length, 23);
  assert.ok(initial.blockedDomains.includes("cn-qidianzww.com.cn"));
  assert.ok(initial.blockedDomains.includes("hetushu.com"));
  const custom = {
    id: "custom-reading",
    name: "自定义阅读站",
    domains: ["reading.example.com"],
    rights: "rights-review-required",
    enabled: true,
    knownBooks: []
  };
  const updateResponse = await fetch(`${origin}/api/search-sources`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sources: [...initial.sources, custom] })
  });
  assert.equal(updateResponse.status, 200);
  const updated = await updateResponse.json();
  assert.ok(updated.sources.some((source) => source.id === custom.id));
  const persisted = JSON.parse(await readFile(path.join(dataDirectory, "search-sources.json"), "utf8"));
  assert.ok(persisted.sources.some((source) => source.id === custom.id));
});

test("task history and queue telemetry are exposed as lightweight summaries", async () => {
  const [statusResponse, projectsResponse, queueResponse] = await Promise.all([
    fetch(`${origin}/api/status`),
    fetch(`${origin}/api/projects`),
    fetch(`${origin}/api/queue`)
  ]);
  const status = await statusResponse.json();
  const projects = await projectsResponse.json();
  const queue = await queueResponse.json();
  assert.equal(status.queue.maxConcurrency, 2);
  assert.equal(status.models.planning, "glm-5-2-260617");
  assert.equal(status.models.video, "doubao-seedance-2-5-260628");
  assert.equal(status.production.videoCostPerSecondCny, 1.512);
  assert.equal(status.production.estimatedEpisodeVideoCostCny, 1360.8);
  assert.equal(queue.queue.queuedCount, 0);
  assert.equal(projects.projects[0].novelName, "西游记");
  assert.equal("assets" in projects.projects[0], false);
});

test("mobile PWA assets are valid and served with correct types", async () => {
  const manifestResponse = await fetch(`${origin}/manifest.webmanifest`);
  assert.match(manifestResponse.headers.get("content-type"), /application\/manifest\+json/);
  const manifest = await manifestResponse.json();
  assert.equal(manifest.start_url, "/mobile/");
  assert.equal(manifest.display, "standalone");

  const workerResponse = await fetch(`${origin}/mobile-sw.js`);
  assert.equal(workerResponse.status, 200);
  assert.match(await workerResponse.text(), /novel-picture-works-v12/);
});

test("desktop runtime keeps node integration disabled", async () => {
  const source = await readFile(new URL("../apps/desktop/main.mjs", import.meta.url), "utf8");
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(source, /contextIsolation:\s*true/);
  assert.match(source, /nodeIntegration:\s*false/);
  assert.match(source, /sandbox:\s*true/);
  assert.match(source, /NOVEL_STUDIO_DATA_DIRECTORY/);
  assert.ok(packageJson.build.files.includes("config/**/*"));
});

test("production manifest can be exported and downloaded", async () => {
  const exportResponse = await fetch(`${origin}/api/projects/test-project/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  assert.equal(exportResponse.status, 200);
  const { downloadUrl } = await exportResponse.json();
  const downloadResponse = await fetch(`${origin}${downloadUrl}`);
  assert.match(downloadResponse.headers.get("content-disposition"), /attachment/);
  assert.equal((await downloadResponse.json()).novelName, "西游记");
});

test("retry rejects unknown projects instead of reporting false success", async () => {
  const response = await fetch(`${origin}/api/projects/missing/retry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  assert.equal(response.status, 404);
});

test("source confirmation endpoint rejects unknown projects", async () => {
  const response = await fetch(`${origin}/api/projects/missing/source`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceId: "candidate" })
  });
  assert.equal(response.status, 404);
});

test("source rescan endpoint rejects unknown projects", async () => {
  const response = await fetch(`${origin}/api/projects/missing/rescan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  assert.equal(response.status, 404);
});

test("authorized content endpoint rejects unknown projects", async () => {
  const response = await fetch(`${origin}/api/projects/missing/content`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceId: "candidate",
      content: "authorized".repeat(100),
      fileName: "novel.txt",
      rightsConfirmed: true
    })
  });
  assert.equal(response.status, 404);
});

test("generated image proxy blocks untrusted hosts", async () => {
  const response = await fetch(
    `${origin}/api/generated-image?source=${encodeURIComponent("https://example.com/image.jpg")}`
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /不允许代理/);
});

test("invalid novel names are rejected before task creation", async () => {
  const response = await fetch(`${origin}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ novelName: "a" })
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /2-100/);
});

test("generated media supports byte ranges", async () => {
  const response = await fetch(`${origin}/media/output/test-project/episode-001.mp4`, {
    headers: { Range: "bytes=2-5" }
  });
  assert.equal(response.status, 206);
  assert.equal(await response.text(), "2345");
});
