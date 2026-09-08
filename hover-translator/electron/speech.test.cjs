const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createSpeechService, normalizeSpeechText } = require("./speech.cjs");

test("normalizes speech input", () => {
  assert.equal(normalizeSpeechText("  Language\n connects   people.  "), "Language connects people.");
  assert.equal(normalizeSpeechText(""), "");
});

test("uses the English macOS voice and stops previous speech", () => {
  const calls = [];
  const spawn = (command, args, options) => {
    const process = new EventEmitter();
    process.kill = () => {
      process.killed = true;
    };
    calls.push({ command, args, options, process });
    return process;
  };
  const speech = createSpeechService(spawn);

  assert.equal(speech.speak("language"), true);
  assert.deepEqual(calls[0].args, ["-v", "Samantha", "-r", "165", "--", "language"]);
  assert.equal(speech.speak("translation"), true);
  assert.equal(calls[0].process.killed, true);
  speech.stop();
  assert.equal(calls[1].process.killed, true);
});
