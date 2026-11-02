import test from "node:test";
import assert from "node:assert/strict";
import { chatCompletion } from "../src/gateway.mjs";

const auth = { application: { id: "app", allowedModels: ["chat"] }, key: { id: "key" } };
function fixture() {
  const events = [];
  return { state: {
    logicalModels: [{ id: "chat", enabled: true, capability: "chat", routes: [{ deploymentId: "chat", priority: 1 }] }],
    deployments: [{ id: "chat", enabled: true, providerId: "cloud", upstreamModel: "supplier-chat", timeoutMs: 3000 }],
    providers: [{ id: "cloud", enabled: true, kind: "openai-compatible", baseUrl: "https://supplier.test/v1", secretEncrypted: "encrypted" }]
  }, decrypt: () => "test-provider-secret", recordUsage: async event => events.push(event), events };
}
const payload = { model: "chat", messages: [{ role: "user", content: "test" }] };

test("chat rejects malformed/oversized upstream responses and records failure", async context => {
  const original = globalThis.fetch;
  context.after(() => { globalThis.fetch = original; });
  for (const response of [
    new Response("test-provider-secret", { status: 401 }),
    new Response("not JSON"),
    Response.json({ choices: [] }),
    Response.json(null),
    new Response("x".repeat(8 * 1024 * 1024 + 1))
  ]) {
    const store = fixture();
    globalThis.fetch = async () => response;
    await assert.rejects(() => chatCompletion(store, auth, payload),
      error => error.status === 502 && !error.message.includes("test-provider-secret"));
    assert.equal(store.events[0].status, 502);
  }
});

test("chat transport timeout and cancellation are safe and metered", async context => {
  const original = globalThis.fetch;
  context.after(() => { globalThis.fetch = original; });
  for (const [name, expected] of [["Error", 502], ["TimeoutError", 504], ["AbortError", 499]]) {
    const store = fixture();
    const controller = new AbortController();
    if (name === "AbortError") controller.abort();
    globalThis.fetch = async () => { throw new DOMException("test-provider-secret", name); };
    await assert.rejects(() => chatCompletion(store, auth, payload, controller.signal),
      error => error.status === expected && !error.message.includes("test-provider-secret"));
    assert.equal(store.events[0].status, expected);
  }
});
