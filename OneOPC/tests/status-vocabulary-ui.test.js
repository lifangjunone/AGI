const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const renderer = fs.readFileSync(
  path.join(__dirname, "..", "src", "renderer.js"),
  "utf8"
);

const functionCount = (name) =>
  [...renderer.matchAll(new RegExp(`function ${name}\\(`, "g"))].length;

test("监管状态只有一个权威映射且覆盖全部生命周期", () => {
  assert.equal(functionCount("supervisionStateText"), 1);

  for (const [state, label] of [
    ["queued", "等待接管"],
    ["running", "监管中"],
    ["recovering", "恢复处理中"],
    ["stalled", "任务卡住"],
    ["paused", "已暂停"],
    ["completed", "已完成"],
    ["failed", "失败"],
    ["cancelled", "已终止"]
  ]) {
    assert.match(
      renderer,
      new RegExp(`${state}: "${label}"`)
    );
  }
});

test("未知状态使用明确待确认语义而不是泄露后端枚举", () => {
  assert.match(renderer, /\}\[status\] \|\| "状态待确认"/);
  assert.match(renderer, /\}\[value\] \|\| "任务状态待确认"/);
  assert.match(renderer, /\}\[value\] \|\| "进程状态待确认"/);
  assert.match(renderer, /\}\[value\] \|\| "控制能力待确认"/);
  assert.match(renderer, /\}\[value\] \|\| "协作状态待确认"/);
  assert.match(renderer, /\}\[value\] \|\| "检索状态待确认"/);
  assert.doesNotMatch(renderer, /\}\[value\] \|\| value/);
  assert.doesNotMatch(renderer, /\}\[status\] \|\| status/);
});

test("任务监管不显示 OFFLINE、unknown 或英文序号标签", () => {
  assert.doesNotMatch(renderer, /"OFFLINE"/);
  assert.doesNotMatch(renderer, /method \|\| "unknown"/);
  assert.doesNotMatch(renderer, /<code>seq /);
  assert.match(renderer, /<code>序号 \$\{checkpoint\.sequence \|\| 0\}<\/code>/);
  assert.match(renderer, /processStateText\(tool\.processState\)/);
  assert.match(renderer, /stopEvidenceText\(cancellation\.external\?\.method\)/);
});

test("开发者视角把恢复原因代码转成可理解结论", () => {
  assert.match(renderer, /function recoveryReasonText\(value\)/);
  assert.match(renderer, /tool_process_offline: "执行工具进程离线"/);
  assert.match(renderer, /task_heartbeat_timeout: "当前任务心跳超时"/);
  assert.match(renderer, /manual_retry: "用户已从检查点重试"/);
  assert.match(
    renderer,
    /recoveryReasonText\(recovery\.lastReason\)/
  );
  assert.doesNotMatch(
    renderer,
    /developerRecoveryTitle"\)\.textContent =\s*recovery\.lastReason/
  );
  assert.match(renderer, /function developerToolDetail\(tool\)/);
  assert.match(renderer, /return task === process \? task : `\$\{task\} · \$\{process\}`/);
  assert.match(renderer, /\? developerToolDetail\(tool\)/);
});
