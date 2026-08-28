const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const readSource = (name) =>
  fs.readFileSync(path.join(__dirname, "..", "src", name), "utf8");

const main = readSource("main.js");
const preload = readSource("preload.js");
const renderer = readSource("renderer.js");
const styles = readSource("styles.css");

test("界面密度偏好在本地设置目录原子持久化", () => {
  assert.match(
    main,
    /uiPreferencesPath = path\.join\(settingsRoot, "ui-preferences\.json"\)/
  );
  assert.match(main, /let uiPreferencesWriteQueue = Promise\.resolve\(\)/);
  assert.match(
    main,
    /const temporaryPath = `\$\{uiPreferencesPath\}\.tmp-\$\{process\.pid\}`/
  );
  assert.match(main, /await fs\.rename\(temporaryPath, uiPreferencesPath\)/);
  assert.match(main, /density: value\?\.density === "comfortable"/);
});

test("原生显示菜单提供标准与舒适密度并支持快捷切换", () => {
  assert.match(main, /label: "界面密度"/);
  assert.match(main, /label: "标准（显示更多内容）"/);
  assert.match(main, /label: "舒适（文字更易阅读）"/);
  assert.match(main, /type: "radio"/);
  assert.match(main, /accelerator: "CommandOrControl\+Shift\+D"/);
  assert.match(main, /function setInterfaceDensity\(density\)/);
});

test("密度命令通过隔离白名单即时同步到 Renderer", () => {
  assert.match(preload, /"density:standard"/);
  assert.match(preload, /"density:comfortable"/);
  assert.match(preload, /getUIPreferences: \(\) => ipcRenderer\.invoke\("ui:preferences:get"\)/);
  assert.match(preload, /setInterfaceDensity: \(density\)/);
  assert.match(main, /ipcMain\.handle\("ui:preferences:set"/);
  assert.match(renderer, /function applyInterfaceDensity\(density/);
  assert.match(renderer, /document\.body\.classList\.toggle\("comfortable-density"/);
  assert.match(renderer, /command\.startsWith\("density:"\)/);
  assert.match(renderer, /await uiPreferencesReady/);
});

test("舒适密度提升辅助文字而不整体缩放界面", () => {
  const comfortableBlock = styles.slice(
    styles.indexOf("body.comfortable-density small"),
    styles.indexOf("@media (prefers-reduced-motion")
  );
  assert.match(comfortableBlock, /font-size: 11px/);
  assert.match(comfortableBlock, /font-size: 12px/);
  assert.doesNotMatch(comfortableBlock, /\bzoom\s*:/);
  assert.doesNotMatch(comfortableBlock, /transform:\s*scale/);
});

test("未知或损坏的密度值安全回退标准模式", () => {
  assert.match(renderer, /const comfortable = density === "comfortable"/);
  assert.match(
    renderer,
    /state\.interfaceDensity = comfortable \? "comfortable" : "standard"/
  );
  assert.match(main, /return normalizeUIPreferences\(null\)/);
});
