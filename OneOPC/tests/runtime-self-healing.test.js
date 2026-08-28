const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const readSource = (name) =>
  fs.readFileSync(path.join(__dirname, "..", "src", name), "utf8");

const main = readSource("main.js");
const preload = readSource("preload.js");
const renderer = readSource("renderer.js");

test("渲染进程崩溃会自动恢复而不是留下永久白屏", () => {
  assert.match(main, /webContents\.on\("render-process-gone"/);
  assert.match(main, /details\.reason === "clean-exit"/);
  assert.match(main, /recoverRenderer\(window, details\.reason \|\| "renderer-gone"\)/);
  assert.match(main, /window\.hide\(\)/);
  assert.match(main, /window\.webContents\.once\("did-finish-load", complete\)/);
  assert.match(main, /window\.webContents\.reload\(\)/);
  assert.match(main, /window\.show\(\);[\s\S]*window\.focus\(\)/);
});

test("自动恢复有时间窗、次数上限和恢复风暴原生兜底", () => {
  assert.match(main, /windowMs: 60_000/);
  assert.match(main, /maxAutomaticReloads: 2/);
  assert.match(
    main,
    /state\.attempts\.length >= RENDERER_RECOVERY_POLICY\.maxAutomaticReloads/
  );
  assert.match(main, /message: "控制中心连续恢复失败"/);
  assert.match(main, /buttons: \["重新加载控制中心", "继续后台监管"\]/);
  assert.match(main, /recoverRenderer\(window, reason, \{ automatic: false \}\)/);
  assert.match(main, /else if \(!window\.isDestroyed\(\)\) \{\s*window\.close\(\)/);
});

test("持续无响应先保护未提交内容再允许用户重新加载", () => {
  assert.match(main, /heartbeatCheckMs: 4_000/);
  assert.match(main, /heartbeatStaleMs: 10_000/);
  assert.match(main, /heartbeatMissThreshold: 2/);
  assert.match(main, /unresponsiveDelayMs: 8_000/);
  assert.match(main, /window\.on\("unresponsive"/);
  assert.match(main, /window\.on\("responsive"/);
  assert.match(preload, /ipcRenderer\.send\("runtime:heartbeat"\)/);
  assert.match(main, /ipcMain\.on\("runtime:heartbeat"/);
  assert.match(main, /markRendererUnresponsive\(window, "heartbeat-timeout"\)/);
  assert.match(main, /message: "控制中心暂时无响应"/);
  assert.match(main, /重新加载后可恢复最近一次成功保存的草稿/);
  assert.match(main, /buttons: \["继续等待", "重新加载控制中心"\]/);
  assert.match(
    main,
    /recoverRenderer\(window, source, \{ automatic: false \}\)/
  );
  assert.match(main, /window\.webContents\.forcefullyCrashRenderer\(\)/);
});

test("运行时恢复证据原子保存且不包含客户正文", () => {
  assert.match(
    main,
    /runtimeRecoveryPath = path\.join\(settingsRoot, "runtime-recovery\.json"\)/
  );
  assert.match(main, /events: events\.slice\(-20\)/);
  assert.match(
    main,
    /const temporaryPath = `\$\{runtimeRecoveryPath\}\.tmp-\$\{process\.pid\}`/
  );
  assert.match(main, /await fs\.rename\(temporaryPath, runtimeRecoveryPath\)/);
  assert.match(main, /type,[\s\S]*\.\.\.detail/);
  assert.doesNotMatch(main, /recordRuntimeRecovery\([^)]*requirement/i);
});

test("恢复完成通过隔离白名单显示产品内反馈", () => {
  assert.match(preload, /"runtime-recovered"/);
  assert.match(preload, /const pendingAppCommands = \[\]/);
  assert.match(preload, /pendingAppCommands\.length > 10/);
  assert.match(
    preload,
    /pendingAppCommands\.splice\(0\)\.forEach\(\(command\) => callback\(command\)\)/
  );
  assert.match(
    main,
    /setTimeout\(\(\) => \{\s*sendRendererCommand\(window, "runtime-recovered"\);\s*\}, 0\)/
  );
  assert.match(renderer, /command === "runtime-recovered"/);
  assert.match(renderer, /控制中心已从运行异常中自动恢复/);
});

test("控制中心自愈不会停止后台任务监管器", () => {
  const recoveryBlock = main.slice(
    main.indexOf("function recoverRenderer"),
    main.indexOf("async function createWindow")
  );
  assert.doesNotMatch(recoveryBlock, /taskSupervisor\?\.stop\(\)/);
  assert.doesNotMatch(recoveryBlock, /app\.quit\(\)/);
});
