const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(
  path.join(__dirname, "..", "src", "index.html"),
  "utf8"
);

test("顶部导航区分交付管理与能力中心", () => {
  assert.match(html, /class="nav-cluster delivery-nav"/);
  assert.match(html, /class="nav-cluster capability-nav"/);
  assert.match(html, /class="nav-separator"/);
});

test("顶部导航使用客户可理解的业务名称", () => {
  for (const label of ["首页", "项目交付", "任务监管", "数字员工", "技术雷达"]) {
    assert.match(html, new RegExp(label));
  }
});
