const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTranslationService,
  deriveRoot,
  translateText,
} = require("./translation.cjs");

test("derives common English affixes", () => {
  assert.match(deriveRoot("translation"), /trans-/);
  assert.match(deriveRoot("translation"), /-tion/);
  assert.match(deriveRoot("unknown"), /un-/);
});

test("returns complete offline word data", async () => {
  const translate = createTranslationService();
  const result = await translate("language");
  assert.equal(result.translation, "语言");
  assert.equal(result.isWord, true);
  assert.ok(result.phonetic);
  assert.ok(result.example);
  assert.equal(result.exampleTranslation, "语言连接着不同文化背景的人们。");
  assert.ok(result.root);
});

test("rejects empty input", async () => {
  const translate = createTranslationService();
  await assert.rejects(() => translate("  "), /没有可翻译/);
});

test("uses the first available translation provider", async () => {
  const calls = [];
  const result = await translateText("hello", [
    { name: "primary", run: async () => {
      calls.push("primary");
      return "你好";
    } },
    { name: "fallback", run: async () => {
      calls.push("fallback");
      return "不应调用";
    } },
  ]);

  assert.equal(result, "你好");
  assert.deepEqual(calls, ["primary"]);
});

test("falls back when the primary translation provider fails", async () => {
  const calls = [];
  const result = await translateText("hello", [
    { name: "primary", run: async () => {
      calls.push("primary");
      throw new Error("primary unavailable");
    } },
    { name: "fallback", run: async () => {
      calls.push("fallback");
      return "你好";
    } },
  ]);

  assert.equal(result, "你好");
  assert.deepEqual(calls, ["primary", "fallback"]);
});
