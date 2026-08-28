const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const readSource = (name) =>
  fs.readFileSync(path.join(__dirname, "..", "src", name), "utf8");

const html = readSource("index.html");
const main = readSource("main.js");
const renderer = readSource("renderer.js");
const styles = readSource("styles.css");

test("启动层公开真实模块进度并向辅助技术播报", () => {
  assert.match(
    html,
    /id="bootScreen" role="status" aria-live="polite" aria-atomic="true"/
  );
  assert.match(html, /id="bootProgressTrack"[\s\S]*role="progressbar"/);
  assert.match(html, /aria-valuemin="0"[\s\S]*aria-valuemax="100"/);
  assert.match(renderer, /setAttribute\("aria-valuenow", String\(progress\)\)/);
});

test("五个启动模块并行恢复且单项失败不会中断启动", () => {
  for (const moduleId of [
    "tools",
    "settings",
    "employees",
    "supervisor",
    "runs"
  ]) {
    assert.match(renderer, new RegExp(`${moduleId}: \\{ label:`));
  }
  assert.match(
    renderer,
    /await Promise\.all\([\s\S]*"tools", "settings", "employees", "supervisor", "runs"[\s\S]*\.map\(executeModule\)/
  );
  assert.match(
    renderer,
    /catch \(error\) \{[\s\S]*setModuleStatus\(id, "failed", error\)[\s\S]*return false/
  );
  assert.match(renderer, /renderModuleDependentViews\(\);[\s\S]*finishBoot\(\)/);
});

test("模块失败显示故障语义而不是伪装成零数据", () => {
  assert.match(renderer, /function moduleErrorMessage\(id\)/);
  assert.doesNotMatch(renderer, /module\.error = error \? String\(error\.message/);
  assert.match(renderer, /无法恢复最近交付/);
  assert.match(renderer, /交付历史恢复失败/);
  assert.match(renderer, /数字员工资产暂不可用/);
  assert.match(renderer, /无法恢复受管任务/);
  assert.match(renderer, /无法恢复项目技术信号/);
  assert.match(renderer, /textContent = "—"/);
});

test("局部重试防重复提交并在恢复后重新启用设置控件", () => {
  assert.match(renderer, /data-retry-module/);
  assert.match(renderer, /button\.setAttribute\("aria-busy", "true"\)/);
  assert.match(renderer, /await Promise\.all\(uniqueIds\.map\(\(id\) => executeModule\(id\)\)\)/);
  assert.match(renderer, /#intelligenceMode"\)\.disabled = false/);
  assert.match(renderer, /#intelligenceTransport"\)\.disabled = false/);
});

test("周期刷新串行执行并把失败纳入持久健康状态", () => {
  assert.match(renderer, /runRefreshPending: false/);
  assert.match(renderer, /if \(state\.runRefreshPending\) return/);
  assert.match(
    renderer,
    /setModuleStatus\([\s\S]*"runs",[\s\S]*"failed",[\s\S]*error/
  );
  assert.match(renderer, /window\.setInterval\(refreshRunsHealth, 10000\)/);
});

test("窗口先显示，耗时监管恢复在后台完成", () => {
  const readyBlock = main.slice(main.indexOf("app.whenReady()"));
  assert.ok(readyBlock.indexOf("createWindow().catch") >= 0);
  assert.ok(
    readyBlock.indexOf("createWindow().catch") <
      readyBlock.indexOf("supervisionReady\n    .then")
  );
  assert.match(main, /supervisionReady = dataDirectoriesReady\.then\(bootstrapSupervision\)/);
});

test("开发态故障注入支持有限次数失败且正式包强制忽略", () => {
  assert.match(main, /ONEOPC_FAULT_MODULES/);
  assert.match(main, /Number\.parseInt\(mode, 10\)/);
  assert.match(main, /mode === "once"[\s\S]*\? 1/);
  assert.match(
    main,
    /if \(app\.isPackaged \|\| !developmentFaults\.has\(moduleId\)\) return/
  );
  assert.match(main, /runStartupModule\("runs", async \(\) =>/);
  assert.match(main, /const runs = await listRuns\(\)/);
  assert.match(main, /runStartupModule\("tools", detectTools\)/);
});

test("减少动态效果偏好覆盖启动和扫描动画", () => {
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.boot-screen,[\s\S]*\.boot-progress i/);
  assert.match(styles, /\.boot-module-list \.loading i/);
  assert.match(styles, /animation: none/);
});
