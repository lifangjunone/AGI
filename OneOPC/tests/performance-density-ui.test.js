const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const readSource = (name) =>
  fs.readFileSync(path.join(__dirname, "..", "src", name), "utf8");

const main = readSource("main.js");
const renderer = readSource("renderer.js");
const styles = readSource("styles.css");

test("压力档案只能在未打包开发态显式启用", () => {
  assert.match(
    main,
    /const stressProfileEnabled =\s*!app\.isPackaged && process\.env\.ONEOPC_STRESS_PROFILE === "1"/
  );
  assert.match(main, /if \(!stressProfileEnabled\) return runs/);
  assert.match(main, /return buildStressRuns\(runs\)\.map/);
  assert.match(
    main,
    /stressProfileEnabled[\s\S]*\? buildStressEmployees\(employees\)[\s\S]*: employees/
  );
  assert.match(main, /const stressSupervisionRuns = new Map\(\)/);
  assert.match(
    main,
    /!app\.isPackaged &&\s*process\.env\.ONEOPC_STRESS_CANCEL_MODE === "pending"/
  );
  assert.match(
    main,
    /if \(!stressProfileEnabled \|\| !runId\.startsWith\("STRESS-"\)\)/
  );
});

test("高密度页面使用明确的渐进渲染批次", () => {
  assert.match(renderer, /historyGroups: 8/);
  assert.match(renderer, /historyVersions: 12/);
  assert.match(renderer, /employees: 12/);
  assert.match(renderer, /tasks: 10/);
  assert.match(renderer, /radar: 15/);
  assert.match(renderer, /data-load-history-versions/);
  assert.match(renderer, /data-load-employees/);
  assert.match(renderer, /data-load-tasks/);
  assert.match(renderer, /data-load-radar/);
});

test("后台刷新通过数据签名去重且只渲染当前页面", () => {
  assert.match(renderer, /function runsDataSignature\(runs\)/);
  assert.match(renderer, /const changed = nextSignature !== state\.dataSignature/);
  assert.match(renderer, /if \(!changed\) return true/);
  assert.match(renderer, /function renderCurrentPage\(\)/);
  assert.doesNotMatch(
    renderer,
    /state\.runs = versionRuns\(await window\.oneopc\.listRuns\(\)\);[\s\S]{0,300}renderHome\(\);[\s\S]{0,100}renderHistory\(\);[\s\S]{0,100}renderTasks\(\)/
  );
});

test("顶级页面保存独立滚动位置避免跨页面跳到中段", () => {
  assert.match(renderer, /pageScrollPositions: new Map\(\)/);
  assert.match(renderer, /function pageScrollKey\(page\)/);
  assert.match(
    renderer,
    /state\.pageScrollPositions\.set\([\s\S]*pageScrollKey\(state\.page\)/
  );
  assert.match(
    renderer,
    /main\.scrollTop = state\.pageScrollPositions\.get\(pageScrollKey\(page\)\) \|\| 0/
  );
});

test("渲染预算与长任务记录可由 Electron 验收读取", () => {
  assert.match(renderer, /const RENDER_BUDGETS_MS = Object\.freeze/);
  assert.match(renderer, /window\.__oneopcPerformance = state\.performance/);
  assert.match(renderer, /new PerformanceObserver/);
  assert.match(renderer, /longTaskObserver\.observe\(\{ type: "longtask"/);
  assert.match(renderer, /OneOPC render budget exceeded/);
});

test("离屏高密度条目启用浏览器内容跳过优化", () => {
  for (const selector of [
    ".roster-employee",
    ".task-row",
    ".history-project",
    ".radar-run"
  ]) {
    const escaped = selector.replace(".", "\\.");
    const rule = styles.match(
      new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`)
    )?.[1];
    assert.ok(rule, `${selector} rule must exist`);
    assert.match(
      rule,
      /content-visibility: auto/
    );
  }
  assert.match(styles, /\.progressive-load-button/);
});
