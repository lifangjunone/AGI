import test from "node:test";
import assert from "node:assert/strict";
import { assessProject, getAssessmentCatalog } from "./assessment.mjs";
import { mapTradeStatus, normalizeAmount } from "./alipay.mjs";

const catalog = getAssessmentCatalog();

function answersWith(score) {
  return Object.fromEntries(catalog.questions.map((question) => [question.id, score]));
}

test("all mature answers produce a 100 score", () => {
  const result = assessProject(answersWith(3));
  assert.equal(result.overall, 100);
  assert.equal(result.level.key, "controlled");
  assert.equal(result.dimensions.length, 6);
  assert.equal(result.fullReport.sevenDayPlan.length, 3);
});

test("all weak answers produce a critical report with three priorities", () => {
  const result = assessProject(answersWith(0));
  assert.equal(result.overall, 0);
  assert.equal(result.level.key, "critical");
  assert.equal(result.topRisks.length, 3);
  assert.ok(result.preview.immediateAction.length > 10);
});

test("assessment rejects missing or out-of-range answers", () => {
  assert.throws(() => assessProject({}), /invalid answer/);
  const answers = answersWith(3);
  answers["value-outcome"] = 9;
  assert.throws(() => assessProject(answers), /invalid answer/);
});

test("payment amount and trade status mapping use exact semantics", () => {
  assert.equal(normalizeAmount("199"), "199.00");
  assert.equal(normalizeAmount("199.0"), "199.00");
  assert.equal(normalizeAmount("199.001"), null);
  assert.equal(mapTradeStatus("TRADE_SUCCESS"), "PAID");
  assert.equal(mapTradeStatus("WAIT_BUYER_PAY"), "PENDING_PAYMENT");
  assert.equal(mapTradeStatus("unexpected"), "UNKNOWN");
});
