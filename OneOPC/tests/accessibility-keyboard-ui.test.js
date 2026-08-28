const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const readSource = (name) =>
  fs.readFileSync(path.join(__dirname, "..", "src", name), "utf8");

const html = readSource("index.html");
const renderer = readSource("renderer.js");
const styles = readSource("styles.css");

test("所有关键图标按钮具有稳定的辅助技术名称", () => {
  assert.match(html, /id="refreshButton"[^>]*aria-label="刷新运行记录"/);
  assert.match(html, /id="rescanToolsButton"[^>]*aria-label="重新扫描"/);
  assert.match(
    html,
    /id="closeEmployeeDialogButton"[^>]*aria-label="关闭数字员工窗口"/
  );
  assert.match(
    html,
    /id="closeRequirementDialogButton"[^>]*aria-label="关闭"/
  );
  assert.match(
    html,
    /id="closeGraphButton"[^>]*aria-label="收起代码证据图谱"/
  );
  assert.match(
    html,
    /id="discardRequirementDraftButton"[^>]*aria-label="丢弃未提交的需求草稿"/
  );
  assert.match(
    html,
    /id="discardEmployeeDraftButton"[^>]*aria-label="丢弃未提交的员工草稿"/
  );
});

test("三个模态层关联标题和说明内容", () => {
  assert.match(
    html,
    /id="employeeDialog"[\s\S]*aria-labelledby="employeeDialogTitle"[\s\S]*aria-describedby="employeeDialogHint"/
  );
  assert.match(
    html,
    /id="requirementDialog"[\s\S]*aria-labelledby="requirementDialogTitle"[\s\S]*aria-describedby="requirementDialogDescription"/
  );
  assert.match(
    html,
    /id="actionDialog"[\s\S]*aria-labelledby="actionDialogTitle"[\s\S]*aria-describedby="actionDialogSummary actionDialogDetail"/
  );
});

test("模态焦点进入、循环和关闭后归还由统一契约管理", () => {
  assert.match(renderer, /const modalReturnFocus = new WeakMap\(\)/);
  assert.match(renderer, /function openModal\(dialog, initialFocusSelector\)/);
  assert.match(renderer, /function trapActiveModalFocus\(event\)/);
  assert.match(renderer, /event\.key !== "Tab"/);
  assert.match(renderer, /function restoreModalFocus\(dialog\)/);
  assert.match(
    renderer,
    /document\.querySelectorAll\("dialog"\)\.forEach\([\s\S]*restoreModalFocus/
  );
});

test("危险确认默认聚焦取消而不是破坏性操作", () => {
  assert.match(
    html,
    /id="actionDialogCancelButton" value="cancel" autofocus/
  );
  assert.match(html, /id="employeeName"[^>]*autofocus/);
  assert.match(html, /id="requirementTitle"[^>]*autofocus/);
  assert.match(renderer, /openModal\(dialog, "#actionDialogCancelButton"\)/);
});

test("需求输入页签支持标准方向键并保持 roving tabindex", () => {
  assert.match(
    renderer,
    /\["ArrowLeft", "ArrowRight", "Home", "End"\]/
  );
  assert.match(renderer, /button\.tabIndex = active \? 0 : -1/);
  assert.match(renderer, /setRequirementInputMode\(nextTab\.dataset\.requirementMode/);
  assert.match(renderer, /nextTab\.focus\(\)/);
});

test("页面快捷键切换后把焦点移到新页面标题", () => {
  assert.match(renderer, /function focusPageHeading\(page\)/);
  assert.match(renderer, /setPage\(pageByKey\[event\.key\]\)/);
  assert.match(renderer, /focusPageHeading\(pageByKey\[event\.key\]\)/);
});

test("所有控件共享清晰焦点环且字号不低于 10px", () => {
  assert.match(
    styles,
    /button:focus-visible,[\s\S]*input:focus-visible,[\s\S]*select:focus-visible/
  );
  assert.match(styles, /outline: 2px solid #aeb7ff !important/);
  assert.match(styles, /\* \{[\s\S]*letter-spacing: 0 !important/);

  const sizes = [
    ...styles.matchAll(/font(?:-size)?:[^;\n]*?(\d+(?:\.\d+)?)px/g)
  ].map((match) => Number(match[1]));
  assert.ok(sizes.length > 100);
  assert.equal(
    sizes.filter((size) => size < 10).length,
    0,
    "CSS must not contain fonts smaller than 10px"
  );
});
