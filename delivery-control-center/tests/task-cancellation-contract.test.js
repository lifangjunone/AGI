const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const main = fs.readFileSync(
  path.join(__dirname, "..", "src", "main.js"),
  "utf8"
);
const supervisor = fs.readFileSync(
  path.join(__dirname, "..", "src", "task-supervisor.js"),
  "utf8"
);

test("控制契约声明终止请求文件和检查点保留行为", () => {
  assert.match(main, /requestFile: "control-request\.json"/);
  assert.match(main, /supportedActions: \["cancel"\]/);
  assert.match(
    main,
    /cancelBehavior: "stop-current-run-preserve-checkpoint"/
  );
  assert.match(main, /Before each step, stop immediately/);
});

test("停止适配器原子写入请求且只接受 Accessibility 证据", () => {
  assert.match(main, /async function stopManagedTask\(run, tool, checkpoint\)/);
  assert.match(main, /action: "cancel"/);
  assert.match(main, /await fs\.rename\(temporaryPath, requestPath\)/);
  assert.match(main, /for \(const label of \["stop", "cancel"\]\)/);
  assert.match(main, /String\(result\.method \|\| ""\)\.startsWith\("AX"\)/);
  assert.match(main, /status = "pending_confirmation"/);
});

test("撤销终止先覆盖控制请求再恢复任务状态", () => {
  assert.match(main, /async function restoreCancelledTask\(run, checkpoint\)/);
  assert.match(main, /action: "resume"/);
  assert.match(main, /method: "user_undo"/);
  assert.match(main, /restoreTask: restoreCancelledTask/);
  assert.match(supervisor, /await this\.restoreTask\(run, cancellation\.checkpoint\)/);
});

test("监管器保存取消前状态、检查点和外部确认结果", () => {
  assert.match(supervisor, /previousRunStatus: run\.status/);
  assert.match(supervisor, /previousState: previous/);
  assert.match(
    supervisor,
    /checkpoint: structuredClone\(supervision\.checkpoint\)/
  );
  assert.match(supervisor, /undoAvailable: true/);
  assert.match(supervisor, /status: external\?\.confirmed/);
});
