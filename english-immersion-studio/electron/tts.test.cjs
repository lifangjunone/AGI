const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSpeechCacheKey,
  escapeXml,
  normalizeFaceAnimation,
  normalizeTimeline,
  rateToPercent
} = require("./tts.cjs");

test("separates lightweight 2D audio from neural face-animation cache entries", () => {
  assert.notEqual(
    createSpeechCacheKey("ava-sweet", "-10%", "Hello", false),
    createSpeechCacheKey("ava-sweet", "-10%", "Hello", true)
  );
});

test("escapes text before inserting it into SSML", () => {
  assert.equal(
    escapeXml('A < B & "safe"'),
    "A &lt; B &amp; &quot;safe&quot;"
  );
});

test("combines learner speed with the voice direction", () => {
  assert.equal(rateToPercent(0.9, -4), "-14%");
  assert.equal(rateToPercent(1.2, -7), "+13%");
});

test("clamps speaking speed to the supported range", () => {
  assert.equal(rateToPercent(0.1, 0), "-30%");
  assert.equal(rateToPercent(2, 0), "+30%");
});

test("normalizes Edge word boundaries for the renderer protocol", () => {
  assert.deepEqual(
    normalizeTimeline([
      { part: " Hello ", start: 105.4, end: 480.7 },
      { part: "", start: 500, end: 520 },
      { part: "world", start: 490, end: 800 }
    ]),
    [
      { text: "Hello", startMs: 105, endMs: 481 },
      { text: "world", startMs: 490, endMs: 800 }
    ]
  );
});

test("accepts complete bounded ARKit animation data", () => {
  assert.deepEqual(
    normalizeFaceAnimation({
      fps: 60,
      duration: 0.05,
      n_frames: 3,
      arkit_raw: {
        JawOpen: [0, 0.7, 0],
        MouthFunnel: [0, 0.2, 0]
      },
      audio_base64: "ignored"
    }),
    {
      fps: 60,
      duration: 0.05,
      n_frames: 3,
      arkit_raw: {
        JawOpen: [0, 0.7, 0],
        MouthFunnel: [0, 0.2, 0]
      }
    }
  );
});

test("rejects inconsistent ARKit animation data", () => {
  assert.equal(
    normalizeFaceAnimation({
      fps: 60,
      duration: 0.05,
      n_frames: 3,
      arkit_raw: { JawOpen: [0, 1] }
    }),
    null
  );
});
