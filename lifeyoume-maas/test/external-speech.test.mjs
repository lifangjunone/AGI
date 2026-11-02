import assert from "node:assert/strict";
import test from "node:test";
import { speechSynthesis } from "../src/gateway.mjs";

function fixture() {
  const events = [];
  return {
    state: {
      logicalModels: [{ id: "cloud-tts", enabled: true, capability: "audio.speech", routes: [{ deploymentId: "tts", priority: 1 }] }],
      deployments: [{ id: "tts", providerId: "cloud", upstreamModel: "supplier-tts", enabled: true, timeoutMs: 10000 }],
      providers: [{ id: "cloud", enabled: true, kind: "openai-compatible", baseUrl: "https://speech.test/v1", secretEncrypted: "encrypted" }]
    },
    decrypt: () => "supplier-secret",
    recordUsage: async event => events.push(event), events
  };
}
const auth = { application: { id: "app", allowedModels: ["cloud-tts"] }, key: { id: "app-key" } };
const payload = { model: "cloud-tts", input: "你好", voice: "supplier-voice", speed: 1.2 };

test("external speech uses supplier credential, voice, route and bounded WAV output", async context => {
  const original = globalThis.fetch;
  context.after(() => { globalThis.fetch = original; });
  const store = fixture();
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://speech.test/v1/audio/speech");
    assert.equal(options.headers.authorization, "Bearer supplier-secret");
    assert.equal(options.redirect, "error");
    assert.deepEqual(JSON.parse(options.body), {
      model: "supplier-tts", input: "你好", voice: "supplier-voice", speed: 1.2, response_format: "wav"
    });
    return new Response(Buffer.from("RIFF0000WAVEtest"), { headers: { "content-type": "application/octet-stream" } });
  };
  const result = await speechSynthesis(store, auth, payload);
  assert.equal(result.contentType, "audio/wav");
  assert.equal(result.voice, "supplier-voice");
  assert.equal(store.events[0].status, 200);
  assert.equal(store.events[0].inputUnits, 2);
  assert.equal(JSON.stringify(store.events).includes("你好"), false);
});

test("external speech validates voice/speed before sending and never returns provider errors", async context => {
  const original = globalThis.fetch;
  context.after(() => { globalThis.fetch = original; });
  const store = fixture();
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response("supplier-secret", { status: 401 }); };
  await assert.rejects(() => speechSynthesis(store, auth, { ...payload, voice: "" }), e => e.code === "invalid_voice");
  await assert.rejects(() => speechSynthesis(store, auth, { ...payload, speed: 10 }), e => e.code === "invalid_speed");
  assert.equal(calls, 0);
  await assert.rejects(() => speechSynthesis(store, auth, payload),
    e => e.status === 502 && !e.message.includes("supplier-secret"));
  assert.equal(store.events[0].status, 502);
});

test("external speech rejects non-WAV/oversized audio and sanitizes transport failures", async context => {
  const original = globalThis.fetch;
  context.after(() => { globalThis.fetch = original; });
  for (const response of [new Response("<html>supplier-secret</html>"),
    new Response("x".repeat(16 * 1024 * 1024 + 1))]) {
    const store = fixture();
    globalThis.fetch = async () => response;
    await assert.rejects(() => speechSynthesis(store, auth, payload), e => e.status === 502);
    assert.equal(store.events[0].status, 502);
  }
  globalThis.fetch = async () => { throw new Error("supplier-secret"); };
  await assert.rejects(() => speechSynthesis(fixture(), auth, payload),
    e => e.status === 502 && !e.message.includes("supplier-secret"));
});
