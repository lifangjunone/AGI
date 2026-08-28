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

test("项目阶段轨道位于自主交付小队模块内部", () => {
  const template = html.slice(
    html.indexOf('<template id="projectCoordinationTemplate">'),
    html.indexOf("</template>") + 11
  );
  assert.match(template, /id="stageTrack"/);
  assert.match(template, /项目自主交付小队/);
});

test("不再保留重复的独立协作轨迹面板", () => {
  assert.doesNotMatch(html, /collaboration-stage/);
  assert.doesNotMatch(html, /collaborationTrajectory/);
  assert.doesNotMatch(html, /trajectoryNarration/);
});

test("模板挂载到视角插槽后重新绑定项目阶段轨道", () => {
  assert.match(renderer, /#overviewCoordinationSlot/);
  assert.match(renderer, /#detailCoordinationSlot/);
  assert.match(
    renderer,
    /elements\.stageTrack = document\.querySelector\("#stageTrack"\)/
  );
});

test("领导轨道展示卡通数字员工并播放真实交接动效", () => {
  assert.match(renderer, /class="stage-employee-avatar/);
  assert.match(renderer, /employeePortraitMarkup\(/);
  assert.match(renderer, /class="avatar-energy-field"/);
  assert.match(renderer, /class="avatar-orbit outer"/);
  assert.match(renderer, /class="avatar-scan-line"/);
  assert.match(renderer, /index === traceStage \? "trace-active"/);
  assert.match(renderer, /class="track-live-avatar/);
});

test("领导点击数字员工展示职责与上下游而不切换开发者视角", () => {
  assert.match(renderer, /function executiveEmployeeProfile/);
  assert.match(renderer, /本阶段工作/);
  assert.match(renderer, /上游/);
  assert.match(renderer, /下游/);
  assert.match(
    renderer,
    /if \(state\.view === "overview"\) \{[\s\S]*state\.executiveEmployeeStage = index/
  );
  assert.doesNotMatch(
    renderer,
    /data-stage[\s\S]{0,900}selectStage\(Number\(button\.dataset\.stage\), true\)/
  );
});
