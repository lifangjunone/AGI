const test = require("node:test");
const assert = require("node:assert/strict");
const {
  TaskSupervisor,
  commandMatchesTool,
  initialSupervision,
  inspectTool
} = require("../src/task-supervisor");

const fixedNow = () => Date.parse("2026-08-15T10:00:00.000Z");

function sampleRun() {
  const run = {
    id: "OP-SUPERVISOR",
    title: "监管恢复测试",
    status: "running",
    currentStage: 3,
    progress: 45,
    stages: ["需求理解", "业务确认", "方案设计", "开发"],
    events: [],
    tools: {
      selection: { work: "trae-work", code: "trae-code" },
      work: [
        {
          id: "trae-work",
          name: "Trae Work",
          source: "application",
          path: "/Applications/Trae CN.app"
        }
      ],
      code: [
        {
          id: "trae-code",
          name: "Trae Code",
          source: "application",
          path: "/Applications/Trae CN.app"
        }
      ]
    }
  };
  run.supervision = initialSupervision(run, fixedNow);
  run.supervision.state = "running";
  run.supervision.checkpoint = {
    stage: 3,
    stepId: "develop-verify-output",
    sequence: 12,
    savedAt: "2026-08-15T09:59:00.000Z",
    resumeMode: "continue"
  };
  return run;
}

test("应用路径只匹配该应用进程", () => {
  const tool = {
    source: "application",
    path: "/Applications/Trae CN.app"
  };
  assert.equal(
    commandMatchesTool(
      "/Applications/Trae CN.app/Contents/MacOS/Electron",
      tool
    ),
    true
  );
  assert.equal(
    commandMatchesTool(
      "/Applications/Cursor.app/Contents/MacOS/Cursor",
      tool
    ),
    false
  );
  assert.equal(
    commandMatchesTool(
      "/Applications/Trae CN.app/Contents/Frameworks/Trae CN Helper.app/Contents/MacOS/Trae CN Helper",
      tool
    ),
    false
  );
});

test("只有当前 Run 的新鲜心跳才算正在执行本任务", () => {
  const tool = {
    id: "trae-code",
    name: "Trae Code",
    role: "code",
    source: "application",
    path: "/Applications/Trae CN.app"
  };
  const processes = [
    {
      pid: 42,
      command: "/Applications/Trae CN.app/Contents/MacOS/Electron"
    }
  ];
  const otherTask = inspectTool(
    tool,
    processes,
    {
      runId: "OP-OTHER",
      expectedRunId: "OP-SUPERVISOR",
      state: "running",
      at: "2026-08-15T09:59:50.000Z"
    },
    fixedNow
  );
  assert.equal(otherTask.processState, "online");
  assert.equal(otherTask.taskState, "different-task");

  const currentTask = inspectTool(
    tool,
    processes,
    {
      runId: "OP-SUPERVISOR",
      expectedRunId: "OP-SUPERVISOR",
      state: "running",
      at: "2026-08-15T09:59:50.000Z"
    },
    fixedNow
  );
  assert.equal(currentTask.taskState, "running");
});

test("工具退出后自动重启且保持原检查点", async () => {
  let stored = sampleRun();
  const launches = [];
  const supervisor = new TaskSupervisor({
    runRoot: "/tmp/oneopc-runs",
    now: fixedNow,
    intervalMs: 10000,
    listRuns: async () => [structuredClone(stored)],
    readRun: async () => structuredClone(stored),
    persistRun: async (run) => {
      stored = structuredClone(run);
    },
    readJson: async () => null,
    listProcesses: async () => [],
    launchTool: async (tool) => launches.push(tool.path)
  });

  await supervisor.tick();

  assert.equal(launches.length, 1);
  assert.equal(stored.supervision.state, "recovering");
  assert.equal(
    stored.supervision.checkpoint.stepId,
    "develop-verify-output"
  );
  assert.equal(stored.supervision.checkpoint.sequence, 12);
  assert.equal(stored.supervision.recovery.restartCount, 1);
  assert.ok(
    stored.events.some((event) => event.type === "supervisor.tool_restarted")
  );
});

