const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const renderer = fs.readFileSync(
  path.join(__dirname, "..", "src", "renderer.js"),
  "utf8"
);

test("同项目版本默认折叠并保留会话内展开状态", () => {
  assert.match(renderer, /expandedHistoryProjects: new Set\(\)/);
  assert.match(
    renderer,
    /Boolean\(query\) \|\| state\.expandedHistoryProjects\.has\(project\)/
  );
  assert.match(renderer, /\$\{expanded \? "" : "hidden"\}/);
});

test("项目折叠标题可访问且点击切换版本列表", () => {
  assert.match(renderer, /aria-expanded="\$\{expanded\}"/);
  assert.match(renderer, /aria-controls="historyVersions\$\{groupIndex\}"/);
  assert.match(renderer, /data-history-project-index/);
  assert.match(renderer, /state\.expandedHistoryProjects\.(add|delete)/);
});
