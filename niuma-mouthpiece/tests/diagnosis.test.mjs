import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diagnose, redactSensitiveText, sanitizeInput } from "../src/diagnosis.mjs";

describe("diagnose", () => {
  it("classifies deadline ambush complaints", () => {
    const result = diagnose("6 点 58 分老板说有个小需求，明早要，我真的服了", () => 0);
    assert.equal(result.categoryId, "deadline_ambush");
    assert.equal(result.angerType, "临下班投喂型");
    assert.ok(result.angerScore >= 90);
    assert.match(result.roast, /物理时间|小到|明早/);
  });

  it("classifies requirement drift complaints", () => {
    const result = diagnose("甲方说感觉不对，要五彩斑斓的黑，让我再改方向", () => 0.5);
    assert.equal(result.categoryId, "requirement_drift");
    assert.equal(result.title, "混沌需求翻译官");
  });

  it("falls back to emotional stability actor", () => {
    const result = diagnose("今天有点累，但也不知道该说什么", () => 0);
    assert.equal(result.categoryId, "default");
    assert.equal(result.angerType, "精神稳定伪装型");
  });

  it("redacts common sensitive strings", () => {
    const result = redactSensitiveText("电话 13812345678，邮箱 test@example.com");
    assert.equal(result, "电话 [已打码]，邮箱 [已打码]");
  });

  it("sanitizes and trims long input", () => {
    const text = sanitizeInput("<script>" + "很烦".repeat(200));
    assert.ok(!text.includes("<"));
    assert.ok(text.length <= 220);
  });
});
