const {
  DEFAULT_EMPLOYEES,
  hydrateEmployee,
  selectProjectTeam
} = require("./digital-employees");

const ROLE_BLUEPRINT = Object.freeze(
  DEFAULT_EMPLOYEES.map((employee) => hydrateEmployee(employee))
);

function selectedTool(run, role) {
  const selectedId = run.tools?.selection?.[role];
  return (run.tools?.[role] || []).find((tool) => tool.id === selectedId) || null;
}

function roleForStage(stage, eventType = "") {
  if (
    eventType.startsWith("intelligence.") ||
    eventType.startsWith("tech_intelligence.") ||
    eventType.startsWith("technology.") ||
    eventType.includes("codegraph")
  ) {
    return "researcher";
  }
  if (eventType.startsWith("test.") || eventType.includes("verification")) {
    return "verifier";
  }
  if ([3, 5, 6].includes(Number(stage))) return "builder";
  if ([4].includes(Number(stage))) return "verifier";
  return "conductor";
}

function roleState(run, role) {
  const stage = Number(run.currentStage || 0);
  const supervision = run.supervision || {};
  if (run.status === "completed") return "completed";
  if (run.status === "cancelled") return "cancelled";
  if (run.status === "failed") return "blocked";
  if (role.roleId === "researcher") {
    const status = run.techIntelligence?.status;
    if (status === "completed") return "completed";
    if (status === "running") return "active";
  }
  if (!role.stages.includes(stage)) {
    const hasFutureWork = role.stages.some((candidate) => candidate > stage);
    return hasFutureWork ? "standby" : "completed";
  }
  if (["stalled", "failed"].includes(supervision.state)) return "blocked";
  if (supervision.state === "recovering") return "recovering";
  if (supervision.state === "running") return "active";
  return "queued";
}

function roleAssignment(run, role) {
  const stage = Number(run.currentStage || 0);
  if (role.stages.includes(stage)) {
    return run.stages?.[stage] || `阶段 ${stage + 1}`;
  }
  const next = role.stages.find((candidate) => candidate > stage);
  if (next !== undefined) {
    return `等待 ${run.stages?.[next] || `阶段 ${next + 1}`}`;
  }
  return "本轮职责已完成";
}

function buildDeliveryTeam(run, employees = ROLE_BLUEPRINT) {
  const ledger = buildExecutionLedger(run);
  return selectProjectTeam(
    employees,
    run.team?.employeeIds || [],
    `${run.title || ""} ${run.input?.name || ""}`
  ).map((role) => {
    const tool = role.toolRole ? selectedTool(run, role.toolRole) : null;
    const health = role.toolRole
      ? run.supervision?.tools?.[role.toolRole]
      : null;
    const state = roleState(run, role);
    const latestActivity = [...ledger]
      .reverse()
      .find(
        (entry) =>
          entry.role === role.roleId ||
          (role.toolRole && entry.role === role.toolRole)
      );
    return {
      ...role,
      employeeId: role.id,
      employeeName: role.name,
      name: role.roleName,
      toolId: tool?.id || null,
      toolName: tool?.name || role.virtualTool,
      capability: health?.capability || (role.virtualTool ? "native-service" : "unavailable"),
      processState:
        health?.processState ||
        (role.roleId === "researcher" && run.techIntelligence?.status === "running"
          ? "active"
          : "ready"),
      state,
      latestActivity: latestActivity
        ? {
            at: latestActivity.at,
            summary: latestActivity.summary,
            status: latestActivity.status
          }
        : null,
      evidenceCount: ledger.filter(
        (entry) =>
          entry.role === role.roleId ||
          (role.toolRole && entry.role === role.toolRole)
      ).length,
      assignment:
        state === "completed" && role.roleId === "researcher"
          ? "技术参考与代码证据已归档"
          : roleAssignment(run, role)
    };
  });
}

function buildExecutionLedger(run) {
  const persisted = run.supervision?.executionLedger || [];
  if (persisted.length > 0) return persisted;
  return (run.events || []).map((event, index) => ({
    id: `${run.id}-event-${index}`,
    at: event.at,
    kind: event.type,
    role: roleForStage(event.stage, event.type),
    status: event.type?.includes("failed") ? "failed" : "recorded",
    checkpoint: run.supervision?.checkpoint?.stepId || null,
    summary: event.summary,
    reasonCode: null
  }));
}

