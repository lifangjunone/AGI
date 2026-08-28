const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const main = fs.readFileSync(
  path.join(__dirname, "..", "src", "main.js"),
  "utf8"
);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
);

test("原生编辑菜单提供完整标准文本操作", () => {
  assert.match(main, /label: "编辑"/);

  for (const role of [
    "undo",
    "redo",
    "cut",
    "copy",
    "paste",
    "pasteAndMatchStyle",
    "delete",
    "selectAll"
  ]) {
    assert.match(main, new RegExp(`role: "${role}"`));
  }
});

test("About 面板使用 OneOPC 产品元数据而不是 Electron 默认信息", () => {
  assert.match(main, /function configureApplicationMetadata\(\)/);
  assert.match(main, /app\.setAboutPanelOptions\(\{/);
  assert.match(main, /applicationName: "OneOPC"/);
  assert.match(main, /applicationVersion: app\.getVersion\(\)/);
  assert.match(main, /version: ""/);
  assert.match(main, /本地优先的全自动交付控制中心/);
  assert.match(
    main,
    /configureDataPaths\(\);[\s\S]*configureApplicationMetadata\(\);/
  );
  assert.equal(packageJson.build.mac.icon, "build/OneOPC.icns");
});

test("帮助菜单提供入门、隐私和本地数据可执行入口", () => {
  assert.match(main, /role: "help"/);
  assert.match(main, /label: "OneOPC 使用帮助"/);
  assert.match(main, /label: "隐私与本地数据"/);
  assert.match(main, /label: "打开本地数据目录"/);
  assert.match(main, /await showMainWindow\("new-requirement"\)/);
  assert.match(main, /await shell\.openPath\(app\.getPath\("userData"\)\)/);
});

test("隐私说明明确本地资产、外部边界和后台生命周期", () => {
  assert.match(main, /交付资产默认保存在本机/);
  assert.match(main, /需求原文、未提交草稿、运行记录、检查点、数字员工和窗口设置/);
  assert.match(main, /外部源码链接仅允许打开已验证域名/);
  assert.match(main, /损坏草稿隔离文件最多保留 7 天且不超过 4 份/);
  assert.match(main, /需求与员工草稿都被清空时会立即销毁/);
  assert.match(main, /选择“退出 OneOPC”才会停止后台监管/);
});
