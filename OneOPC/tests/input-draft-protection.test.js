const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const readSource = (name) =>
  fs.readFileSync(path.join(__dirname, "..", "src", name), "utf8");

const main = readSource("main.js");
const preload = readSource("preload.js");
const renderer = readSource("renderer.js");
const html = readSource("index.html");

test("未提交输入保存在 OneOPC 本地设置目录并使用原子替换", () => {
  assert.match(
    main,
    /inputDraftsPath = path\.join\(settingsRoot, "input-drafts\.json"\)/
  );
  assert.match(
    main,
    /inputDraftsBackupPath = path\.join\(settingsRoot, "input-drafts\.backup\.json"\)/
  );
  assert.match(main, /let inputDraftsWriteQueue = Promise\.resolve\(\)/);
  assert.match(main, /async function writeInputDraftCopy\(targetPath, envelope\)/);
  assert.match(main, /await fs\.rename\(temporaryPath, targetPath\)/);
});

test("草稿 IPC 只接受需求与数字员工固定字段", () => {
  assert.match(main, /const INPUT_DRAFT_FIELDS = Object\.freeze\(\{/);
  assert.match(main, /requirement: \["title", "description"\]/);
  assert.match(main, /employee: \[[\s\S]*"responsibility",[\s\S]*"skills"/);
  assert.match(main, /不支持的草稿类型/);
  assert.match(preload, /readInputDrafts: \(\) => ipcRenderer\.invoke\("drafts:read"\)/);
  assert.match(preload, /saveInputDraft: \(scope, value\)/);
  assert.match(preload, /clearInputDraft: \(scope\)/);
});

test("需求和员工输入防抖保存并在重新打开时恢复", () => {
  assert.match(renderer, /window\.setTimeout\(\(\) => saveInputDraftNow\(scope\), 350\)/);
  assert.match(renderer, /await inputDraftsReady/);
  assert.match(renderer, /已恢复上次未提交的需求草稿/);
  assert.match(renderer, /已恢复上次未提交的员工草稿/);
  assert.match(renderer, /addEventListener\("input", \(\) => scheduleInputDraftSave\("requirement"\)\)/);
  assert.match(renderer, /addEventListener\("input", \(\) => scheduleInputDraftSave\("employee"\)\)/);
});

test("关闭表单前刷新草稿且成功提交后清除对应草稿", () => {
  assert.match(
    renderer,
    /async function closeRequirementDialog\(\) \{\s*await saveInputDraftNow\("requirement"\)/
  );
  assert.match(
    renderer,
    /async function closeEmployeeDialog\(\) \{\s*await saveInputDraftNow\("employee"\)/
  );
  assert.match(
    renderer,
    /await clearInputDraft\("requirement"\);[\s\S]*requirementDialog"\)\.close\(\)/
  );
  assert.match(
    renderer,
    /await window\.oneopc\.saveEmployee\([\s\S]*await clearInputDraft\("employee"\)/
  );
});

test("草稿状态向客户和辅助技术实时说明保存结果", () => {
  assert.match(html, /id="requirementDraftStatus" aria-live="polite"/);
  assert.match(html, /id="employeeDraftStatus" aria-live="polite"/);
  assert.match(renderer, /草稿已保存在本机/);
  assert.match(renderer, /草稿保存失败，请勿关闭窗口/);
  assert.match(main, /未提交草稿、运行记录、检查点/);
  assert.match(main, /重新加载后可恢复最近一次成功保存的草稿/);
});

test("草稿提供明确丢弃入口且保留操作不再伪装成取消", () => {
  assert.match(
    html,
    /id="discardRequirementDraftButton"[^>]*aria-label="丢弃未提交的需求草稿"[^>]*hidden/
  );
  assert.match(
    html,
    /id="discardEmployeeDraftButton"[^>]*aria-label="丢弃未提交的员工草稿"[^>]*hidden/
  );
  assert.match(
    html,
    /id="cancelEmployeeDialogButton"[^>]*>稍后继续<\/button>/
  );
  assert.match(renderer, /function discardInputDraft\(scope\)/);
  assert.match(renderer, /confirmLabel: "确认丢弃"/);
});

test("丢弃草稿恢复表单基线且不改变正式项目或员工数据", () => {
  assert.match(renderer, /inputDraftBases: \{/);
  assert.match(
    renderer,
    /applyInputDraftPayload\(scope, state\.inputDraftBases\[scope\]\)/
  );
  assert.match(renderer, /不会创建交付任务，已归档的需求和历史项目不受影响/);
  assert.match(renderer, /不会停用员工或改变已保存的岗位信息/);
  assert.match(renderer, /await clearInputDraft\(scope\)/);
});

test("未修改的员工档案不会因为打开再关闭而生成草稿", () => {
  assert.match(renderer, /function inputDraftDiffersFromBase\(scope, draft\)/);
  assert.match(
    renderer,
    /state\.inputDrafts\[scope\] = inputDraftDiffersFromBase\(scope, draft\)/
  );
  assert.match(renderer, /state\.inputDraftBases\.employee = base/);
});

test("关闭窗口前通过隔离握手立即冲刷防抖草稿", () => {
  assert.match(main, /function requestRendererDraftFlush\(window, timeoutMs = 1200\)/);
  assert.match(main, /window\.webContents\.send\("drafts:flush-request", requestId\)/);
  assert.match(preload, /ipcRenderer\.on\("drafts:flush-request"/);
  assert.match(preload, /ipcRenderer\.send\("drafts:flush-complete", requestId, success\)/);
  assert.match(renderer, /async function flushPendingInputDrafts\(\)/);
  assert.match(renderer, /window\.oneopc\.onDraftFlushRequest\(flushPendingInputDrafts\)/);
});

test("每次输入先把白名单字段预写主进程内存再启动防抖", () => {
  assert.match(preload, /stageInputDraft: \(scope, value\)/);
  assert.match(preload, /ipcRenderer\.sendSync\("drafts:stage", scope, value\)/);
  assert.match(renderer, /window\.oneopc\.stageInputDraft\(scope, inputDraftPayload\(scope\)\)/);
  assert.match(main, /const stagedInputDrafts = new Map\(\)/);
  assert.match(main, /stageInputDraft\(event\.sender\.id, scope, value\)/);
  assert.match(main, /event\.returnValue = stageInputDraft/);
  assert.match(main, /const draft = sanitizeInputDraft\(scope, value\)/);
});

test("关闭门禁等待草稿与窗口状态且有超时防卡死", () => {
  assert.match(
    main,
    /window\.on\("close", \(event\) => \{[\s\S]*event\.preventDefault\(\)[\s\S]*requestRendererDraftFlush\(window\)[\s\S]*then\(\(\) => flushStagedInputDrafts\(webContentsId\)\)[\s\S]*persistWindowState\(window\)/
  );
  assert.match(main, /windowsFlushingDrafts\.has\(window\)/);
  assert.match(main, /windowsReadyToClose\.add\(window\)/);
  assert.match(main, /const timeout = setTimeout\(\(\) => \{/);
  assert.match(main, /resolve\(false\);[\s\S]*\}, timeoutMs\)/);
});

test("退出应用等待草稿原子写队列完成再允许退出", () => {
  const quitBlock = main.slice(main.indexOf('app.on("before-quit"'));
  assert.match(quitBlock, /flushStagedInputDrafts\(webContentsId\)/);
  assert.match(quitBlock, /requestRendererDraftFlush\(window\)/);
  assert.match(quitBlock, /inputDraftsWriteQueue/);
  assert.match(quitBlock, /windowStateWriteQueue/);
  assert.match(quitBlock, /uiPreferencesWriteQueue/);
  assert.match(quitBlock, /quitStatePersisted = true;\s*app\.quit\(\)/);
});

test("提交或丢弃清除预写值防止关闭时复活旧草稿", () => {
  assert.match(
    main,
    /ipcMain\.handle\("drafts:clear", \(event, scope\) => \{[\s\S]*clearStagedInputDraft\(event\.sender\.id, scope\)[\s\S]*updateInputDraft\(scope, null\)/
  );
  assert.match(main, /stagedInputDrafts\.delete\(webContentsId\)/);
});

test("草稿冲刷回执绑定发起窗口且不能跨窗口伪造", () => {
  assert.match(
    main,
    /webContentsId: window\.webContents\.id/
  );
  assert.match(
    main,
    /pending\.webContentsId !== event\.sender\.id/
  );
});

test("草稿双副本使用版本化 SHA-256 完整性封装", () => {
  assert.match(main, /function inputDraftEnvelope\(value/);
  assert.match(main, /schemaVersion: 2/);
  assert.match(main, /algorithm: "sha256"/);
  assert.match(main, /crypto\.createHash\("sha256"\)/);
  assert.match(main, /crypto\.timingSafeEqual/);
  assert.match(main, /await writeInputDraftCopy\(inputDraftsBackupPath, next\)/);
  assert.match(main, /await writeInputDraftCopy\(inputDraftsPath, next\)/);
});

test("损坏副本被隔离并由最新有效副本自愈", () => {
  assert.match(main, /async function quarantineInputDraftCopy\(copy\)/);
  assert.match(main, /\.corrupt-\$\{Date\.now\(\)\}/);
  assert.match(main, /selected\.source === "backup"/);
  assert.match(main, /"backup-restored"/);
  assert.match(main, /"redundancy-repaired"/);
  assert.match(renderer, /草稿主文件异常，已从本机恢复副本找回完整内容/);
  assert.match(renderer, /草稿恢复副本异常，已自动重建/);
  assert.match(renderer, /function consumeInputDraftRecoveryNotice\(\)/);
  assert.match(
    renderer,
    /openModal\(dialog, "#requirementTitle"\);\s*consumeInputDraftRecoveryNotice\(\)/
  );
});

test("旧版单文件草稿兼容读取并升级为双副本格式", () => {
  assert.match(main, /if \(value\.schemaVersion === 1\)/);
  assert.match(main, /legacy: true/);
  assert.match(main, /if \(!primaryCurrent\)/);
  assert.match(main, /if \(!backupCurrent\)/);
});

test("主副本与恢复副本都不可用时明确告知而不伪造恢复", () => {
  assert.match(main, /recovery: quarantined \? "unrecoverable" : null/);
  assert.match(renderer, /草稿文件损坏且无可用副本，异常文件已隔离/);
});

test("草稿隔离文件只按严格名称保留七天且最多四份", () => {
  assert.match(main, /const SETTINGS_HOUSEKEEPING_POLICY = Object\.freeze/);
  assert.match(main, /draftQuarantineRetentionMs: 7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(main, /maxDraftQuarantineFiles: 4/);
  assert.match(
    main,
    /const DRAFT_QUARANTINE_FILE =\s*\/\^input-drafts\(\?:\\\.backup\)\?\\\.json\\\.corrupt-\\d\+\$\//
  );
  assert.match(main, /index >= SETTINGS_HOUSEKEEPING_POLICY\.maxDraftQuarantineFiles/);
  assert.match(
    main,
    /SETTINGS_HOUSEKEEPING_POLICY\.draftQuarantineRetentionMs/
  );
});

test("只有两个草稿都清空后才立即销毁隔离副本", () => {
  assert.match(
    main,
    /if \(!next\.requirement && !next\.employee\) \{\s*await cleanupInputDraftQuarantine\(\{ purgeAll: true \}\)/
  );
  assert.match(main, /purgeAll \|\|[\s\S]*maxDraftQuarantineFiles/);
});

test("崩溃遗留的设置临时文件超过一天自动清理", () => {
  assert.match(main, /temporaryFileRetentionMs: 24 \* 60 \* 60 \* 1000/);
  assert.match(main, /const SETTINGS_TEMPORARY_FILE =/);
  assert.match(main, /async function cleanupStaleSettingsTemporaries\(\)/);
  assert.match(
    main,
    /await runSettingsHousekeeping\(\);[\s\S]*uiPreferences = await readUIPreferences\(\)/
  );
});