test("手动重试增加次数但不重置阶段", async () => {
  let stored = sampleRun();
  const supervisor = new TaskSupervisor({
    runRoot: "/tmp/oneopc-runs",
    now: fixedNow,
    intervalMs: 10000,
    listRuns: async () => [structuredClone(stored)],
    readRun: async () => structuredClone(stored),
    persistRun: async (run) => {
      stored = structuredClone(run);
    },
    readJson: async () => null,
    listProcesses: async () => [
      {
        pid: 42,
        command: "/Applications/Trae CN.app/Contents/MacOS/Electron"
      }
    ],
    launchTool: async () => {}
  });

  await supervisor.action(stored.id, "retry");

  assert.equal(stored.supervision.recovery.retryCount, 1);
  assert.equal(stored.supervision.checkpoint.stage, 3);
  assert.equal(stored.supervision.checkpoint.sequence, 12);
  assert.equal(stored.supervision.executionLedger.length, 1);
  assert.equal(stored.supervision.executionLedger[0].kind, "retry");
});

test("进程恢复后通过任务适配器提交续跑指令", async () => {
  let stored = sampleRun();
  stored.supervision.state = "recovering";
  stored.supervision.recovery.needsTaskResume = true;
  const recoveries = [];
  const supervisor = new TaskSupervisor({
    runRoot: "/tmp/oneopc-runs",
    now: fixedNow,
    intervalMs: 10000,
    listRuns: async () => [structuredClone(stored)],
    readRun: async () => structuredClone(stored),
    persistRun: async (run) => {
      stored = structuredClone(run);
    },
    readJson: async () => null,
    listProcesses: async () => [
      {
        pid: 42,
        command: "/Applications/Trae CN.app/Contents/MacOS/Electron"
      }
    ],
    launchTool: async () => {},
    recoverTask: async (run, tool, checkpoint) => {
      recoveries.push({ runId: run.id, role: tool.role, checkpoint });
      return { confirmation: "stop_control_visible" };
    }
  });

  await supervisor.tick();

  assert.equal(recoveries.length, 1);
  assert.equal(recoveries[0].role, "code");
  assert.equal(recoveries[0].checkpoint.sequence, 12);
  assert.equal(stored.supervision.state, "running");
  assert.equal(stored.supervision.recovery.needsTaskResume, false);
  assert.ok(
    stored.events.some((event) => event.type === "supervisor.task_resumed")
  );
});

test("终止任务保存原状态和检查点并停止后台自动恢复", async () => {
  let stored = sampleRun();
  const cancellations = [];
  const launches = [];
  const supervisor = new TaskSupervisor({
    runRoot: "/tmp/oneopc-runs",
    now: fixedNow,
    intervalMs: 10000,
    listRuns: async () => [structuredClone(stored)],
    readRun: async () => structuredClone(stored),
    persistRun: async (run) => {
      stored = structuredClone(run);
    },
    readJson: async () => null,
    listProcesses: async () => [],
    launchTool: async (tool) => launches.push(tool.id),
    cancelTask: async (run, tool, checkpoint) => {
      cancellations.push({ runId: run.id, role: tool.role, checkpoint });
      return { confirmed: true, method: "AXPress", label: "stop" };
    }
  });

  await supervisor.action(stored.id, "cancel");
  await supervisor.tick();

  assert.equal(cancellations.length, 1);
  assert.equal(cancellations[0].role, "code");
  assert.equal(stored.status, "cancelled");
  assert.equal(stored.supervision.state, "cancelled");
  assert.equal(stored.supervision.monitor.status, "cancelled");
  assert.equal(stored.supervision.cancellation.status, "confirmed");
  assert.equal(stored.supervision.cancellation.previousState, "running");
  assert.equal(
    stored.supervision.cancellation.checkpoint.stepId,
    "develop-verify-output"
  );
  assert.equal(stored.supervision.cancellation.undoAvailable, true);
  assert.equal(stored.supervision.recovery.needsTaskResume, false);
  assert.equal(launches.length, 0);
});

