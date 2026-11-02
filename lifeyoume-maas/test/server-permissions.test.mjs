import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("HTTP gateway forwards a completed request body and honors grant/revoke", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "maas-http-"));
  let calls = 0;
  const mock = createServer(async (req, res) => {
    let value = "";
    for await (const chunk of req) value += chunk;
    const payload = JSON.parse(value);
    assert.ok(["upstream-test", "upstream-vision"].includes(payload.model));
    if (payload.model === "upstream-vision") {
      assert.equal(payload.messages[0].content[1].type, "image_url");
      assert.equal(payload.messages[0].content[1].image_url.url, "https://assets.example.test/vision.png");
    }
    assert.equal(req.headers.authorization, "Bearer fake-provider-key");
    calls++;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: "ok" } }] }));
  });
  await new Promise(resolve => mock.listen(0, "127.0.0.1", resolve));
  context.after(() => mock.close());
  const child = spawn(process.execPath, ["src/server.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env, NODE_ENV: "development", MAAS_PORT: "0",
      MAAS_MASTER_KEY: "http-regression-test-key-over-32-characters",
      MAAS_DATA_PATH: join(directory, "state.json")
    }, stdio: ["ignore", "pipe", "ignore"]
  });
  context.after(() => child.kill("SIGTERM"));
  // Port zero must report the actual ephemeral port.
  const base = await new Promise((resolve, reject) => {
    child.stdout.on("data", chunk => {
      const match = chunk.toString().match(/listening on (http:\/\/\S+)/);
      if (match) resolve(match[1].trim());
    });
    child.once("exit", () => reject(new Error("test server exited")));
  });
  const request = (path, method, data, token) => fetch(`${base}${path}`, {
    method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {})
  });
  assert.equal((await request("/api/admin/models", "POST", {
    logicalModelId: "http-chat", name: "HTTP chat", capability: "chat",
    providerName: "Mock", baseUrl: `http://127.0.0.1:${mock.address().port}/v1`,
    upstreamModel: "upstream-test", apiKey: "fake-provider-key"
  })).status, 201);
  const { token } = await (await request("/api/admin/applications/staffdeck/keys", "POST", { name: "test" })).json();
  const call = () => request("/v1/chat/completions", "POST",
    { model: "http-chat", messages: [{ role: "user", content: "test" }] }, token);
  assert.equal((await call()).status, 403);
  assert.equal((await request("/api/admin/applications/staffdeck/models", "PUT",
    { allowedModels: ["http-chat"], expectedAllowedModels: [] })).status, 200);
  const result = await call();
  assert.equal(result.status, 200);
  assert.equal((await result.json()).model, "http-chat");
  assert.equal(calls, 1);
  assert.equal((await request("/api/admin/applications/staffdeck/models", "PUT",
    { allowedModels: [], expectedAllowedModels: ["http-chat"] })).status, 200);
  assert.equal((await call()).status, 403);
  assert.equal(calls, 1);
  assert.equal((await request("/api/admin/models", "POST", {
    logicalModelId: "http-vision", name: "HTTP vision", capability: "multimodal",
    providerName: "Vision mock", baseUrl: `http://127.0.0.1:${mock.address().port}/v1`,
    upstreamModel: "upstream-vision", apiKey: "fake-provider-key"
  })).status, 201);
  const visionPayload = { model: "http-vision", messages: [{ role: "user", content: [
    { type: "text", text: "describe" },
    { type: "image_url", image_url: { url: "https://assets.example.test/vision.png" } }
  ] }] };
  const visionCall = () => request("/v1/chat/completions", "POST", visionPayload, token);
  assert.equal((await request("/v1/chat/completions", "POST", visionPayload)).status, 401);
  assert.equal((await visionCall()).status, 403);
  assert.equal((await request("/api/admin/applications/staffdeck/models", "PUT",
    { allowedModels: ["http-vision"], expectedAllowedModels: [] })).status, 200);
  const visionResponse = await visionCall();
  assert.equal(visionResponse.status, 200);
  assert.equal((await visionResponse.json()).model, "http-vision");
  const usage = await (await request("/api/admin/usage", "GET")).json();
  assert.equal(usage.items[0].capability, "multimodal");
  assert.equal(JSON.stringify(usage).includes("vision.png"), false);
  assert.equal((await request("/api/admin/applications/staffdeck/models", "PUT",
    { allowedModels: [], expectedAllowedModels: ["http-vision"] })).status, 200);
  assert.equal((await visionCall()).status, 403);
  assert.equal(calls, 2);
});
