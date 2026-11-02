import assert from "node:assert/strict";
import test from "node:test";
import { previewSpeech, speechSynthesis, testProviderConnection } from "../src/gateway.mjs";

test("speech gateway accepts an absent request signal and returns audio metadata", async (context) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(Buffer.from("RIFF-test"), {
      status: 200,
      headers: {
        "content-type": "audio/wav",
        "x-tts-cache": "bypass",
        "x-tts-voice": "voice-1",
        "x-tts-model": "test-revision"
      }
    });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const store = {
    state: {
      logicalModels: [{
        id: "lym-tts-realtime",
        capability: "audio.speech",
        enabled: true,
        routes: [{ deploymentId: "tts", priority: 1 }]
      }],
      deployments: [{
        id: "tts",
        providerId: "internal",
        upstreamModel: "test",
        enabled: true
      }],
      providers: [{
        id: "internal",
        kind: "internal",
        baseUrl: "http://tts/v1",
        enabled: true
      }]
    },
    recordUsage: async () => {}
  };
  const auth = {
    application: { id: "second-me", allowedModels: ["lym-tts-realtime"] },
    key: { id: "key" }
  };
  const result = await speechSynthesis(store, auth, {
    model: "lym-tts-realtime",
    input: "你好"
  });
  assert.equal(result.status, 200);
  assert.equal(result.contentType, "audio/wav");
  assert.equal(result.cache, "bypass");
  assert.equal(result.voice, "voice-1");
});

test("provider connection test never exposes a credential in failure messages", async (context) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers.authorization, "Bearer provider-secret-value");
    return new Response(JSON.stringify({ error: "provider-secret-value" }), { status: 401 });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const store = {
    state: {
      providers: [{
        id: "provider-ark",
        baseUrl: "https://models.example.test/v1",
        secretEncrypted: "encrypted"
      }],
      deployments: [{
        id: "deployment-chat-primary",
        providerId: "provider-ark",
        upstreamModel: "chat-model"
      }]
    },
    decrypt: () => "provider-secret-value"
  };
  const result = await testProviderConnection(store, {});
  assert.equal(result.ok, false);
  assert.equal(result.message, "Provider returned HTTP 401.");
  assert.equal(JSON.stringify(result).includes("provider-secret-value"), false);
});

test("admin TTS preview validates requests and returns a WAV", async (context) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    assert.equal(payload.voice, "voice-3");
    assert.equal(payload.speed, 1.2);
    return new Response(Buffer.from("RIFF-preview"), {
      status: 200,
      headers: { "content-type": "audio/wav", "x-tts-voice": "voice-3" }
    });
  };
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  const store = {
    state: {
      deployments: [{
        id: "deployment-tts-cpu",
        providerId: "provider-tts-runtime",
        upstreamModel: "test",
        enabled: true
      }],
      providers: [{
        id: "provider-tts-runtime",
        baseUrl: "http://tts/v1",
        enabled: true
      }]
    }
  };
  const result = await previewSpeech(store, { input: "你好", voice: "voice-3", speed: 1.2 });
  assert.equal(result.audio.toString(), "RIFF-preview");
  assert.equal(result.voice, "voice-3");
  await assert.rejects(
    () => previewSpeech(store, { input: "x".repeat(501), voice: "voice-3" }),
    (error) => error.status === 400 && error.code === "invalid_request"
  );
  await assert.rejects(
    () => previewSpeech(store, { input: "你好", voice: "voice-9" }),
    (error) => error.status === 400 && error.code === "invalid_voice"
  );
});
