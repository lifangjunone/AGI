const test = require("node:test");
const assert = require("node:assert/strict");
const { escapeXml, rateToPercent } = require("./tts.cjs");

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
