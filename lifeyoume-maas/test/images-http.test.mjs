import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";

test("image HTTP gateway grants, routes provider keys, meters and revokes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maas-images-http-"));
  let child;
  let calls = 0;
  const upstream = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    assert.equal(request.url, "/v1/images/generations");
    assert.equal(request.headers.authorization, "Bearer isolated-image-key");
    assert.equal(JSON.parse(raw).model, "supplier-image");
    calls++;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ data: [{ url: "https://assets.example.test/image.png" }] }));
  });
  try {
    upstream.listen(0, "127.0.0.1");
    await once(upstream, "listening");
    child = spawn(process.execPath, ["src/server.mjs"], {
      cwd: new URL("..", import.meta.url),
      env: { NODE_ENV: "development", MAAS_PORT: "0",
        MAAS_MASTER_KEY: "isolated-image-http-master-key-over-32-characters",
        MAAS_DATA_PATH: join(directory, "state.json") },
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
      logicalModelId: "http-image", name: "HTTP image", capability: "image.generation",
      providerName: "Image fixture", baseUrl: `http://127.0.0.1:${upstream.address().port}/v1`,
      upstreamModel: "supplier-image", apiKey: "isolated-image-key"
    })).status, 201);
    const { token, key } = await (await request("/api/admin/applications/staffdeck/keys",
      "POST", { name: "image HTTP test" })).json();
    const call = value => request("/v1/images/generations", "POST",
      { model: "http-image", prompt: "private synthetic prompt" }, value);
    assert.equal((await call()).status, 401);
    assert.equal((await call(token)).status, 403);
    assert.equal(calls, 0);
    assert.equal((await request("/api/admin/applications/staffdeck/models", "PUT",
      { allowedModels: ["http-image"], expectedAllowedModels: [] })).status, 200);
    const response = await call(token);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.model, "http-image");
    assert.equal(response.headers.get("x-lifeyoume-request-id"), result.maas.requestId);
    assert.deepEqual(result.data, [{ url: "https://assets.example.test/image.png" }]);
    const usage = await (await request("/api/admin/usage", "GET")).json();
    assert.equal(usage.items[0].capability, "image.generation");
    assert.equal(usage.items[0].outputUnits, 1);
    assert.equal(JSON.stringify(usage).includes("private synthetic prompt"), false);
    assert.equal((await request("/api/admin/applications/staffdeck/models", "PUT",
      { allowedModels: [], expectedAllowedModels: ["http-image"] })).status, 200);
    assert.equal((await call(token)).status, 403);
    assert.equal((await request(`/api/admin/keys/${key.id}`, "DELETE")).status, 200);
    assert.equal((await call(token)).status, 401);
    assert.equal(calls, 1);
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
