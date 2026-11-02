import test from "node:test";
import assert from "node:assert/strict";
import { visionMessages } from "../src/vision-input.mjs";
import { chatCompletion } from "../src/gateway.mjs";

const messages = [{ role: "user", content: [
  { type: "text", text: "描述图片", private: "drop" },
  { type: "image_url", image_url: { url: "https://assets.example.test/input.png", detail: "low", private: "drop" } }
] }];
test("vision content whitelists text and image parts without modifying source", () => {
  const result = visionMessages(messages);
  assert.equal(JSON.stringify(result).includes("drop"), false);
  assert.equal(messages[0].content[0].private, "drop");
  assert.equal(result[0].content[1].image_url.detail, "low");
});
test("vision rejects unsafe URLs, unsupported media, MIME mismatch and excessive images", () => {
  for (const url of ["http://assets.test/x", "javascript:alert(1)", "https://user:secret@assets.test/x",
    "data:image/svg+xml;base64,PHN2Zy8+", "data:image/png;base64,YmFk"]) {
    assert.throws(() => visionMessages([{ role: "user", content: [{ type: "image_url", image_url: { url } }] }]),
      error => error.status === 400);
  }
  assert.throws(() => visionMessages([{ role: "user", content: [{ type: "input_audio", data: "x" }] }]));
  assert.throws(() => visionMessages([{ role: "user", content: "text only" }]));
  assert.throws(() => visionMessages([{ role: "user", content: Array(5).fill(messages[0].content[1]) }]));
  assert.throws(() => visionMessages([{ role: "assistant", content: [messages[0].content[1]] }]));
});
test("multimodal route forwards image content using provider Key and meters without input persistence", async context => {
  const original = globalThis.fetch;
  context.after(() => { globalThis.fetch = original; });
  const usage = [];
  const store = { state: {
    logicalModels: [{ id: "vision", enabled: true, capability: "multimodal", routes: [{ deploymentId: "vision", priority: 1 }] }],
    deployments: [{ id: "vision", enabled: true, providerId: "cloud", upstreamModel: "supplier-vlm" }],
    providers: [{ id: "cloud", enabled: true, kind: "openai-compatible", baseUrl: "https://supplier.test/v1", secretEncrypted: "cipher" }]
  }, decrypt: () => "supplier-key", recordUsage: async item => usage.push(item) };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://supplier.test/v1/chat/completions");
    assert.equal(options.headers.authorization, "Bearer supplier-key");
    assert.equal(options.redirect, "error");
    const sent = JSON.parse(options.body);
    assert.equal(sent.model, "supplier-vlm");
    assert.deepEqual(sent.messages, visionMessages(messages));
    return Response.json({ choices: [{ message: { content: "图片描述" } }], usage: { prompt_tokens: 10, completion_tokens: 3 } });
  };
  const auth = { application: { id: "app", allowedModels: ["vision"] }, key: { id: "app-key" } };
  const result = await chatCompletion(store, auth, { model: "vision", messages });
  assert.equal(result.body.model, "vision");
  assert.equal(usage[0].capability, "multimodal");
  assert.equal(usage[0].inputUnits, 10);
  assert.equal(JSON.stringify(usage).includes("input.png"), false);
  await assert.rejects(() => chatCompletion(store, { ...auth, application: { id: "other", allowedModels: [] } },
    { model: "vision", messages }), e => e.status === 403);
});
