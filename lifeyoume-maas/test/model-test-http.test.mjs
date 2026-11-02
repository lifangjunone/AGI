import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { StateStore } from "../src/store.mjs";

test("row HTTP tests ignore candidate IDs, isolate shared models, and reject stale results", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maas-model-http-"));
  let child;
  let release;
  let entered;
  const supplier = createServer(async (_request, response) => {
    if (entered) {
      entered();
      await new Promise(resolve => { release = resolve; });
    }
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ data: [{ id: "active-model" }] }));
  });
  try {
    supplier.listen(0, "127.0.0.1");
    await once(supplier, "listening");
    const masterKey = "isolated-model-http-master-key-longer-than-32-characters";
    const store = new StateStore(join(directory, "state.json"), masterKey);
    await store.load();
    await store.bootstrap({ MAAS_BOOTSTRAP_PROVIDER_API_KEY: "isolated-key",
      MAAS_BOOTSTRAP_PROVIDER_BASE_URL: `http://127.0.0.1:${supplier.address().port}/v1` });
    const first = store.state.deployments.find(item => item.providerId === "provider-ark");
    const provider = store.state.providers.find(item => item.id === "provider-ark");
    provider.baseUrl = `http://127.0.0.1:${supplier.address().port}/v1`;
    first.upstreamModel = "retired-model";
    store.state.deployments.push({ ...first, id: "shared-second", upstreamModel: "active-model" });
    store.state.logicalModels.push({ id: "shared-model", name: "Shared model", capability: "chat",
      enabled: true, routes: [{ deploymentId: "shared-second", priority: 1 }] });
    await store.mutate("fixture", "test", () => {});
    child = spawn(process.execPath, ["src/server.mjs"], {
      cwd: new URL("..", import.meta.url),
      env: { NODE_ENV: "development", MAAS_HOST: "127.0.0.1", MAAS_PORT: "0",
        MAAS_MASTER_KEY: masterKey, MAAS_DATA_PATH: join(directory, "state.json") },
      stdio: ["ignore", "pipe", "ignore"]
    });
    const base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("start_timeout")), 5000);
      child.stdout.on("data", chunk => {
        const match = chunk.toString().match(/listening on (http:\/\/\S+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      child.once("exit", () => { clearTimeout(timer); reject(new Error("gateway_exited")); });
    });
    const request = (path, method, payload) => fetch(base + path, {
      method, headers: { "content-type": "application/json" },
      ...(payload ? { body: JSON.stringify(payload) } : {})
    });
    const firstModel = store.state.logicalModels.find(item => item.routes[0]?.deploymentId === first.id);
    const call = (id, payload = {}) => request(`/api/admin/models/${id}/test`, "POST", payload);
    const firstResult = await (await call(firstModel.id, { upstreamModel: "active-model" })).json();
    assert.equal(firstResult.code, "model_not_listed");
    assert.equal((await (await call("shared-model")).json()).code, "model_confirmed");
    const state = await (await request("/api/admin/state", "GET")).json();
    assert.equal(state.deployments.find(item => item.id === first.id).lastTestCode, "model_not_listed");
    assert.equal(state.deployments.find(item => item.id === "shared-second").lastTestCode, "model_confirmed");
    const waiting = new Promise(resolve => { entered = resolve; });
    const pending = call("shared-model");
    await waiting;
    assert.equal((await request("/api/admin/models/shared-model", "PUT", {
      name: "Shared model", providerName: provider.name, baseUrl: provider.baseUrl,
      upstreamModel: "changed-during-test"
    })).status, 200);
    release();
    assert.equal((await pending).status, 409);
    const after = await (await request("/api/admin/state", "GET")).json();
    assert.equal(after.deployments.find(item => item.id === "shared-second").lastTestCode, undefined);
  } finally {
    release?.();
    if (child && child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
    supplier.closeAllConnections();
    await new Promise(resolve => supplier.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
