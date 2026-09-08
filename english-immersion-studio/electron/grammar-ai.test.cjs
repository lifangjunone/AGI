const test = require("node:test");
const assert = require("node:assert/strict");
const {
  localGrammarAnswer,
  parseEnv,
  parseModelContent
} = require("./grammar-ai.cjs");

test("parses local env files without exposing values to the renderer", () => {
  assert.deepEqual(parseEnv("ARK_API_KEY=secret\nARK_TEXT_MODEL='model-id'\n"), {
    ARK_API_KEY: "secret",
    ARK_TEXT_MODEL: "model-id"
  });
});

test("explains by plus gerund as a method or first step", () => {
  const answer = localGrammarAnswer({
    sentence: "Could you begin by telling me about your current role?",
    question: "为什么这里需要 by？"
  });
  assert.match(answer.summary, /通过某种方式/);
  assert.match(answer.explanation, /第一步/);
  assert.match(answer.contrast, /begin telling/);
  assert.equal(answer.examples.length, 2);
});

test("normalizes structured model output", () => {
  const answer = parseModelContent(
    '```json\n{"summary":"结论","grammarRole":"作用","explanation":"解释","contrast":"对比","examples":[{"english":"Example.","chinese":"例句。"}],"tip":"提示"}\n```',
    "test-model"
  );
  assert.equal(answer.source, "ai");
  assert.equal(answer.model, "test-model");
  assert.equal(answer.examples[0].chinese, "例句。");
});
