const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeResult,
  requirementProjectPayload
} = require("../src/technology-advisory");

const providerResult = {
  jobId: "oneopc-test",
  state: "completed",
  generatedAt: "2026-08-15T08:00:00.000Z",
  recommendation: "example/work-orders",
  summary: "发现 1 个候选",
  candidates: [
    {
      fullName: "example/work-orders",
      url: "https://github.com/example/work-orders",
      cloneUrl: "https://github.com/example/work-orders.git",
      description: "Maintenance work order workflow",
      fitScore: 82,
      matchedTerms: ["cmms", "work-order"],
      license: "MIT",
      licenseBlocked: false,
      verdict: "小范围试用",
      coveragePercent: 83,
      confidenceLabel: "证据充分",
      plainDescription: "面向设备检修工单的社区项目",
      plainExplanation: "覆盖工单和设备维护能力",
      adoptionAdvice: "先做原型验证",
      implementationPlan: [{ stage: "验证", title: "跑通场景" }],
      riskNotes: ["需要真实数据验证"],
      sourceSignals: [
        { source: "GitHub Search", evidence: "实时仓库检索" }
      ]
    }
  ]
};

test("Provider 和 Computer Use 共用同一结果规范化逻辑", () => {
  const baseContext = {
    runId: "OP-TEST",
    mode: "smart",
    profile: { capabilities: ["work order"] },
    fallbackUsed: false,
    fallbackReason: null,
    startedAt: "2026-08-15T07:59:00.000Z"
  };
  const provider = normalizeResult(providerResult, {
    ...baseContext,
    requestedTransport: "provider_api",
    actualTransport: "provider_api"
  });
  const computerUse = normalizeResult(providerResult, {
    ...baseContext,
    requestedTransport: "computer_use",
    actualTransport: "computer_use"
  });

  assert.deepEqual(provider.candidates, computerUse.candidates);
  assert.deepEqual(provider.recommendation, computerUse.recommendation);
  assert.equal(provider.candidates[0].decision, "trial");
  assert.equal(provider.candidates[0].license, "MIT");
  assert.equal(provider.candidates[0].coverage_percent, 83);
  assert.equal(provider.candidates[0].confidence_label, "证据充分");
  assert.equal(provider.candidates[0].implementation_plan.length, 1);
  assert.deepEqual(provider.candidates[0].risk_notes, ["需要真实数据验证"]);
  assert.equal(provider.actual_transport, "provider_api");
  assert.equal(computerUse.actual_transport, "computer_use");
});

test("显式保留请求通道、实际通道和降级原因", () => {
  const result = normalizeResult(providerResult, {
    runId: "OP-TEST",
    mode: "smart",
    profile: {},
    requestedTransport: "computer_use",
    actualTransport: "provider_api",
    fallbackUsed: true,
    fallbackReason: "accessibility_missing",
    startedAt: "2026-08-15T07:59:00.000Z"
  });
  assert.equal(result.requested_transport, "computer_use");
  assert.equal(result.actual_transport, "provider_api");
  assert.equal(result.fallback_used, true);
  assert.equal(result.fallback_reason, "accessibility_missing");
});

test("新项目中心请求保留业务领域和需求能力", () => {
  const project = requirementProjectPayload({
    requirementProfile: {
      businessDomain: "设备运维",
      summary: "设备检修工单管理",
      capabilities: ["工单", "审批", "状态流转"]
    }
  });

  assert.equal(project.name, "设备检修工单管理");
  assert.equal(project.businessDomain, "设备运维");
  assert.deepEqual(project.capabilities, ["工单", "审批", "状态流转"]);
  assert.equal(project.status, "active");
});
