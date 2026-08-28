const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(
  path.join(__dirname, "..", "src", "index.html"),
  "utf8"
);
const renderer = fs.readFileSync(
  path.join(__dirname, "..", "src", "renderer.js"),
  "utf8"
);
const styles = fs.readFileSync(
  path.join(__dirname, "..", "src", "styles.css"),
  "utf8"
);

test("危险操作使用可访问的产品内确认对话框", () => {
  assert.match(
    html,
    /id="actionDialog"[\s\S]*?aria-labelledby="actionDialogTitle"/
  );
  assert.match(renderer, /function requestConfirmation/);
  assert.match(renderer, /停用「\$\{employee\.name\}」/);
  assert.match(renderer, /暂停「\$\{run\.title\}」的监管/);
  assert.match(renderer, /从检查点重新提交任务/);
  assert.match(renderer, /终止「\$\{run\.title\}」/);
  assert.match(renderer, /工具应用本身不会退出/);
  assert.match(styles, /\.action-dialog\[data-tone="warning"\]/);
});

test("停用员工和暂停监管完成后提供真实撤销动作", () => {
  assert.match(html, /id="toastActionButton"/);
  assert.match(
    renderer,
    /setEmployeeStatus\(employee\.id, "active"\)/
  );
  assert.match(renderer, /controlTask\(runId, "resume"\)/);
  assert.match(renderer, /controlTask\(runId, "undo_cancel"\)/);
  assert.match(renderer, /label: "撤销终止"/);
  assert.match(renderer, /label: "撤销"/);
});

test("异步员工与任务操作显示忙碌状态并防止重复提交", () => {
  assert.match(renderer, /employeeActionPending: new Set\(\)/);
  assert.match(renderer, /disabled aria-busy=\\"true\\"/);
  assert.match(renderer, /正在暂停…/);
  assert.match(renderer, /正在提交…/);
  assert.match(renderer, /正在终止…/);
  assert.match(renderer, /正在恢复…/);
  assert.match(renderer, /saveEmployeeButton[\s\S]*aria-busy/);
});

test("终止状态区分外部确认与待确认并保留检查点", () => {
  assert.match(renderer, /任务已终止，外部工具已确认停止/);
  assert.match(renderer, /监管已终止，外部工具停止待确认/);
  assert.match(renderer, /cancellation\.checkpoint\?\.stepId/);
  assert.match(styles, /\.task-cancellation\.pending_confirmation/);
  assert.match(styles, /\.task-actions button\.cancel/);
  assert.match(styles, /\.task-actions button\.restore/);
});

test("Escape 明确取消操作确认层而不触发后台动作", () => {
  assert.match(
    renderer,
    /querySelector\("#actionDialog"\)\.open\) \{[\s\S]*close\("cancel"\)/
  );
  assert.match(
    renderer,
    /event\.currentTarget\.returnValue === "confirm"/
  );
});
