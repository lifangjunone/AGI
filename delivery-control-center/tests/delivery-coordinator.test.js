const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildCoordination,
  buildDecisionInbox,
  buildDeliveryTeam
} = require("../src/delivery-coordinator");

function runFixture() {
  return {
    id: "OP-TEAM",
    title: "交付小队测试",
    status: "running",
    currentStage: 3,
    updatedAt: "2026-08-17T10:00:00.000Z",
    stages: [
      "需求理解",
      "业务确认",
      "方案设计",
      "开发",
      "测试",
      "交付",
      "部署",
      "验收"
    ],
    tools: {
      selection: { work: "trae-work", code: "trae-code" },
      work: [{ id: "trae-work", name: "Trae Work" }],
      code: [{ id: "trae-code", name: "Trae Code" }]
    },
    supervision: {
      state: "running",
      checkpoint: { stage: 3, stepId: "develop-entry", sequence: 4 },
      tools: {
        work: { capability: "task-aware", processState: "online" },
        code: { capability: "task-aware", processState: "online" }
      },
      incidents: [],
      executionLedger: [
        {
          id: "attempt-1",
          at: "2026-08-17T09:59:00.000Z",
          kind: "start",
          role: "code",
          status: "submitted",
          checkpoint: "develop-entry",
          summary: "开发任务已提交"
        }
      ]
    },
    techIntelligence: {
      status: "completed",
      updatedAt: "2026-08-17T09:58:00.000Z",
      candidates: []
    }
  };
}

test("按交付阶段路由四角色并绑定真实工具", () => {
  const team = buildDeliveryTeam(runFixture());
  assert.equal(team.length, 4);
  assert.equal(
    team.find((member) => member.roleId === "builder").state,
    "active"
  );
  assert.equal(
    team.find((member) => member.roleId === "builder").toolName,
    "Trae Code"
  );
  assert.equal(
    team.find((member) => member.roleId === "researcher").state,
    "completed"
  );
  assert.equal(team[0].employeeId, "OPC-01");
  assert.equal(team[0].employeeName, "领航");
  assert.equal(team[2].roleId, "builder");
  assert.equal(team[2].evidenceCount, 1);
  assert.equal(team[2].latestActivity.summary, "开发任务已提交");
});

test("执行账本保留独立尝试而不是覆盖当前状态", () => {
  const coordination = buildCoordination(runFixture());
  assert.equal(coordination.policy.preserveAttempts, true);
  assert.equal(coordination.policy.resetWorkspaceOnRetry, false);
  assert.equal(coordination.ledger.length, 1);
  assert.equal(coordination.metrics.attempts, 1);
  assert.equal(coordination.trajectory.length, 1);
  assert.equal(coordination.trajectory[0].employeeName, "构建");
  assert.equal(coordination.trajectory[0].stage, 3);
});

test("决策收件箱只聚合未解决异常和许可证阻断", () => {
  const run = runFixture();
  run.supervision.incidents.push({
    id: "incident-1",
    at: "2026-08-17T10:00:00.000Z",
    severity: "high",
    reasonCode: "runtime_offline",
    summary: "Trae Code 已退出",
    action: "自动重启失败，请检查应用",
    resolvedAt: null
  });
  run.techIntelligence.candidates.push({
    canonical_id: "github.com/example/blocked",
    title: "example/blocked",
    license_blocked: true
  });

  const inbox = buildDecisionInbox([run]);
  assert.equal(inbox.length, 2);
  assert.ok(inbox.some((item) => item.code === "runtime_offline"));
  assert.ok(inbox.some((item) => item.code === "license_policy_blocked"));
});
