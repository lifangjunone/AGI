const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildTextRequirementAsset,
  deriveRequirementTitle,
  normalizeRequirementDescription,
  normalizeRequirementTitle
} = require("../src/requirement-input");

const html = fs.readFileSync(
  path.join(__dirname, "..", "src", "index.html"),
  "utf8"
);
const main = fs.readFileSync(
  path.join(__dirname, "..", "src", "main.js"),
  "utf8"
);
const preload = fs.readFileSync(
  path.join(__dirname, "..", "src", "preload.js"),
  "utf8"
);
const renderer = fs.readFileSync(
  path.join(__dirname, "..", "src", "renderer.js"),
  "utf8"
);

test("文字需求规范化项目名称和正文", () => {
  assert.equal(normalizeRequirementTitle("  设备   检修系统  "), "设备 检修系统");
  assert.equal(
    normalizeRequirementDescription("  为维修班组提供完整工单闭环。  "),
    "为维修班组提供完整工单闭环。"
  );
  assert.throws(() => normalizeRequirementTitle("A"), /至少需要 2 个字符/);
  assert.throws(() => normalizeRequirementDescription("太短"), /至少需要 10 个字符/);
  assert.equal(
    deriveRequirementTitle("我需要一个客户反馈管理系统。支持反馈分派。"),
    "一个客户反馈管理系统"
  );
});

test("项目名称为空时从需求第一句自动生成", () => {
  const asset = buildTextRequirementAsset({
    description: "帮我做一个会议室预订系统。需要冲突检测和审批。"
  });
  assert.equal(asset.title, "做一个会议室预订系统");
  assert.match(asset.content, /^# 做一个会议室预订系统/m);
});

test("文字需求生成带时间、标题和原文的 Markdown 归档", () => {
  const asset = buildTextRequirementAsset(
    {
      title: "设备检修工单",
      description: "为维修班组提供报修、派单、处理和验收闭环。"
    },
    new Date("2026-08-17T10:00:00.000Z")
  );

  assert.equal(asset.name, "原始需求.md");
  assert.match(asset.content, /^# 设备检修工单/m);
  assert.match(asset.content, /2026-08-17T10:00:00.000Z/);
  assert.match(asset.content, /为维修班组提供报修、派单、处理和验收闭环。/);
  assert.equal(asset.preview, asset.description);
});

test("统一需求入口支持文字描述与需求文档两种模式", () => {
  assert.match(html, /id="requirementDialog"/);
  assert.match(html, /data-requirement-mode="text"/);
  assert.match(html, /data-requirement-mode="file"/);
  assert.match(html, /id="requirementDescription"[^>]+maxlength="20000"/);
  assert.doesNotMatch(html, /id="requirementTitle" required/);
  assert.match(renderer, /function openRequirementDialog/);
  assert.match(renderer, /function importTextRequirement/);
  assert.match(renderer, /function importRequirementFile/);
  assert.match(renderer, /event\.metaKey && event\.key === "Enter"/);
});

test("文字需求通过隔离 IPC 进入同一归档与 Run 链路", () => {
  assert.match(preload, /requirements:import-text/);
  assert.match(main, /ipcMain\.handle\("requirements:import-text"/);
  assert.match(main, /type: "text"/);
  assert.match(main, /requirement\.text_archived/);
  assert.match(main, /importRequirementFromPath\(null, null/);
});
