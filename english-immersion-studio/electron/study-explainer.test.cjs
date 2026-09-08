const test = require("node:test");
const assert = require("node:assert/strict");
const {
  limitSpokenWords,
  localStudyExplanation,
  maxWordsByLevel,
  normalizeLevel,
  parseExplanationContent,
  stripTeachingPrefix
} = require("./study-explainer.cjs");

test("accepts CEFR A1 through C2 and rejects unsupported levels", () => {
  for (const level of ["A1", "A2", "B1", "B2", "C1", "C2"]) {
    assert.equal(normalizeLevel(level), level);
  }
  assert.equal(normalizeLevel("expert"), "A2");
});

test("creates a usable local graded explanation", () => {
  const answer = localStudyExplanation({
    level: "A1",
    title: "opportunity",
    meaning: "a good chance",
    context: "Thank you for giving me the opportunity."
  });
  assert.equal(answer.source, "local");
  assert.equal(answer.level, "A1");
  assert.equal(answer.scriptSentences.length, 4);
  assert.match(answer.scriptSentences.join(" "), /opportunity/);
  assert.ok(
    answer.scriptSentences.every(
      (sentence) => sentence.split(/\s+/).length <= maxWordsByLevel.A1
    )
  );
});

test("normalizes a structured AI explanation", () => {
  const answer = parseExplanationContent(
    JSON.stringify({
      title: "A1 word lesson",
      scriptSentences: [
        "This word means a good chance.",
        "Use it for a helpful possibility.",
        "This opportunity can help me grow.",
        "Now repeat: opportunity."
      ],
      chineseSummary: "表示一个好机会。",
      keyPoints: [{ english: "a good chance", chinese: "一个好机会" }],
      checkQuestion: "What does it mean?",
      checkAnswer: "A good chance."
    }),
    "test-model",
    "A1"
  );
  assert.equal(answer.source, "ai");
  assert.equal(answer.model, "test-model");
  assert.equal(answer.level, "A1");
  assert.equal(answer.keyPoints.length, 1);
});

test("limits every generated step and rejects incomplete lessons", () => {
  assert.equal(
    limitSpokenWords("one two three four five six", 4),
    "one two three four."
  );
  assert.throws(
    () =>
      parseExplanationContent(
        JSON.stringify({
          scriptSentences: ["Meaning.", "Usage.", "Example."]
        }),
        "test-model",
        "B2"
      ),
    /exactly four/
  );
});

test("rejects Chinese text inside the English narration track", () => {
  assert.throws(
    () =>
      parseExplanationContent(
        JSON.stringify({
          scriptSentences: [
            "It means 好的 in Chinese.",
            "Use it in a greeting.",
            "Good morning, Daniel.",
            "Now repeat: good."
          ]
        }),
        "test-model",
        "A1"
      ),
    /English-only/
  );
});

test("removes robotic step labels and repeats the authentic sentence", () => {
  assert.equal(
    stripTeachingPrefix("3. Authentic example: Good morning, Daniel."),
    "Good morning, Daniel."
  );
  const answer = parseExplanationContent(
    JSON.stringify({
      scriptSentences: [
        "1. Meaning: It describes something positive.",
        "2. Usage: Use it before a noun.",
        "3. Example: Good morning, Daniel.",
        "4. Please repeat the sentence."
      ]
    }),
    "test-model",
    "C1",
    { title: "good", context: "Good morning, Daniel." }
  );
  assert.equal(answer.scriptSentences[0], "It describes something positive.");
  assert.equal(answer.scriptSentences[3], "Good morning, Daniel.");
});
