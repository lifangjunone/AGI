const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const readSource = (name) =>
  fs.readFileSync(path.join(__dirname, "..", "src", name), "utf8");

const main = readSource("main.js");
const styles = readSource("styles.css");
const windowState = readSource("window-state.js");

test("原生窗口允许产品要求的 980×640 最小尺寸", () => {
  assert.match(
    windowState,
    /MINIMUM_SIZE = Object\.freeze\(\{ width: 980, height: 640 \}\)/
  );
  assert.match(main, /minWidth: Math\.min\(MINIMUM_SIZE\.width, primaryArea\.width\)/);
  assert.match(main, /minHeight: Math\.min\(MINIMUM_SIZE\.height, primaryArea\.height\)/);
});

test("紧凑桌面保留四列任务指标和双列数字员工", () => {
  const narrowBlock = styles.slice(styles.indexOf("@media (max-width: 1120px)"));
  assert.doesNotMatch(
    narrowBlock,
    /\.task-metrics\s*\{\s*grid-template-columns:\s*repeat\(2,\s*1fr\)/
  );
  assert.doesNotMatch(
    narrowBlock,
    /\.employee-roster\s*\{\s*grid-template-columns:\s*1fr/
  );
});

test("领导视角长技术标题不能撑破三列决策区", () => {
  assert.match(
    styles,
    /\.executive-brief header > div\s*\{[\s\S]*min-width: 0;[\s\S]*flex: 1;/
  );
  assert.match(
    styles,
    /\.executive-brief header h2\s*\{[\s\S]*overflow: hidden;[\s\S]*text-overflow: ellipsis;[\s\S]*white-space: nowrap;/
  );
});

test("紧凑桌面常用筛选、员工操作和表单控件不低于 32px", () => {
  assert.match(styles, /\.history-filter-button\s*\{[\s\S]*min-height: 32px/);
  assert.match(
    styles,
    /\.roster-profile footer button\s*\{[\s\S]*min-height: 32px/
  );
  assert.match(
    styles,
    /\.employee-form-grid input,[\s\S]*min-height: 34px/
  );
});
