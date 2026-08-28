const path = require("node:path");

const ACTIVE_STATES = new Set(["queued", "running", "recovering", "stalled"]);
const TERMINAL_STATES = new Set(["completed", "failed", "cancelled"]);

const DEFAULT_POLICY = Object.freeze({
  monitorIntervalMs: 10000,
  heartbeatTimeoutMs: 45000,
  stepTimeoutMs: 15 * 60 * 1000,
  maxRestarts: 3,
  maxRetries: 5,
  restartBackoffMs: 15000
});

function iso(now) {
  return new Date(now()).toISOString();
}

function capabilityFor(tool) {
  if (!tool) return "unavailable";
  if (tool.source === "application") {
    return tool.id?.startsWith("trae-") ? "task-aware" : "process-control";
  }
  return "process-observe";
}

function initialSupervision(run, now = Date.now) {
  const at = iso(now);
  return {
    schemaVersion: 1,
    state:
      run.status === "completed"
        ? "completed"
        : run.status === "failed"
          ? "failed"
          : "queued",
    policy: { ...DEFAULT_POLICY },
    monitor: {
      status: "active",
      lastScanAt: null,
      nextScanAt: at,
      scanCount: 0
    },
    checkpoint: {
      stage: Number(run.currentStage || 0),
      stepId: `stage-${Number(run.currentStage || 0)}-entry`,
      sequence: 0,
      savedAt: at,
      resumeMode: "continue"
    },
    recovery: {
      retryCount: 0,
      restartCount: 0,
      lastReason: null,
      lastAttemptAt: null,
      nextAttemptAt: null
    },
    cancellation: null,
    tools: {},
    incidents: [],
    executionLedger: [],
    updatedAt: at
  };
}

function normalizeSupervision(run, now = Date.now) {
  const initial = initialSupervision(run, now);
  const current = run.supervision || {};
  return {
    ...initial,
    ...current,
    policy: { ...initial.policy, ...(current.policy || {}) },
    monitor: { ...initial.monitor, ...(current.monitor || {}) },
    checkpoint: { ...initial.checkpoint, ...(current.checkpoint || {}) },
    recovery: { ...initial.recovery, ...(current.recovery || {}) },
    tools: { ...(current.tools || {}) },
    incidents: Array.isArray(current.incidents) ? current.incidents : [],
    executionLedger: Array.isArray(current.executionLedger)
      ? current.executionLedger
      : []
  };
}

function selectedTools(run) {
  const selection = run.tools?.selection || {};
  return ["work", "code"]
    .map((role) => {
      const tool = (run.tools?.[role] || []).find(
        (candidate) => candidate.id === selection[role]
      );
      return tool ? { ...tool, role } : null;
    })
    .filter(Boolean);
}

function commandMatchesTool(command, tool) {
  if (!command || !tool?.path) return false;
  if (tool.source === "application") {
    return command.startsWith(`${tool.path}/Contents/MacOS/`);
  }
  const binary = path.basename(tool.path);
  return command === tool.path || command.includes(`/${binary} `);
}

function inspectTool(tool, processes, heartbeat, now = Date.now) {
  const process = processes.find((candidate) =>
    commandMatchesTool(candidate.command, tool)
  );
  const heartbeatAt = heartbeat?.at ? Date.parse(heartbeat.at) : NaN;
  const heartbeatFresh =
    heartbeat?.runId &&
    Number.isFinite(heartbeatAt) &&
    now() - heartbeatAt <= DEFAULT_POLICY.heartbeatTimeoutMs;
  const ownsTask = heartbeatFresh && heartbeat.runId === heartbeat.expectedRunId;
  return {
    id: tool.id,
    name: tool.name,
    role: tool.role,
    capability: capabilityFor(tool),
    processState: process ? "online" : "offline",
    taskState: ownsTask
      ? heartbeat.state || "running"
      : process
        ? heartbeat?.runId
          ? "different-task"
          : "unverified"
        : "not-running",
    pid: process?.pid || null,
    heartbeatAt: heartbeat?.at || null,
    checkpointSequence: heartbeat?.checkpointSequence ?? null,
    lastCheckedAt: iso(now)
  };
}

