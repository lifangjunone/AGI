import test from "node:test";
import assert from "node:assert/strict";
import { testProviderConnection } from "../src/gateway.mjs";
import { createServer } from "node:http";

test("provider test verifies saved and candidate model IDs, not just authentication", async context => {
  const original = globalThis.fetch;
  context.after(() => { globalThis.fetch = original; });
  const store = { state: {
    providers: [{ id: "provider-ark", baseUrl: "https://supplier.test/v1", secretEncrypted: "cipher" }],
    deployments: [{ providerId: "provider-ark", upstreamModel: "retired-id" }]
  }, decrypt: () => "private-key" };
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.redirect, "error");
    return Response.json({ data: [{ id: "current-id" }] });
  };
  const missing = await testProviderConnection(store, {});
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "model_not_listed");
  assert.ok(missing.message.includes("Model ID"));
  const candidate = await testProviderConnection(store, { upstreamModel: "current-id" });
  assert.equal(candidate.ok, true);
  assert.ok(candidate.message.includes("尚未验证实际推理"));
  assert.equal(store.state.deployments[0].upstreamModel, "retired-id");
});

test("provider test fails safely on malformed or oversized model directories", async context => {
  const original = globalThis.fetch;
  context.after(() => { globalThis.fetch = original; });
  const store = { state: {
    providers: [{ id: "provider-ark", baseUrl: "https://supplier.test/v1", secretEncrypted: "cipher" }],
    deployments: [{ providerId: "provider-ark", upstreamModel: "current-id" }]
  }, decrypt: () => "private-key" };
  for (const response of [new Response("private-key"), Response.json({ models: [] }),
    new Response("x".repeat(1024 * 1024 + 1))]) {
    globalThis.fetch = async () => response;
    const result = await testProviderConnection(store, {});
    assert.equal(result.ok, false);
    assert.equal(result.code, "directory_unavailable");
    assert.equal(result.message.includes("private-key"), false);
  }
});

test("shared provider tests resolve the requested deployment and validate ownership", async context => {
  const original = globalThis.fetch;
  context.after(() => { globalThis.fetch = original; });
  const store = { state: {
    providers: [{ id: "p", baseUrl: "https://supplier.test/v1", secretEncrypted: "cipher" }],
    deployments: [{ id: "a", providerId: "p", upstreamModel: "retired" },
      { id: "b", providerId: "p", upstreamModel: "active" },
      { id: "other", providerId: "different", upstreamModel: "active" }]
  }, decrypt: () => "isolated-key" };
  globalThis.fetch = async () => Response.json({ data: [{ id: "active" }] });
  assert.equal((await testProviderConnection(store, {}, undefined, "p", "a")).code, "model_not_listed");
  const target = await testProviderConnection(store, {}, undefined, "p", "b");
  assert.equal(target.code, "model_confirmed");
  assert.equal(target.deploymentId, "b");
  assert.equal(target.inferenceVerified, false);
  await assert.rejects(() => testProviderConnection(store, {}, undefined, "p", "other"));
});

test("model directory verification crosses HTTP without inference or changing credentials", async () => {
  let calls = 0;
  const server = createServer((request, response) => {
    assert.equal(request.method, "GET");
    assert.equal(request.url, "/v1/models");
    assert.equal(request.headers.authorization, "Bearer isolated-directory-key");
    calls++;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ data: [{ id: "active-model" }] }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const store = { state: {
      providers: [{ id: "provider-ark", baseUrl: `http://127.0.0.1:${server.address().port}/v1`, secretEncrypted: "cipher" }],
      deployments: [{ providerId: "provider-ark", upstreamModel: "retired-model" }]
    }, decrypt: () => "isolated-directory-key" };
    assert.equal((await testProviderConnection(store, {})).ok, false);
    assert.equal((await testProviderConnection(store, { upstreamModel: "active-model" })).ok, true);
    assert.equal(calls, 2);
    assert.equal(store.state.deployments[0].upstreamModel, "retired-model");
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
