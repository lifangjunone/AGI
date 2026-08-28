const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(
  path.join(__dirname, "..", "src", "index.html"),
  "utf8"
);

test("工具链突出需求编排到代码执行的主路径", () => {
  assert.match(html, /class="tool-stage work-stage"/);
  assert.match(html, /class="tool-flow-connector"/);
  assert.match(html, /class="tool-stage code-stage"/);
  assert.match(html, /需求编排/);
  assert.match(html, /代码执行/);
});

test("技术增强策略与执行主工具分层展示", () => {
  assert.match(html, /class="intelligence-mode-group"/);
  assert.match(html, /技术增强策略/);
  assert.match(html, /id="toolCapabilityCount"/);
});

test("重新扫描使用图标命令而不是竖排文本", () => {
  assert.match(
    html,
    /id="rescanToolsButton"[^>]+aria-label="重新扫描"[\s\S]*?<svg/
  );
  assert.doesNotMatch(html, />\s*重新扫描\s*<\/button>/);
});
