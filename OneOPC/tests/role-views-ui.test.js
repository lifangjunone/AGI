const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(
  path.join(__dirname, "..", "src", "index.html"),
  "utf8"
);
const renderer = fs.readFileSync(
  path.join(__dirname, "..", "src", "renderer.js"),
  "utf8"
);

function section(id, nextId) {
  const start = html.indexOf(`id="${id}"`);
  const end = html.indexOf(`id="${nextId}"`, start);
  return html.slice(start, end);
}

test("领导视角只展示进度、责任人、风险和体验入口", () => {
  const overview = section("overviewView", "detailView");
  for (const id of [
    "executiveProgress",
    "executiveOwnerName",
    "executiveRiskTitle",
    "executiveExperienceState",
    "openOutputButton"
  ]) {
    assert.match(overview, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(
    overview,
    /SHA-256|run\.json|Run ID|原始数据|Provider API|CodeGraph|工具路径/
  );
});

test("开发者视角集中展示运行健康、检查点、恢复和技术证据", () => {
  const detail = html.slice(html.indexOf('id="detailView"'));
  for (const id of [
    "developerRunId",
    "developerCheckpoint",
    "developerRecoveryCount",
    "developerWorkState",
    "developerCodeState",
    "rawLog",
    "stageInspector",
    "intelligencePanel",
    "graphPanel"
  ]) {
    assert.match(detail, new RegExp(`id="${id}"`));
  }
});

test("切换视角会移动项目协作区并应用角色模式", () => {
  assert.match(renderer, /document\.body\.classList\.toggle\(\s*"executive-mode"/);
  assert.match(renderer, /document\.body\.classList\.toggle\(\s*"developer-mode"/);
  assert.match(renderer, /coordinationSlot\.append\(elements\.coordinationPanel\)/);
});
