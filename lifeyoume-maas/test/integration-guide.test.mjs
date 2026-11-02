import assert from "node:assert/strict";
import test from "node:test";
import { integrationGuide } from "../public/integration-guide.js";

test("integration samples use logical models and MaaS application key placeholders", () => {
  const chat = integrationGuide({ id: "chat-alias", capability: "chat", apiKey: "must-not-leak" }, "https://maas.example.test/path");
  assert.equal(chat.path, "/v1/chat/completions");
  assert.equal(chat.payload.model, "chat-alias");
  assert.equal(chat.payload.stream, false);
  assert.ok(chat.curl.includes("${MAAS_SERVICE_KEY}"));
  assert.ok(chat.curl.includes("https://maas.example.test/v1/chat/completions"));
  assert.equal(chat.curl.includes("must-not-leak"), false);
  const speech = integrationGuide({ id: "lym-tts-realtime", capability: "audio.speech" }, "https://maas.example.test");
  assert.equal(speech.payload.response_format, "wav");
  assert.equal(speech.payload.voice, "voice-1");
  assert.ok(speech.curl.includes("--output speech.wav"));
});
test("unimplemented capabilities do not offer fictional inference samples", () => {
  for (const capability of ["audio.transcription", "video"]) {
    const result = integrationGuide({ id: "new-model", capability }, "https://maas.example.test");
    assert.equal(result.supported, false);
    assert.equal(result.curl, undefined);
  }
});
test("external speech sample requires supplier voice instead of borrowing managed voices", () => {
  const result = integrationGuide({ id: "cloud-tts", capability: "audio.speech" }, "https://maas.example.test");
  assert.equal(result.path, "/v1/audio/speech");
  assert.equal(result.payload.voice, "REPLACE_WITH_SUPPLIER_VOICE_ID");
  assert.ok(result.note.includes("WAV"));
  assert.ok(result.curl.includes("--output speech.wav"));
});
test("embeddings sample uses text batches and float encoding without provider credentials", () => {
  const result = integrationGuide({ id: "vector-alias", capability: "embeddings" }, "https://maas.example.test");
  assert.equal(result.path, "/v1/embeddings");
  assert.deepEqual(result.payload, { model: "vector-alias", input: ["用于检索的示例文本"], encoding_format: "float" });
  assert.ok(result.curl.includes("${MAAS_SERVICE_KEY}"));
});
