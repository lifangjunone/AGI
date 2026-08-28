const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const readSource = (name) =>
  fs.readFileSync(path.join(__dirname, "..", "src", name), "utf8");

const html = readSource("index.html");
const renderer = readSource("renderer.js");
const styles = readSource("styles.css");

test("首页用可访问的交付脉搏公开当前监管重点", () => {
  assert.match(
    html,
    /id="homePulse"[\s\S]*aria-labelledby="homePulseTitle"/
  );
  assert.match(html, /id="homePulseGrid"/);
  assert.match(renderer, /function taskNeedsAttention\(run\)/);
  assert.match(
    renderer,
    /state\.runs\.filter\(taskNeedsAttention\)/
  );
  assert.match(renderer, /label: "需关注"/);
  assert.match(renderer, /label: "正在执行"/);
  assert.match(renderer, /label: "等待接管"/);
  assert.match(renderer, /label: "最近交付"/);
});

test("最新系统展示真实交付收据而不是装饰占位", () => {
  assert.doesNotMatch(renderer, /SYSTEM READY/);
  assert.match(renderer, /class="delivery-receipt-status"/);
  assert.match(renderer, /本地系统可直接使用/);
  assert.match(renderer, /latestOutput\.output\.url/);
  assert.match(renderer, /latestOutput\.output\.deployedAt/);
  assert.match(renderer, /event\.type === "acceptance\.passed"/);
  assert.match(renderer, /event\.type === "quality\.gates\.passed"/);
});

test("首页监管摘要可直达并聚焦对应任务", () => {
  const focusTaskBody = renderer.match(
    /function focusSupervisedTask\(runId\) \{([\s\S]*?)\n\}/
  )?.[1];
  assert.ok(focusTaskBody);
  assert.match(renderer, /data-focus-task=/);
  assert.match(renderer, /function focusSupervisedTask\(runId\)/);
  assert.match(renderer, /state\.taskVisibleCount = Math\.max/);
  assert.match(renderer, /data-task-run-id=/);
  assert.match(
    renderer,
    /task\?\.scrollIntoView\(\{[\s\S]*block: "start",[\s\S]*behavior: "auto"/
  );
  assert.match(
    renderer,
    /task\?\.querySelector\("\.task-title"\)\?\.focus/
  );
  assert.doesNotMatch(focusTaskBody, /requestAnimationFrame/);
});

test("监管数据刷新后恢复原任务控件焦点", () => {
  assert.match(renderer, /function captureTaskFocus\(\)/);
  assert.match(renderer, /function restoreTaskFocus\(token\)/);
  assert.match(renderer, /viewportTop: task\.getBoundingClientRect\(\)\.top/);
  assert.match(
    renderer,
    /main\.scrollTop \+= task\.getBoundingClientRect\(\)\.top - token\.viewportTop/
  );
  assert.match(
    renderer,
    /const taskFocus = captureTaskFocus\(\);[\s\S]*restoreTaskFocus\(taskFocus\)/
  );
  assert.match(renderer, /token\.control === "evidence"/);
  assert.match(renderer, /target \|\| task\.querySelector\("\.task-title"\)/);
});

test("交付脉搏宽屏四列且紧凑桌面稳定降为两列", () => {
  assert.match(renderer, /const recent = state\.runs\.slice\(0, 4\)/);
  assert.match(
    styles,
    /\.home-pulse-grid\s*\{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/
  );
  assert.match(
    styles,
    /@media[^{]*\{[\s\S]*?\.home-pulse-grid\s*\{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/
  );
  assert.match(
    styles,
    /\.home-pulse-item\s*\{[\s\S]*?min-height: 110px/
  );
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.home-pulse-item/
  );
});
