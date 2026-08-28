const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const readSource = (name) =>
  fs.readFileSync(path.join(__dirname, "..", "src", name), "utf8");

const html = readSource("index.html");
const renderer = readSource("renderer.js");
const styles = readSource("styles.css");

test("技术雷达明确展示列含义、中文状态和评分口径", () => {
  assert.match(renderer, /项目与检索状态/);
  assert.match(renderer, /首选开源方案/);
  assert.match(renderer, /匹配分/);
  assert.match(renderer, /function technologyStatusText\(value\)/);
  assert.match(renderer, /completed: "已完成"/);
  assert.match(renderer, /top \? "满分 100" : "暂无评分"/);
  assert.match(renderer, /aria-label=".*匹配分/s);
});

test("没有技术候选时不再用零分冒充已完成评分", () => {
  assert.match(
    renderer,
    /score === undefined \|\| score === null \? "—" : String\(score\)/
  );
  assert.match(renderer, /top \? "首选技术参考" : "尚未形成推荐"/);
  assert.doesNotMatch(renderer, /<em>\$\{top\?\.score \|\| 0\}<\/em>/);
});

test("全局状态与监管协议使用客户可理解的中文语义", () => {
  assert.match(html, /真实执行/);
  assert.match(html, /阶段 <b id="footerStage">待选择<\/b>/);
  assert.match(html, /运行 <b id="footerRun">未选择<\/b>/);
  assert.match(html, /10 秒扫描 · 45 秒心跳 · 检查点续跑/);
  assert.match(renderer, /等待上游阶段与执行器就绪/);
  assert.doesNotMatch(html, /real execution|checkpoint resume/);
});

test("1080 宽度保持四列任务指标并提升关键点击目标", () => {
  const narrowBlock = styles.slice(styles.indexOf("@media (max-width: 1120px)"));
  assert.doesNotMatch(
    narrowBlock,
    /\.task-metrics\s*\{\s*grid-template-columns:\s*repeat\(2,\s*1fr\)/
  );
  assert.match(styles, /\.tool-alternatives button\s*\{[\s\S]*min-height: 32px/);
  assert.match(styles, /\.text-command,[\s\S]*min-height: 32px/);
  assert.match(styles, /\.scan-button\s*\{[\s\S]*width: 32px;[\s\S]*height: 32px/);
});

test("1080 宽度保持双列数字员工资产视图", () => {
  const narrowBlock = styles.slice(styles.indexOf("@media (max-width: 1120px)"));
  assert.match(
    styles,
    /\.employee-roster\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/
  );
  assert.doesNotMatch(
    narrowBlock,
    /\.employee-roster\s*\{\s*grid-template-columns:\s*1fr/
  );
});
