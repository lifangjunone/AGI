import test from "node:test";
import assert from "node:assert/strict";
import { imageGeneration } from "../src/image-gateway.mjs";

const auth = { application: { id: "app", allowedModels: ["image-alias"] }, key: { id: "key" } };
function fixture() {
  const usage = [];
  return { state: {
    logicalModels: [{ id: "image-alias", enabled: true, capability: "image.generation", routes: [{ deploymentId: "image", priority: 1 }] }],
    deployments: [{ id: "image", enabled: true, providerId: "cloud", upstreamModel: "upstream-image", timeoutMs: 3000 }],
    providers: [{ id: "cloud", enabled: true, kind: "openai-compatible", baseUrl: "https://supplier.test/v1", secretEncrypted: "cipher" }]
  }, decrypt: () => "supplier-secret", recordUsage: async event => usage.push(event), usage };
}
const payload = { model: "image-alias", prompt: "synthetic prompt", n: 1 };
test("images route supplier keys, whitelist request/response and meter image count only", async context => {
  const original = globalThis.fetch;
  context.after(() => { globalThis.fetch = original; });
  const store = fixture();
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://supplier.test/v1/images/generations");
    assert.equal(options.headers.authorization, "Bearer supplier-secret");
    assert.equal(options.redirect, "error");
    assert.deepEqual(JSON.parse(options.body), { model: "upstream-image", prompt: "synthetic prompt", n: 1, response_format: "url" });
    return Response.json({ data: [{ url: "https://assets.test/image.png", revised_prompt: "private text" }], private: "supplier-secret" });
  };
  const result = await imageGeneration(store, auth, { ...payload, user: "private user" });
  assert.deepEqual(result.body.data, [{ url: "https://assets.test/image.png" }]);
  assert.equal(result.body.model, "image-alias");
  assert.equal(JSON.stringify(result).includes("supplier-secret"), false);
  assert.equal(store.usage[0].outputUnits, 1);
  assert.equal(store.usage[0].inputUnits, 0);
  assert.equal(JSON.stringify(store.usage).includes("synthetic prompt"), false);
});
test("image requests reject invalid parameters and unauthorized routes before forwarding", async () => {
  for (const change of [{ prompt: "" }, { n: 5 }, { n: "1" }, { response_format: "svg" },
    { size: "invalid" }, { quality: "invalid" }, { style: "invalid" }]) {
    await assert.rejects(() => imageGeneration(fixture(), auth, { ...payload, ...change }), e => e.status === 400);
  }
  await assert.rejects(() => imageGeneration(fixture(), { ...auth, application: { id: "other", allowedModels: [] } }, payload), e => e.status === 403);
  const store = fixture();
  store.state.logicalModels[0].capability = "chat";
  await assert.rejects(() => imageGeneration(store, auth, payload), e => e.code === "capability_mismatch");
});
test("image result validation rejects unsafe links, HTML/SVG/base64 junk and oversized responses", async context => {
  const original = globalThis.fetch;
  context.after(() => { globalThis.fetch = original; });
  for (const response of [
    Response.json({ data: [{ url: "javascript:alert(1)" }] }),
    Response.json({ data: [{ url: "https://user:secret@assets.test/image" }] }),
    Response.json({ data: [{ b64_json: Buffer.from("<svg/>").toString("base64") }] }),
    Response.json({ data: [] }), new Response("<html>supplier-secret</html>"),
    new Response("x".repeat(16 * 1024 * 1024 + 1)), new Response("supplier-secret", { status: 401 })
  ]) {
    const store = fixture();
    globalThis.fetch = async () => response;
    await assert.rejects(() => imageGeneration(store, auth, payload), e => e.status === 502 && !e.message.includes("supplier-secret"));
    assert.equal(store.usage[0].status, 502);
  }
});
test("images accept base64 raster output and sanitize network, timeout and cancellation errors", async context => {
  const original = globalThis.fetch;
  context.after(() => { globalThis.fetch = original; });
  const png = Buffer.from([137,80,78,71,13,10,26,10]).toString("base64");
  globalThis.fetch = async () => Response.json({ data: [{ b64_json: png }] });
  assert.equal((await imageGeneration(fixture(), auth, { ...payload, response_format: "b64_json" })).body.data[0].b64_json, png);
  for (const [name, expected] of [["Error", 502], ["TimeoutError", 504], ["AbortError", 499]]) {
    const store = fixture();
    const controller = new AbortController();
    if (name === "AbortError") controller.abort();
    globalThis.fetch = async () => { throw new DOMException("supplier-secret", name); };
    await assert.rejects(() => imageGeneration(store, auth, payload, controller.signal),
      e => e.status === expected && !e.message.includes("supplier-secret"));
    assert.equal(store.usage[0].status, expected);
  }
});
