import assert from "node:assert/strict";
import test from "node:test";
import { embeddings } from "../src/gateway.mjs";

const fixture = () => {
  const events = [];
  return {
    state: {
      logicalModels: [{ id: "vector-alias", capability: "embeddings", enabled: true, routes: [{ deploymentId: "vector", priority: 1 }] }],
      deployments: [{ id: "vector", providerId: "cloud", upstreamModel: "private-upstream", enabled: true, timeoutMs: 3000 }],
      providers: [{ id: "cloud", kind: "openai-compatible", baseUrl: "https://vectors.test/v1", enabled: true, secretEncrypted: "encrypted" }]
    },
    decrypt: () => "provider-secret",
    recordUsage: async event => events.push(event), events
  };
};
const auth = { application: { id: "app", allowedModels: ["vector-alias"] }, key: { id: "service-key" } };

test("embeddings routes text batches with isolated keys, whitelist output and metering", async context => {
  const original = globalThis.fetch;
  context.after(() => { globalThis.fetch = original; });
  const store = fixture();
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://vectors.test/v1/embeddings");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.authorization, "Bearer provider-secret");
    assert.deepEqual(JSON.parse(options.body), { model: "private-upstream", input: ["one", "two"], encoding_format: "float", dimensions: 2 });
    return Response.json({ data: [
      { index: 1, embedding: [0.1, 0.2], secret: "provider-secret" },
      { index: 0, embedding: [0.3, 0.4] }
    ], usage: { total_tokens: 7 }, private: "provider-secret" });
  };
  const result = await embeddings(store, auth, { model: "vector-alias", input: ["one", "two"], dimensions: 2, user: "private-user" });
  assert.equal(result.body.model, "vector-alias");
  assert.deepEqual(result.body.data.map(item => item.index), [0, 1]);
  assert.equal(result.body.usage.total_tokens, 7);
  assert.equal(JSON.stringify(result).includes("provider-secret"), false);
  assert.equal(store.events[0].inputUnits, 7);
  assert.equal(store.events[0].status, 200);
  assert.equal(JSON.stringify(store.events).includes("one"), false);
  assert.equal("embedding" in store.events[0], false);
});

test("embeddings rejects invalid inputs and unauthorized/capability/disabled routes before fetch", async () => {
  const store = fixture();
  for (const input of ["", [], [1, 2], [" "], "x".repeat(100001), Array(129).fill("x")]) {
    await assert.rejects(() => embeddings(store, auth, { model: "vector-alias", input }), e => e.status === 400);
  }
  await assert.rejects(() => embeddings(store, auth, { model: "vector-alias", input: "x", encoding_format: "base64" }), e => e.status === 400);
  await assert.rejects(() => embeddings(store, auth, { model: "vector-alias", input: "x", dimensions: 0 }), e => e.status === 400);
  await assert.rejects(() => embeddings(store, { ...auth, application: { id: "app", allowedModels: [] } }, { model: "vector-alias", input: "x" }), e => e.status === 403);
  store.state.logicalModels[0].capability = "chat";
  await assert.rejects(() => embeddings(store, auth, { model: "vector-alias", input: "x" }), e => e.code === "capability_mismatch");
  store.state.logicalModels[0].enabled = false;
  await assert.rejects(() => embeddings(store, auth, { model: "vector-alias", input: "x" }), e => e.status === 404);
  assert.equal(store.events.length, 0);
});

test("embedding errors never leak provider text and invalid vectors fail rather than returning success", async context => {
  const original = globalThis.fetch;
  context.after(() => { globalThis.fetch = original; });
  for (const response of [
    new Response("provider-secret", { status: 401 }),
    new Response("provider-secret", { status: 200 }),
    Response.json({ data: [{ index: 0, embedding: ["bad"] }] }),
    Response.json({ data: [{ index: 0, embedding: [] }] }),
    Response.json({ data: [] }),
    new Response("x".repeat(8 * 1024 * 1024 + 1))
  ]) {
    const store = fixture();
    globalThis.fetch = async () => response;
    await assert.rejects(() => embeddings(store, auth, { model: "vector-alias", input: "x" }),
      e => e.status === 502 && !e.message.includes("provider-secret"));
    assert.equal(store.events[0].status, 502);
  }
  const store = fixture();
  globalThis.fetch = async () => { throw new Error("provider-secret"); };
  await assert.rejects(() => embeddings(store, auth, { model: "vector-alias", input: "x" }),
    e => e.status === 502 && !e.message.includes("provider-secret"));
});

test("embedding deadlines and cancellation have safe metered outcomes", async context => {
  const original = globalThis.fetch;
  context.after(() => { globalThis.fetch = original; });
  const timeoutStore = fixture();
  globalThis.fetch = async () => { throw new DOMException("private detail", "TimeoutError"); };
  await assert.rejects(() => embeddings(timeoutStore, auth, { model: "vector-alias", input: "x" }),
    e => e.status === 504 && e.code === "embedding_timeout");
  assert.equal(timeoutStore.events[0].status, 504);
  const cancelledStore = fixture();
  const controller = new AbortController();
  controller.abort();
  globalThis.fetch = async () => { throw new DOMException("private detail", "AbortError"); };
  await assert.rejects(() => embeddings(cancelledStore, auth,
    { model: "vector-alias", input: "x" }, controller.signal),
    e => e.status === 499 && e.code === "embedding_cancelled");
  assert.equal(cancelledStore.events[0].status, 499);
});