function addIncident(supervision, incident) {
  const duplicate = supervision.incidents.some(
    (candidate) =>
      !candidate.resolvedAt &&
      candidate.code === incident.code &&
      candidate.toolId === incident.toolId
  );
  if (!duplicate) {
    supervision.incidents.unshift(incident);
    supervision.incidents = supervision.incidents.slice(0, 50);
    return true;
  }
  return false;
}

function appendLedger(supervision, entry) {
  supervision.executionLedger.push(entry);
  supervision.executionLedger = supervision.executionLedger.slice(-100);
}

class TaskSupervisor {
  constructor(options) {
    this.runRoot = options.runRoot;
    this.listRuns = options.listRuns;
    this.readRun = options.readRun;
    this.persistRun = options.persistRun;
    this.readJson = options.readJson;
    this.listProcesses = options.listProcesses;
    this.launchTool = options.launchTool;
    this.recoverTask = options.recoverTask;
    this.cancelTask = options.cancelTask;
    this.restoreTask = options.restoreTask;
    this.now = options.now || Date.now;
    this.intervalMs = options.intervalMs || DEFAULT_POLICY.monitorIntervalMs;
    this.timer = null;
    this.scanning = false;
  }

  start() {
    if (this.timer) return;
    this.tick().catch(() => {});
    this.timer = setInterval(() => this.tick().catch(() => {}), this.intervalMs);
    this.timer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  async tick(runId = null) {
    if (this.scanning) return [];
    this.scanning = true;
    try {
      const runs = runId ? [await this.readRun(runId)] : await this.listRuns();
      const processes = await this.listProcesses();
      const results = [];
      for (const run of runs) {
        results.push(await this.inspectRun(run, processes));
      }
      return results;
    } finally {
      this.scanning = false;
    }
  }

  async inspectRun(run, processes) {
    const supervision = normalizeSupervision(run, this.now);
    if (TERMINAL_STATES.has(supervision.state)) return supervision;
    const at = iso(this.now);
    const active = ACTIVE_STATES.has(supervision.state);
    const events = [];
    const attemptedPaths = new Set();

    for (const tool of selectedTools(run)) {
      const heartbeatPath = path.join(
        this.runRoot,
        run.id,
        "control",
        `heartbeat-${tool.role}.json`
      );
      const heartbeat = await this.readJson(heartbeatPath);
      if (heartbeat) heartbeat.expectedRunId = run.id;
      const health = inspectTool(tool, processes, heartbeat, this.now);
      supervision.tools[tool.role] = health;

      if (!active || health.processState === "online") continue;

      const incidentAdded = addIncident(supervision, {
        id: `${run.id}-${tool.role}-${this.now()}`,
        at,
        code: "tool_process_offline",
        reasonCode: "runtime_offline",
        severity: "high",
        toolId: tool.id,
        role: tool.role,
        summary: `${tool.name} 已退出或被关闭`,
        action: "自动重启并从检查点恢复",
        resolvedAt: null
      });
      if (incidentAdded) {
        events.push({
          at,
          stage: supervision.checkpoint.stage,
          type: "supervisor.tool_offline",
          summary: `${tool.name} 已离线，监管器开始恢复`,
          detail: `checkpoint:${supervision.checkpoint.stepId};sequence:${supervision.checkpoint.sequence}`
        });
      }

      const canRestart =
        tool.source === "application" &&
        !attemptedPaths.has(tool.path) &&
        supervision.recovery.restartCount < supervision.policy.maxRestarts &&
        (!supervision.recovery.nextAttemptAt ||
          Date.parse(supervision.recovery.nextAttemptAt) <= this.now());
      if (canRestart) {
        try {
          attemptedPaths.add(tool.path);
          await this.launchTool(tool);
          supervision.state = "recovering";
          supervision.recovery.restartCount += 1;
          supervision.recovery.lastReason = "tool_process_offline";
          supervision.recovery.needsTaskResume = true;
          supervision.recovery.lastAttemptAt = at;
          supervision.recovery.nextAttemptAt = new Date(
            this.now() + supervision.policy.restartBackoffMs
          ).toISOString();
          events.push({
            at,
            stage: supervision.checkpoint.stage,
            type: "supervisor.tool_restarted",
            summary: `${tool.name} 已重新启动`,
            detail: `resume:${supervision.checkpoint.stepId};attempt:${supervision.recovery.restartCount}`
          });
          appendLedger(supervision, {
            id: `${run.id}-restart-${tool.role}-${this.now()}`,
            at,
            kind: "restart",
            role: tool.role,
            toolId: tool.id,
            status: "submitted",
            checkpoint: supervision.checkpoint.stepId,
            sequence: supervision.checkpoint.sequence,
            summary: `${tool.name} 已重新启动`,
            reasonCode: "runtime_offline"
          });
        } catch (error) {
          supervision.state = "stalled";
          supervision.recovery.lastReason = error.message;
        }
      } else if (tool.source !== "application") {
        supervision.state = "stalled";
      }
    }

    const toolHealth = Object.values(supervision.tools);
    const submittedAt = supervision.recovery.taskSubmittedAt
      ? Date.parse(supervision.recovery.taskSubmittedAt)
      : NaN;
    const taskHeartbeatMissing =
      supervision.state === "running" &&
      Number.isFinite(submittedAt) &&
      this.now() - submittedAt > supervision.policy.heartbeatTimeoutMs &&
      !toolHealth.some((tool) =>
        ["running", "waiting", "completed"].includes(tool.taskState)
      );
    if (taskHeartbeatMissing) {
      supervision.state = "stalled";
      supervision.recovery.lastReason = "task_heartbeat_timeout";
      const incidentAdded = addIncident(supervision, {
        id: `${run.id}-heartbeat-${this.now()}`,
        at,
        code: "task_heartbeat_timeout",
        reasonCode: "semantic_inactivity",
        severity: "high",
        toolId: null,
        role: null,
        summary: "工具进程在线，但当前任务心跳已超时",
        action: "保留检查点并等待安全重试",
        resolvedAt: null
      });
      if (incidentAdded) {
        events.push({
          at,
          stage: supervision.checkpoint.stage,
          type: "supervisor.task_stalled",
          summary: "当前任务心跳超时，已停止盲目等待",
          detail: `checkpoint:${supervision.checkpoint.stepId};timeout:${supervision.policy.heartbeatTimeoutMs}`
        });
        appendLedger(supervision, {
          id: `${run.id}-stalled-${this.now()}`,
          at,
          kind: "stalled",
          role: null,
          toolId: null,
          status: "failed",
          checkpoint: supervision.checkpoint.stepId,
          sequence: supervision.checkpoint.sequence,
          summary: "当前任务心跳超时",
          reasonCode: "semantic_inactivity"
        });
      }
    }
    if (
      active &&
      toolHealth.length > 0 &&
      toolHealth.every((tool) => tool.processState === "online") &&
      supervision.state === "recovering" &&
      supervision.recovery.needsTaskResume
    ) {
      const role = supervision.checkpoint.stage < 3 ? "work" : "code";
      const tool = selectedTools(run).find(
        (candidate) =>
          candidate.role === role && capabilityFor(candidate) === "task-aware"
      );
      if (!tool || !this.recoverTask) {
        supervision.state = "stalled";
        supervision.recovery.lastReason = "task_adapter_unavailable";
      } else {
        try {
          const result = await this.recoverTask(run, tool, supervision.checkpoint);
          supervision.state = "running";
          supervision.recovery.needsTaskResume = false;
          supervision.recovery.taskSubmittedAt = at;
          supervision.recovery.resumeEvidence = result;
          if (supervision.tools[role]) {
            supervision.tools[role].taskState = "starting";
            supervision.tools[role].heartbeatAt = at;
          }
          supervision.incidents = supervision.incidents.map((incident) =>
            incident.resolvedAt
              ? incident
              : { ...incident, resolvedAt: at, resolution: "task_resubmitted" }
          );
          events.push({
            at,
            stage: supervision.checkpoint.stage,
            type: "supervisor.task_resumed",
            summary: `${tool.name} 已从保存的检查点续跑`,
            detail: `resume:${supervision.checkpoint.stepId};sequence:${supervision.checkpoint.sequence};confirmation:${result.confirmation || "submitted"}`
          });
          appendLedger(supervision, {
            id: `${run.id}-resume-${role}-${this.now()}`,
            at,
            kind: "resume",
            role,
            toolId: tool.id,
            status: "submitted",
            checkpoint: supervision.checkpoint.stepId,
            sequence: supervision.checkpoint.sequence,
            summary: `${tool.name} 已从保存的检查点续跑`,
            reasonCode: supervision.recovery.lastReason
          });
        } catch (error) {
          supervision.state = "stalled";
          supervision.recovery.lastReason = error.message;
          events.push({
            at,
            stage: supervision.checkpoint.stage,
            type: "supervisor.task_resume_failed",
            summary: `${tool.name} 恢复任务失败`,
            detail: error.message
          });
          appendLedger(supervision, {
            id: `${run.id}-resume-failed-${role}-${this.now()}`,
            at,
            kind: "resume_failed",
            role,
            toolId: tool.id,
            status: "failed",
            checkpoint: supervision.checkpoint.stepId,
            sequence: supervision.checkpoint.sequence,
            summary: `${tool.name} 恢复任务失败`,
            reasonCode: "task_adapter_failure"
          });
        }
      }
    }

    supervision.monitor = {
      status: "active",
      lastScanAt: at,
      nextScanAt: new Date(this.now() + this.intervalMs).toISOString(),
      scanCount: Number(supervision.monitor.scanCount || 0) + 1
    };
    supervision.updatedAt = at;
    const latest = await this.readRun(run.id);
    latest.supervision = supervision;
    latest.events = [...(latest.events || []), ...events];
    if (events.length > 0) latest.updatedAt = at;
    await this.persistRun(latest);
    return supervision;
  }

  async action(runId, action) {
    const run = await this.readRun(runId);
    const supervision = normalizeSupervision(run, this.now);
    const at = iso(this.now);
    const previous = supervision.state;
    const supportedActions = new Set([
      "pause",
      "resume",
      "retry",
      "cancel",
      "undo_cancel",
      "start"
    ]);

    if (!supportedActions.has(action)) {
      throw new Error("Unsupported supervisor action");
    }
    if (action === "pause") supervision.state = "paused";
    if (action === "resume") supervision.state = "recovering";
    if (action === "retry") {
      if (supervision.recovery.retryCount >= supervision.policy.maxRetries) {
        throw new Error("已达到当前步骤最大重试次数");
      }
      supervision.state = "recovering";
      supervision.recovery.retryCount += 1;
      supervision.recovery.lastReason = "manual_retry";
      supervision.recovery.lastAttemptAt = at;
    }
    if (action === "cancel") {
      if (["completed", "failed", "cancelled"].includes(supervision.state)) {
        throw new Error("当前任务不能重复终止");
      }
      const role = supervision.checkpoint.stage < 3 ? "work" : "code";
      const selectedTool = selectedTools(run).find(
        (candidate) => candidate.role === role
      );
      const healthTool = supervision.tools?.[role];
      const tool =
        selectedTool ||
        (healthTool
          ? {
              id: healthTool.id,
              name: healthTool.name,
              role,
              source: "observed"
            }
          : null);
      let external = {
        confirmed: false,
        method: "adapter_unavailable",
        reason: "当前执行工具没有可用的任务停止适配器"
      };
      if (this.cancelTask) {
        try {
          external = await this.cancelTask(
            run,
            tool,
            supervision.checkpoint
          );
        } catch (error) {
          external = {
            confirmed: false,
            method: "adapter_error",
            reason: error.message
          };
        }
      }
      supervision.cancellation = {
        status: external?.confirmed ? "confirmed" : "pending_confirmation",
        cancelledAt: at,
        previousRunStatus: run.status,
        previousState: previous,
        checkpoint: structuredClone(supervision.checkpoint),
        external,
        undoAvailable: true,
        restoredAt: null
      };
      supervision.state = "cancelled";
      supervision.monitor.status = "cancelled";
      supervision.recovery.needsTaskResume = false;
    }
    if (action === "undo_cancel") {
      const cancellation = supervision.cancellation;
      if (
        supervision.state !== "cancelled" ||
        !cancellation?.undoAvailable
      ) {
        throw new Error("当前任务没有可撤销的终止操作");
      }
      if (this.restoreTask) {
        await this.restoreTask(run, cancellation.checkpoint);
      }
      supervision.checkpoint = structuredClone(cancellation.checkpoint);
      supervision.state =
        cancellation.previousState === "paused" ? "paused" : "recovering";
      supervision.monitor.status =
        supervision.state === "paused" ? "paused" : "active";
      supervision.recovery.needsTaskResume =
        supervision.state === "recovering";
      supervision.recovery.lastReason = "cancel_undone";
      cancellation.undoAvailable = false;
      cancellation.restoredAt = at;
      cancellation.status = "restored";
    }
    if (action === "start") supervision.state = "running";

    if (action === "cancel") run.status = "cancelled";
    if (action === "undo_cancel") {
      run.status =
        supervision.cancellation.previousRunStatus === "completed"
          ? "running"
          : supervision.cancellation.previousRunStatus;
    }
    if (
      ["start", "resume", "retry"].includes(action) &&
      run.status !== "completed"
    ) {
      run.status = "running";
      supervision.recovery.needsTaskResume = true;
    }
    supervision.updatedAt = at;
    appendLedger(supervision, {
      id: `${run.id}-${action}-${this.now()}`,
      at,
      kind: action,
      role: supervision.checkpoint.stage < 3 ? "work" : "code",
      toolId: null,
      status:
        action === "pause" || action === "cancel" ? action : "submitted",
      checkpoint: supervision.checkpoint.stepId,
      sequence: supervision.checkpoint.sequence,
      summary:
        action === "retry"
          ? "从当前检查点创建新的执行尝试"
          : action === "pause"
            ? "任务监管已暂停"
            : action === "cancel"
              ? supervision.cancellation.status === "confirmed"
                ? "任务已终止，外部工具已确认停止"
                : "任务监管已终止，外部工具停止待确认"
              : action === "undo_cancel"
                ? "已撤销任务终止并恢复原检查点"
              : "任务恢复请求已提交",
      reasonCode: action === "retry" ? "manual_retry" : null
    });
    run.supervision = supervision;
    run.updatedAt = at;
    run.events.push({
      at,
      stage: supervision.checkpoint.stage,
      type: `supervisor.${action}`,
      summary:
        action === "pause"
          ? "任务监管已暂停"
          : action === "cancel"
            ? supervision.cancellation.status === "confirmed"
              ? "任务已终止，外部工具已确认停止"
              : "任务监管已终止，外部工具停止待确认"
            : action === "undo_cancel"
              ? "已撤销任务终止"
            : action === "retry"
              ? "从当前检查点重试"
              : "从当前检查点恢复任务",
      detail: `state:${previous}->${supervision.state};checkpoint:${supervision.checkpoint.stepId};sequence:${supervision.checkpoint.sequence}`
    });
    await this.persistRun(run);
    if (
      ["start", "resume", "retry", "undo_cancel"].includes(action) &&
      supervision.state !== "paused"
    ) {
      await this.tick(runId);
    }
    return (await this.readRun(runId)).supervision;
  }
}

module.exports = {
  ACTIVE_STATES,
  DEFAULT_POLICY,
  TERMINAL_STATES,
  TaskSupervisor,
  capabilityFor,
  commandMatchesTool,
  initialSupervision,
  inspectTool,
  appendLedger,
  normalizeSupervision,
  selectedTools
};
