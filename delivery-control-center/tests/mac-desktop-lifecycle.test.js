const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const readSource = (name) =>
  fs.readFileSync(path.join(__dirname, "..", "src", name), "utf8");

const main = readSource("main.js");
const preload = readSource("preload.js");
const renderer = readSource("renderer.js");

test("窗口首帧在 ready-to-show 后显示且避免白屏闪现", () => {
  assert.match(main, /show: false/);
  assert.match(main, /new Promise\(\(resolve\) => \{[\s\S]*"ready-to-show"/);
  assert.match(main, /await window\.loadFile/);
  assert.match(main, /await readyToShow/);
  assert.doesNotMatch(main, /show: true/);
});

test("窗口状态使用原子文件持久化并在退出前落盘", () => {
  assert.match(main, /windowStatePath = path\.join\(settingsRoot, "window-state\.json"\)/);
  assert.match(main, /window\.getNormalBounds\(\)/);
  assert.match(main, /captureWindowState\(bounds/);
  assert.match(main, /await fs\.rename\(temporaryPath, windowStatePath\)/);
  assert.match(main, /window\.on\("move"/);
  assert.match(main, /window\.on\("resize"/);
  assert.match(main, /window\.on\("enter-full-screen"/);
  assert.match(main, /app\.on\("before-quit", \(event\)/);
  assert.match(main, /event\.preventDefault\(\)/);
  assert.match(main, /quitStatePersisted = true/);
});

test("显示器变更会验证窗口可见性并安全回屏", () => {
  assert.match(main, /function ensureWindowOnVisibleDisplay\(window\)/);
  assert.match(main, /screen\.getAllDisplays\(\)/);
  assert.match(main, /screen\.getPrimaryDisplay\(\)/);
  assert.match(main, /window\.setBounds\(restored\.bounds, true\)/);
  assert.match(
    main,
    /if \(restored\.recoveredToVisibleDisplay\) \{[\s\S]*await persistWindowState\(window\)/
  );
  assert.match(main, /screen\.on\("display-added", recoverWindows\)/);
  assert.match(main, /screen\.on\("display-removed", recoverWindows\)/);
  assert.match(main, /screen\.on\("display-metrics-changed", recoverWindows\)/);
});

test("关闭最后窗口后明确告知后台监管仍在运行", () => {
  assert.match(main, /OneOPC 仍在后台监管任务/);
  assert.match(main, /窗口已关闭，任务监管与故障恢复继续运行/);
  assert.match(main, /backgroundHintShown/);
  assert.match(main, /backgroundNotification\.on\("click"/);
  assert.match(
    main,
    /if \(process\.platform !== "darwin"\) app\.quit\(\)/
  );
});

test("原生菜单提供业务导航、需求创建和监管命令", () => {
  for (const label of [
    "显示控制中心",
    "新建交付需求…",
    "交付控制中心",
    "项目交付",
    "任务监管",
    "数字员工",
    "技术雷达",
    "立即健康检查",
    "重新扫描本机工具"
  ]) {
    assert.match(main, new RegExp(label));
  }
  assert.match(main, /Menu\.setApplicationMenu\(buildApplicationMenu\(\)\)/);
  assert.match(main, /CommandOrControl\+1/);
  assert.match(main, /CommandOrControl\+5/);
  assert.match(main, /CommandOrControl\+Shift\+O/);
  assert.match(
    main,
    /id: "toggle-full-screen",[\s\S]*role: "togglefullscreen",[\s\S]*label: isFullScreen/
  );
  assert.match(main, /function updateFullScreenMenuLabel\(window\)/);
  assert.match(
    main,
    /Menu\.setApplicationMenu\([\s\S]*buildApplicationMenu\(window\.isFullScreen\(\)\)/
  );
  assert.match(main, /function buildApplicationMenu\(isFullScreen = false\)/);
  assert.match(main, /isFullScreen[\s\S]*\? "退出全屏幕"[\s\S]*: "进入全屏幕"/);
  assert.match(
    main,
    /window\.on\("enter-full-screen", \(\) => \{[\s\S]*updateFullScreenMenuLabel\(window\)/
  );
  assert.match(
    main,
    /window\.on\("leave-full-screen", \(\) => \{[\s\S]*updateFullScreenMenuLabel\(window\)/
  );
});

test("原生菜单命令通过隔离白名单桥接到现有业务操作", () => {
  assert.match(preload, /const APP_COMMANDS = new Set/);
  assert.match(preload, /APP_COMMANDS\.has\(command\)/);
  assert.match(preload, /onAppCommand: \(callback\)/);
  assert.match(preload, /ipcRenderer\.on\("app:command", listener\)/);
  assert.match(renderer, /window\.oneopc\.onAppCommand\(\(command\)/);
  assert.match(renderer, /openRequirementDialog\(\)/);
  assert.match(renderer, /setPage\(page\)/);
  assert.match(renderer, /"#scanTasksButton"/);
  assert.match(renderer, /"#rescanToolsButton"/);
  assert.match(renderer, /"#refreshButton"/);
});

test("单实例、Dock 激活和通知点击共用同一窗口恢复入口", () => {
  assert.match(main, /app\.on\("second-instance"/);
  assert.match(main, /app\.on\("activate"/);
  assert.match(main, /async function showMainWindow\(command = null\)/);
  const uses = main.match(/showMainWindow\(/g) || [];
  assert.ok(uses.length >= 5);
});