function buildDecisionInbox(runs) {
  const decisions = [];
  for (const run of runs) {
    const supervision = run.supervision || {};
    for (const incident of supervision.incidents || []) {
      if (incident.resolvedAt) continue;
      decisions.push({
        id: incident.id,
        runId: run.id,
        runTitle: run.title,
        severity: incident.severity || "high",
        code: incident.reasonCode || incident.code,
        summary: incident.summary,
        action: incident.action,
        stage: run.stages?.[supervision.checkpoint?.stage] || "交付执行",
        at: incident.at
      });
    }
    if (
      ["stalled", "failed"].includes(supervision.state) &&
      !decisions.some((item) => item.runId === run.id)
    ) {
      decisions.push({
        id: `${run.id}-state-${supervision.updatedAt || run.updatedAt}`,
        runId: run.id,
        runTitle: run.title,
        severity: "high",
        code: supervision.recovery?.lastReason || "delivery_stalled",
        summary: "交付任务无法继续自动推进",
        action: "检查失败原因，修复后从当前检查点重试",
        stage: run.stages?.[supervision.checkpoint?.stage] || "交付执行",
        at: supervision.updatedAt || run.updatedAt
      });
    }
    for (const candidate of run.techIntelligence?.candidates || []) {
      if (!candidate.license_blocked) continue;
      decisions.push({
        id: `${run.id}-license-${candidate.canonical_id}`,
        runId: run.id,
        runTitle: run.title,
        severity: "medium",
        code: "license_policy_blocked",
        summary: `${candidate.title} 被许可证策略阻断`,
        action: "保留为参考，不进入代码复用和 CodeGraph 验证",
        stage: "方案设计",
        at: run.techIntelligence.updatedAt || run.updatedAt
      });
    }
  }
  return decisions.sort((left, right) =>
    String(right.at || "").localeCompare(String(left.at || ""))
  );
}

function buildTrajectory(run, team) {
  const byRole = new Map(team.map((employee) => [employee.roleId, employee]));
  const eventEntries = (run.events || []).map((event, index) => ({
    id: `${run.id}-event-${index}`,
    at: event.at,
    kind: event.type,
    role: roleForStage(event.stage, event.type),
    status: event.type?.includes("failed") ? "failed" : "recorded",
    stage: Number(event.stage || 0),
    summary: event.summary,
    checkpoint: null
  }));
  const entries = [...eventEntries, ...(run.supervision?.executionLedger || [])]
    .filter(
      (entry, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.at === entry.at &&
            candidate.kind === entry.kind &&
            candidate.summary === entry.summary
        ) === index
    )
    .sort((left, right) => String(left.at || "").localeCompare(String(right.at || "")));
  return entries.map((entry, index) => {
    const roleId = entry.role === "work"
      ? "conductor"
      : entry.role === "code"
        ? "builder"
        : entry.role;
    const employee = byRole.get(roleId) || team[0];
    return {
      id: entry.id || `${run.id}-trajectory-${index}`,
      at: entry.at,
      employeeId: employee?.employeeId || null,
      employeeName: employee?.employeeName || "交付系统",
      roleId,
      kind: entry.kind,
      status: entry.status,
      stage: Number.isFinite(Number(entry.stage))
        ? Number(entry.stage)
        : Number(run.supervision?.checkpoint?.stage || run.currentStage || 0),
      summary: entry.summary,
      checkpoint: entry.checkpoint
    };
  });
}

function buildCoordination(run, employees = ROLE_BLUEPRINT) {
  const team = buildDeliveryTeam(run, employees);
  const ledger = buildExecutionLedger(run);
  const decisions = buildDecisionInbox([run]);
  const trajectory = buildTrajectory(run, team);
  return {
    schemaVersion: 1,
    runId: run.id,
    policy: {
      routing: "stage-aware",
      humanIntervention: "exception-only",
      preserveAttempts: true,
      resetWorkspaceOnRetry: false
    },
    team,
    ledger,
    trajectory,
    decisions,
    metrics: {
      members: team.length,
      onDuty: team.filter((member) =>
        ["active", "recovering", "queued"].includes(member.state)
      ).length,
      standby: team.filter((member) => member.state === "standby").length,
      active: team.filter((member) =>
        ["active", "recovering"].includes(member.state)
      ).length,
      completed: team.filter((member) => member.state === "completed").length,
      attempts: ledger.filter((entry) =>
        ["start", "retry", "resume", "restart"].some((kind) =>
          String(entry.kind).includes(kind)
        )
      ).length
    }
  };
}

module.exports = {
  ROLE_BLUEPRINT,
  buildCoordination,
  buildDecisionInbox,
  buildDeliveryTeam,
  buildExecutionLedger,
  buildTrajectory,
  roleForStage
};
