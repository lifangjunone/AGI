import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";

test("external TTS HTTP separates service/provider keys and preserves grant/revoke", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maas-cloud-tts-http-"));
  let child;
  let calls = 0;
  let failure = false;
  const wav = Buffer.from("RIFF0000WAVEsynthetic-audio");
  const upstream = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    assert.equal(request.url, "/v1/audio/speech");
    assert.equal(request.headers.authorization, "Bearer isolated-supplier-key");
    assert.deepEqual(JSON.parse(raw), {
      model: "supplier-speech", input: "合成回归", voice: "supplier-voice",
      speed: 1, response_format: "wav"
    });
    calls++;
    if (failure) {
      response.writeHead(401);
      response.end("isolated-supplier-key");
    } else response.end(wav);
  });
  try {
    upstream.listen(0, "127.0.0.1");
    await once(upstream, "listening");
    child = spawn(process.execPath, ["src/server.mjs"], {
      cwd: new URL("..", import.meta.url),
      env: { NODE_ENV: "development", MAAS_PORT: "0",
        MAAS_MASTER_KEY: "isolated-speech-http-master-key-over-32-characters",
        MAAS_DATA_PATH: join(directory, "state.json"), TTS_INTERNAL_TOKEN: "must-not-reach-cloud" },
      stdio: ["ignore", "pipe", "ignore"]
    });
    const base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("gateway_start_timeout")), 5000);
      child.stdout.on("data", chunk => {
        const match = chunk.toString().match(/listening on (http:\/\/\S+)/);
        if (match) { clearTimeout(timer); resolve(match[1].trim()); }
      });
      child.once("exit", () => { clearTimeout(timer); reject(new Error("gateway_exited")); });
    });
    const request = (path, method, data, token) => fetch(base + path, {
      method, headers: { "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(data ? { body: JSON.stringify(data) } : {})
    });
    assert.equal((await request("/api/admin/models", "POST", {
      logicalModelId: "cloud-speech", name: "External speech", capability: "audio.speech",
      providerName: "Isolated speech", baseUrl: `http://127.0.0.1:${upstream.address().port}/v1`,
      upstreamModel: "supplier-speech", apiKey: "isolated-supplier-key"
    })).status, 201);
    const { token, key } = await (await request("/api/admin/applications/staffdeck/keys",
      "POST", { name: "speech HTTP regression" })).json();
    const call = value => request("/v1/audio/speech", "POST", {
      model: "cloud-speech", input: "合成回归", voice: "supplier-voice"
    }, value);
    assert.equal((await call()).status, 401);
    assert.equal((await call(token)).status, 403);
    assert.equal(calls, 0);
    await request("/api/admin/applications/staffdeck/models", "PUT",
      { allowedModels: ["cloud-speech"], expectedAllowedModels: [] });
    const result = await call(token);
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("content-type"), "audio/wav");
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), wav);
    failure = true;
    const rejected = await call(token);
    assert.equal(rejected.status, 502);
    assert.equal((await rejected.text()).includes("isolated-supplier-key"), false);
    const usage = await (await request("/api/admin/usage", "GET")).json();
    assert.equal(usage.items[0].status, 502);
    assert.equal(usage.items[1].status, 200);
    assert.equal(usage.items[1].inputUnits, 4);
    assert.equal(JSON.stringify(usage).includes("合成回归"), false);
    await request("/api/admin/applications/staffdeck/models", "PUT",
      { allowedModels: [], expectedAllowedModels: ["cloud-speech"] });
    assert.equal((await call(token)).status, 403);
    await request(`/api/admin/keys/${key.id}`, "DELETE");
    assert.equal((await call(token)).status, 401);
    assert.equal(calls, 2);
  } finally {
    if (child && child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
    upstream.closeAllConnections();
    await new Promise(resolve => upstream.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