test("外部停止未确认时明确记录待确认而不伪装成功", async () => {
  let stored = sampleRun();
  const supervisor = new TaskSupervisor({
    runRoot: "/tmp/oneopc-runs",
    now: fixedNow,
    listRuns: async () => [structuredClone(stored)],
    readRun: async () => structuredClone(stored),
    persistRun: async (run) => {
      stored = structuredClone(run);
    },
    readJson: async () => null,
    listProcesses: async () => [],
    launchTool: async () => {},
    cancelTask: async () => ({
      confirmed: false,
      method: "accessibility_unconfirmed",
      reason: "未找到 Stop 控件"
    })
  });

  await supervisor.action(stored.id, "cancel");

  assert.equal(
    stored.supervision.cancellation.status,
    "pending_confirmation"
  );
  assert.equal(
    stored.supervision.cancellation.external.reason,
    "未找到 Stop 控件"
  );
  assert.match(
    stored.supervision.executionLedger.at(-1).summary,
    /停止待确认/
  );
});

test("终态任务拒绝重复终止", async () => {
  for (const terminalState of ["completed", "failed", "cancelled"]) {
    let stored = sampleRun();
    stored.supervision.state = terminalState;
    stored.status = terminalState;
    const supervisor = new TaskSupervisor({
      runRoot: "/tmp/oneopc-runs",
      now: fixedNow,
      listRuns: async () => [structuredClone(stored)],
      readRun: async () => structuredClone(stored),
      persistRun: async (run) => {
        stored = structuredClone(run);
      },
      readJson: async () => null,
      listProcesses: async () => [],
      launchTool: async () => {}
    });

    await assert.rejects(
      supervisor.action(stored.id, "cancel"),
      /不能重复终止/
    );
  }
});

test("撤销终止先更新控制请求再从原检查点恢复", async () => {
  let stored = sampleRun();
  const restoredRequests = [];
  const recoveries = [];
  const supervisor = new TaskSupervisor({
    runRoot: "/tmp/oneopc-runs",
    now: fixedNow,
    intervalMs: 10000,
    listRuns: async () => [structuredClone(stored)],
    readRun: async () => structuredClone(stored),
    persistRun: async (run) => {
      stored = structuredClone(run);
    },
    readJson: async () => null,
    listProcesses: async () => [
      {
        pid: 42,
        command: "/Applications/Trae CN.app/Contents/MacOS/Electron"
      }
    ],
    launchTool: async () => {},
    cancelTask: async () => ({
      confirmed: true,
      method: "AXPress"
    }),
    restoreTask: async (run, checkpoint) => {
      restoredRequests.push({ runId: run.id, checkpoint });
    },
    recoverTask: async (run, tool, checkpoint) => {
      recoveries.push({ runId: run.id, role: tool.role, checkpoint });
      return { confirmation: "stop_control_visible" };
    }
  });

  await supervisor.action(stored.id, "cancel");
  await supervisor.action(stored.id, "undo_cancel");

  assert.equal(restoredRequests.length, 1);
  assert.equal(
    restoredRequests[0].checkpoint.stepId,
    "develop-verify-output"
  );
  assert.equal(recoveries.length, 1);
  assert.equal(recoveries[0].checkpoint.sequence, 12);
  assert.equal(stored.status, "running");
  assert.equal(stored.supervision.state, "running");
  assert.equal(stored.supervision.checkpoint.sequence, 12);
  assert.equal(stored.supervision.cancellation.status, "restored");
  assert.equal(stored.supervision.cancellation.undoAvailable, false);
  assert.ok(stored.supervision.cancellation.restoredAt);
});
