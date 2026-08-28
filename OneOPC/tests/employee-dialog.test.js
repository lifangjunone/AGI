const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(
  path.join(__dirname, "..", "src", "index.html"),
  "utf8"
);

test("数字员工关闭和取消按钮不提交表单", () => {
  assert.match(
    html,
    /id="closeEmployeeDialogButton" type="button"/
  );
  assert.match(
    html,
    /id="cancelEmployeeDialogButton" type="button"/
  );
});

test("只有保存数字员工按钮触发表单提交", () => {
  assert.match(html, /id="saveEmployeeButton" type="submit"/);
});
