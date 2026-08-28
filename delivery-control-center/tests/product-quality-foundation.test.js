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
const styles = fs.readFileSync(
  path.join(__dirname, "..", "src", "styles.css"),
  "utf8"
);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")
);

test("首页和管理页面默认收起完整工具链并支持按需展开", () => {
  assert.match(html, /id="toolchainExpandButton"/);
  assert.match(renderer, /function updateToolchainDensity/);
  assert.match(
    renderer,
    /state\.page !== "workspace" && !state\.toolchainExpanded/
  );
  assert.match(renderer, /button\.hidden = state\.page === "workspace"/);
  assert.match(styles, /body\.compact-toolchain \.toolchain-flow/);
});

test("全局通知可访问、可关闭并区分结果类型", () => {
  assert.match(html, /id="toast" role="status" aria-live="polite"/);
  assert.match(html, /id="dismissToastButton"/);
  assert.match(renderer, /resolvedType/);
  assert.match(styles, /\.toast\[data-type="success"\]/);
  assert.match(styles, /\.toast\[data-type="error"\]/);
});

test("桌面端提供导航、导入与逐层关闭快捷操作", () => {
  assert.match(renderer, /document\.addEventListener\("keydown"/);
  assert.match(renderer, /"1": "home"/);
  assert.match(renderer, /"5": "radar"/);
  assert.match(renderer, /event\.key\.toLowerCase\(\) === "n"/);
  assert.match(renderer, /event\.key === "Escape"/);
});

test("技术雷达空态提供业务路径、动态反馈和直接行动", () => {
  assert.match(renderer, /class="radar-empty-state"/);
  assert.match(renderer, /需求能力[\s\S]*开源候选[\s\S]*代码证据[\s\S]*风险结论/);
  assert.match(renderer, /id="radarImportButton"/);
  assert.match(styles, /\.radar-empty-sweep/);
});

test("macOS 正式包使用 OneOPC 品牌图标", () => {
  const iconPath = packageJson.build.mac.icon;
  assert.equal(iconPath, "build/OneOPC.icns");
  assert.equal(
    fs.existsSync(path.join(__dirname, "..", iconPath)),
    true
  );
});
