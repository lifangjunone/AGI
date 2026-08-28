const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  Notification,
  screen,
  session,
  shell
} = require("electron");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");
const {
  analyzeTechnology,
  buildQueryProfile
} = require("./tech-intelligence");
const {
  callSidecar,
  executeAdvisory,
  sidecarPath
} = require("./technology-advisory");
const { generateCodeGraph } = require("./codegraph-adapter");
const {
  TaskSupervisor,
  initialSupervision
} = require("./task-supervisor");
const { buildCoordination } = require("./delivery-coordinator");
const {
  normalizeRegistry,
  selectProjectTeam,
  validateEmployee
} = require("./digital-employees");
const { buildTextRequirementAsset } = require("./requirement-input");
const {
  buildStressEmployees,
  buildStressRuns
} = require("./stress-fixtures");
const {
  MINIMUM_SIZE,
  captureWindowState,
  restoreWindowState
} = require("./window-state");

const projectRoot = path.resolve(__dirname, "..");
const execFileAsync = promisify(execFile);
const RENDERER_RECOVERY_POLICY = Object.freeze({
  windowMs: 60_000,
  maxAutomaticReloads: 2,
  heartbeatCheckMs: 4_000,
  heartbeatStaleMs: 10_000,
  heartbeatMissThreshold: 2,
  unresponsiveDelayMs: 8_000,
  loadTimeoutMs: 15_000
});
const SETTINGS_HOUSEKEEPING_POLICY = Object.freeze({
  draftQuarantineRetentionMs: 7 * 24 * 60 * 60 * 1000,
  maxDraftQuarantineFiles: 4,
  temporaryFileRetentionMs: 24 * 60 * 60 * 1000
});
const DRAFT_QUARANTINE_FILE =
  /^input-drafts(?:\.backup)?\.json\.corrupt-\d+$/;
const SETTINGS_TEMPORARY_FILE =
  /^(?:window-state|ui-preferences|runtime-recovery|input-drafts(?:\.backup)?)\.json\.tmp-\d+(?:-\d+)?$/;
let inputRoot;
let runRoot;
let settingsRoot;
let employeeRegistryPath;
let windowStatePath;
let runtimeRecoveryPath;
let inputDraftsPath;
let inputDraftsBackupPath;
let uiPreferencesPath;
let detectedToolchain;
let taskSupervisor;
let handoffStatusTimer;
let windowStateTimer;
let windowCreationPromise;
let windowStateWriteQueue = Promise.resolve();
let runtimeRecoveryWriteQueue = Promise.resolve();
let inputDraftsWriteQueue = Promise.resolve();
let uiPreferencesWriteQueue = Promise.resolve();
let uiPreferences = { density: "standard" };
let draftFlushSequence = 0;
const pendingDraftFlushes = new Map();
const stagedInputDrafts = new Map();
const windowsReadyToClose = new WeakSet();
const windowsFlushingDrafts = new WeakSet();
let isQuitting = false;
let quitStatePersisted = false;
let backgroundHintShown = false;
let backgroundNotification;
let dataDirectoriesReady = Promise.resolve();
let supervisionReady = Promise.resolve();
const activeIntelligenceRuns = new Map();
const rendererRecoveryStates = new WeakMap();
const hasSingleInstanceLock = app.requestSingleInstanceLock();
const stressProfileEnabled =
  !app.isPackaged && process.env.ONEOPC_STRESS_PROFILE === "1";
const stressCancelPending =
  !app.isPackaged &&
  process.env.ONEOPC_STRESS_CANCEL_MODE === "pending";
const stressSupervisionRuns = new Map();
const developmentFaults = new Map(
  String(process.env.ONEOPC_FAULT_MODULES || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const [moduleId, mode] = value.split(":");
      const finiteCount = Number.parseInt(mode, 10);
      return [
        moduleId,
        mode === "once"
          ? 1
          : Number.isInteger(finiteCount) && finiteCount > 0
            ? finiteCount
            : Number.POSITIVE_INFINITY
      ];
    })
);

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    const handoffIndex = commandLine.indexOf("--technology-handoff");
    if (handoffIndex >= 0 && commandLine[handoffIndex + 1]) {
      acceptTechnologyHandoff(commandLine[handoffIndex + 1]).catch(() => {});
    }
    showMainWindow().catch(() => {});
  });
}

function configureDataPaths() {
  const dataRoot = app.isPackaged ? app.getPath("userData") : projectRoot;
  inputRoot = path.join(dataRoot, "inputs", "requirements");
  runRoot = path.join(dataRoot, "work", "runs");
  settingsRoot = path.join(dataRoot, "settings");
  employeeRegistryPath = path.join(settingsRoot, "digital-employees.json");
  windowStatePath = path.join(settingsRoot, "window-state.json");
  runtimeRecoveryPath = path.join(settingsRoot, "runtime-recovery.json");
  inputDraftsPath = path.join(settingsRoot, "input-drafts.json");
  inputDraftsBackupPath = path.join(settingsRoot, "input-drafts.backup.json");
  uiPreferencesPath = path.join(settingsRoot, "ui-preferences.json");
}

function normalizeUIPreferences(value) {
  return {
    density: value?.density === "comfortable" ? "comfortable" : "standard"
  };
}

async function readUIPreferences() {
  await dataDirectoriesReady;
  try {
    return normalizeUIPreferences(
      JSON.parse(await fs.readFile(uiPreferencesPath, "utf8"))
    );
  } catch {
    return normalizeUIPreferences(null);
  }
}

function saveUIPreferences(value) {
  uiPreferencesWriteQueue = uiPreferencesWriteQueue
    .catch(() => {})
    .then(async () => {
      await dataDirectoriesReady;
      uiPreferences = normalizeUIPreferences(value);
      const temporaryPath = `${uiPreferencesPath}.tmp-${process.pid}`;
      await fs.writeFile(
        temporaryPath,
        `${JSON.stringify({ schemaVersion: 1, ...uiPreferences }, null, 2)}\n`,
        "utf8"
      );
      await fs.rename(temporaryPath, uiPreferencesPath);
      return uiPreferences;
    });
  return uiPreferencesWriteQueue;
}

const INPUT_DRAFT_FIELDS = Object.freeze({
  requirement: ["title", "description"],
  employee: [
    "id",
    "name",
    "roleId",
    "department",
    "toolBinding",
    "responsibility",
    "skills"
  ]
});

function sanitizeInputDraft(scope, value) {
  const fields = INPUT_DRAFT_FIELDS[scope];
  if (!fields || !value || typeof value !== "object") return null;
  return Object.fromEntries(
    fields.map((field) => [field, String(value[field] ?? "")])
  );
}

function inputDraftEnvelope(value, savedAt = new Date().toISOString()) {
  const record = {
    schemaVersion: 2,
    savedAt,
    requirement: sanitizeInputDraft("requirement", value?.requirement),
    employee: sanitizeInputDraft("employee", value?.employee)
  };
  const digest = crypto
    .createHash("sha256")
    .update(JSON.stringify(record))
    .digest("hex");
  return {
    ...record,
    integrity: {
      algorithm: "sha256",
      digest
    }
  };
}

function validateInputDraftEnvelope(value) {
  if (!value || typeof value !== "object") return null;
  if (value.schemaVersion === 1) {
    return {
      record: inputDraftEnvelope(value, value.savedAt),
      legacy: true
    };
  }
  if (
    value.schemaVersion !== 2 ||
    value.integrity?.algorithm !== "sha256" ||
    !/^[a-f0-9]{64}$/.test(value.integrity?.digest || "") ||
    !Number.isFinite(Date.parse(value.savedAt))
  ) {
    return null;
  }
  const record = {
    schemaVersion: 2,
    savedAt: String(value.savedAt || ""),
    requirement: sanitizeInputDraft("requirement", value.requirement),
    employee: sanitizeInputDraft("employee", value.employee)
  };
  const digest = crypto
    .createHash("sha256")
    .update(JSON.stringify(record))
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(digest, "hex"),
    Buffer.from(value.integrity.digest, "hex")
  )
    ? { record: { ...record, integrity: value.integrity }, legacy: false }
    : null;
}

async function readInputDraftCopy(targetPath, source) {
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    const validated = validateInputDraftEnvelope(JSON.parse(raw));
    return validated
      ? { ...validated, source, targetPath }
      : { source, targetPath, invalid: true };
  } catch (error) {
    return error?.code === "ENOENT"
      ? { source, targetPath, missing: true }
      : { source, targetPath, invalid: true };
  }
}

async function writeInputDraftCopy(targetPath, envelope) {
  const temporaryPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(
    temporaryPath,
    `${JSON.stringify(envelope, null, 2)}\n`,
    "utf8"
  );
  await fs.rename(temporaryPath, targetPath);
}

async function quarantineInputDraftCopy(copy) {
  if (!copy?.invalid) return false;
  try {
    await fs.rename(
      copy.targetPath,
      `${copy.targetPath}.corrupt-${Date.now()}`
    );
    return true;
  } catch {
    return false;
  }
}

async function settingsArtifacts(pattern) {
  await dataDirectoriesReady;
  const names = await fs.readdir(settingsRoot).catch(() => []);
  const artifacts = await Promise.all(
    names
      .filter((name) => pattern.test(name))
      .map(async (name) => {
        const targetPath = path.join(settingsRoot, name);
        try {
          const stat = await fs.stat(targetPath);
          return stat.isFile()
            ? { name, targetPath, modifiedAt: stat.mtimeMs }
            : null;
        } catch {
          return null;
        }
      })
  );
  return artifacts.filter(Boolean);
}

async function cleanupInputDraftQuarantine({ purgeAll = false } = {}) {
  const artifacts = (await settingsArtifacts(DRAFT_QUARANTINE_FILE))
    .sort((left, right) => right.modifiedAt - left.modifiedAt);
  const now = Date.now();
  const expired = artifacts.filter(
    (artifact, index) =>
      purgeAll ||
      index >= SETTINGS_HOUSEKEEPING_POLICY.maxDraftQuarantineFiles ||
      now - artifact.modifiedAt >
        SETTINGS_HOUSEKEEPING_POLICY.draftQuarantineRetentionMs
  );
  await Promise.all(
    expired.map((artifact) => fs.unlink(artifact.targetPath).catch(() => {}))
  );
  return expired.length;
}

async function cleanupStaleSettingsTemporaries() {
  const artifacts = await settingsArtifacts(SETTINGS_TEMPORARY_FILE);
  const cutoff =
    Date.now() - SETTINGS_HOUSEKEEPING_POLICY.temporaryFileRetentionMs;
  const expired = artifacts.filter(
    (artifact) => artifact.modifiedAt < cutoff
  );
  await Promise.all(
    expired.map((artifact) => fs.unlink(artifact.targetPath).catch(() => {}))
  );
  return expired.length;
}

async function runSettingsHousekeeping() {
  return Promise.all([
    cleanupInputDraftQuarantine(),
    cleanupStaleSettingsTemporaries()
  ]);
}

async function readInputDrafts() {
  await dataDirectoriesReady;
  const copies = await Promise.all([
    readInputDraftCopy(inputDraftsPath, "primary"),
    readInputDraftCopy(inputDraftsBackupPath, "backup")
  ]);
  const valid = copies
    .filter((copy) => copy.record)
    .sort(
      (left, right) =>
        Date.parse(right.record.savedAt || 0) -
        Date.parse(left.record.savedAt || 0)
    );
  const selected = valid[0];
  const invalidCopies = copies.filter((copy) => copy.invalid);
  const quarantined = (
    await Promise.all(invalidCopies.map(quarantineInputDraftCopy))
  ).some(Boolean);
  await cleanupInputDraftQuarantine();

  if (!selected) {
    return {
      schemaVersion: 2,
      requirement: null,
      employee: null,
      recovery: quarantined ? "unrecoverable" : null
    };
  }

  const primaryCurrent =
    !copies[0].legacy &&
    copies[0].record?.integrity?.digest === selected.record.integrity.digest;
  const backupCurrent =
    !copies[1].legacy &&
    copies[1].record?.integrity?.digest === selected.record.integrity.digest;

  if (!primaryCurrent) {
    await writeInputDraftCopy(inputDraftsPath, selected.record);
  }
  if (!backupCurrent) {
    await writeInputDraftCopy(inputDraftsBackupPath, selected.record);
  }

  return {
    schemaVersion: 2,
    requirement: selected.record.requirement,
    employee: selected.record.employee,
    recovery: selected.source === "backup"
      ? "backup-restored"
      : quarantined
        ? "redundancy-repaired"
        : null
  };
}

function updateInputDraft(scope, value) {
  if (!INPUT_DRAFT_FIELDS[scope]) {
    return Promise.reject(new Error("不支持的草稿类型"));
  }

  inputDraftsWriteQueue = inputDraftsWriteQueue
    .catch(() => {})
    .then(async () => {
      const current = await readInputDrafts();
      const draft = sanitizeInputDraft(scope, value);
      const next = inputDraftEnvelope({
        requirement: current.requirement,
        employee: current.employee,
        [scope]: draft
          ? { ...draft, updatedAt: new Date().toISOString() }
          : null
      });
      await writeInputDraftCopy(inputDraftsBackupPath, next);
      await writeInputDraftCopy(inputDraftsPath, next);
      if (!next.requirement && !next.employee) {
        await cleanupInputDraftQuarantine({ purgeAll: true });
      }
      return next[scope];
    });

  return inputDraftsWriteQueue;
}

function requestRendererDraftFlush(window, timeoutMs = 1200) {
  if (
    !window ||
    window.isDestroyed() ||
    window.webContents.isDestroyed() ||
    window.webContents.isLoadingMainFrame()
  ) {
    return Promise.resolve(false);
  }

  const requestId = `draft-flush-${process.pid}-${++draftFlushSequence}`;
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingDraftFlushes.delete(requestId);
      resolve(false);
    }, timeoutMs);
    timeout.unref?.();
    pendingDraftFlushes.set(requestId, {
      webContentsId: window.webContents.id,
      complete: (success) => {
        clearTimeout(timeout);
        pendingDraftFlushes.delete(requestId);
        resolve(Boolean(success));
      }
    });
    window.webContents.send("drafts:flush-request", requestId);
  });
}

function stageInputDraft(webContentsId, scope, value) {
  const draft = sanitizeInputDraft(scope, value);
  if (!draft) return false;
  const staged = stagedInputDrafts.get(webContentsId) || new Map();
  staged.set(scope, draft);
  stagedInputDrafts.set(webContentsId, staged);
  return true;
}

async function flushStagedInputDrafts(webContentsId) {
  const staged = stagedInputDrafts.get(webContentsId);
  if (!staged?.size) return true;
  const entries = [...staged.entries()];
  await Promise.all(
    entries.map(([scope, draft]) => updateInputDraft(scope, draft))
  );
  if (stagedInputDrafts.get(webContentsId) === staged) {
    entries.forEach(([scope, draft]) => {
      if (staged.get(scope) === draft) staged.delete(scope);
    });
    if (staged.size === 0) stagedInputDrafts.delete(webContentsId);
  }
  return true;
}

function clearStagedInputDraft(webContentsId, scope) {
  const staged = stagedInputDrafts.get(webContentsId);
  if (!staged) return;
  staged.delete(scope);
  if (staged.size === 0) stagedInputDrafts.delete(webContentsId);
}

async function readPersistedWindowState() {
  await dataDirectoriesReady;
  try {
    return JSON.parse(await fs.readFile(windowStatePath, "utf8"));
  } catch {
    return null;
  }
}

function windowStateSnapshot(window) {
  if (!window || window.isDestroyed()) return null;
  const bounds = window.getNormalBounds();
  const display = screen.getDisplayMatching(bounds);
  return captureWindowState(bounds, {
    displayId: display?.id,
    isMaximized: window.isMaximized(),
    isFullScreen: window.isFullScreen()
  });
}

function writeWindowState(snapshot) {
  if (!snapshot) return Promise.resolve();
  windowStateWriteQueue = windowStateWriteQueue
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(settingsRoot, { recursive: true });
      const temporaryPath = `${windowStatePath}.tmp-${process.pid}`;
      await fs.writeFile(
        temporaryPath,
        `${JSON.stringify(snapshot, null, 2)}\n`,
        "utf8"
      );
      await fs.rename(temporaryPath, windowStatePath);
    });
  return windowStateWriteQueue;
}

function persistWindowState(window) {
  return writeWindowState(windowStateSnapshot(window));
}

function scheduleWindowStateSave(window) {
  clearTimeout(windowStateTimer);
  windowStateTimer = setTimeout(() => {
    persistWindowState(window).catch((error) => {
      console.error("OneOPC window state save failed:", error);
    });
  }, 250);
  windowStateTimer.unref?.();
}

function ensureWindowOnVisibleDisplay(window) {
  if (
    !window ||
    window.isDestroyed() ||
    window.isMaximized() ||
    window.isFullScreen()
  ) {
    return;
  }
  const current = windowStateSnapshot(window);
  const restored = restoreWindowState(
    current,
    screen.getAllDisplays(),
    screen.getPrimaryDisplay()
  );
  if (!restored.recoveredToVisibleDisplay) return;
  window.setBounds(restored.bounds, true);
  scheduleWindowStateSave(window);
}

function sendRendererCommand(window, command) {
  if (!window || window.isDestroyed()) return;
  const send = () => {
    if (!window.isDestroyed()) {
      window.webContents.send("app:command", command);
    }
  };
  if (window.webContents.isLoadingMainFrame()) {
    window.webContents.once("did-finish-load", send);
  } else {
    send();
  }
}

function rendererRecoveryState(window) {
  let state = rendererRecoveryStates.get(window);
  if (!state) {
    state = {
      attempts: [],
      recovering: false,
      promptOpen: false,
      unresponsive: false,
      unresponsiveTimer: null,
      loadTimer: null,
      heartbeatTimer: null,
      lastHeartbeatAt: Date.now(),
      missedHeartbeats: 0
    };
    rendererRecoveryStates.set(window, state);
  }
  return state;
}

function recordRuntimeRecovery(type, detail = {}) {
  runtimeRecoveryWriteQueue = runtimeRecoveryWriteQueue
    .catch(() => {})
    .then(async () => {
      await dataDirectoriesReady;
      await fs.mkdir(settingsRoot, { recursive: true });
      let current = { schemaVersion: 1, events: [] };
      try {
        current = JSON.parse(await fs.readFile(runtimeRecoveryPath, "utf8"));
      } catch {}
      const events = Array.isArray(current.events) ? current.events : [];
      events.push({
        at: new Date().toISOString(),
        type,
        ...detail
      });
      const next = {
        schemaVersion: 1,
        events: events.slice(-20)
      };
      const temporaryPath = `${runtimeRecoveryPath}.tmp-${process.pid}`;
      await fs.writeFile(
        temporaryPath,
        `${JSON.stringify(next, null, 2)}\n`,
        "utf8"
      );
      await fs.rename(temporaryPath, runtimeRecoveryPath);
    });
  return runtimeRecoveryWriteQueue;
}

async function showRendererRecoveryLimit(window, reason) {
  if (!window || window.isDestroyed()) return;
  const state = rendererRecoveryState(window);
  if (state.promptOpen) return;
  state.promptOpen = true;
  await recordRuntimeRecovery("automatic-recovery-limited", { reason }).catch(
    () => {}
  );
  try {
    const result = await dialog.showMessageBox(window, {
      type: "warning",
      title: "OneOPC 控制中心恢复",
      message: "控制中心连续恢复失败",
      detail:
        "任务监管与外部工具仍在后台运行。您可以重新加载控制中心，或暂时关闭窗口并继续后台监管。",
      buttons: ["重新加载控制中心", "继续后台监管"],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });
    if (result.response === 0) {
      recoverRenderer(window, reason, { automatic: false });
    } else if (!window.isDestroyed()) {
      window.close();
    }
  } finally {
    state.promptOpen = false;
  }
}

function recoverRenderer(window, reason, { automatic = true } = {}) {
  if (!window || window.isDestroyed() || isQuitting) return false;
  const state = rendererRecoveryState(window);
  if (state.recovering) return false;
  const now = Date.now();
  state.attempts = state.attempts.filter(
    (attemptedAt) => now - attemptedAt < RENDERER_RECOVERY_POLICY.windowMs
  );
  if (
    automatic &&
    state.attempts.length >= RENDERER_RECOVERY_POLICY.maxAutomaticReloads
  ) {
    showRendererRecoveryLimit(window, reason).catch(() => {});
    return false;
  }

  if (automatic) state.attempts.push(now);
  state.recovering = true;
  state.unresponsive = false;
  state.lastHeartbeatAt = now;
  state.missedHeartbeats = 0;
  clearTimeout(state.unresponsiveTimer);
  clearTimeout(state.loadTimer);
  const wasVisible = window.isVisible();
  persistWindowState(window).catch(() => {});
  recordRuntimeRecovery("renderer-recovery-started", {
    reason,
    automatic,
    attempt: state.attempts.length
  }).catch(() => {});

  const complete = () => {
    if (window.isDestroyed()) return;
    clearTimeout(state.loadTimer);
    state.recovering = false;
    window.setTitle("OneOPC");
    if (wasVisible) {
      window.show();
      window.focus();
    }
    setTimeout(() => {
      sendRendererCommand(window, "runtime-recovered");
    }, 0);
    recordRuntimeRecovery("renderer-recovery-completed", {
      reason,
      automatic
    }).catch(() => {});
  };

  window.hide();
  window.setTitle("OneOPC · 正在恢复控制中心");
  window.webContents.once("did-finish-load", complete);
  state.loadTimer = setTimeout(() => {
    if (!state.recovering || window.isDestroyed()) return;
    state.recovering = false;
    recordRuntimeRecovery("renderer-recovery-timeout", { reason }).catch(
      () => {}
    );
    showRendererRecoveryLimit(window, "load-timeout").catch(() => {});
  }, RENDERER_RECOVERY_POLICY.loadTimeoutMs);
  state.loadTimer.unref?.();
  if (reason === "unresponsive" || reason === "heartbeat-timeout") {
    window.webContents.forcefullyCrashRenderer();
  }
  setTimeout(() => {
    if (!window.isDestroyed()) window.webContents.reload();
  }, 250).unref?.();
  return true;
}

function markRendererResponsive(window, source) {
  if (!window || window.isDestroyed()) return;
  const state = rendererRecoveryState(window);
  const wasUnresponsive = state.unresponsive;
  state.unresponsive = false;
  state.lastHeartbeatAt = Date.now();
  state.missedHeartbeats = 0;
  clearTimeout(state.unresponsiveTimer);
  if (wasUnresponsive) {
    recordRuntimeRecovery("renderer-responsive", { source }).catch(() => {});
  }
}

function markRendererUnresponsive(window, source) {
  if (!window || window.isDestroyed()) return;
  const state = rendererRecoveryState(window);
  if (state.unresponsive || state.recovering) return;
  state.unresponsive = true;
  clearTimeout(state.unresponsiveTimer);
  recordRuntimeRecovery("renderer-unresponsive-detected", { source }).catch(
    () => {}
  );
  state.unresponsiveTimer = setTimeout(async () => {
    if (
      !state.unresponsive ||
      state.recovering ||
      state.promptOpen ||
      window.isDestroyed()
    ) {
      return;
    }
    state.promptOpen = true;
    await recordRuntimeRecovery("renderer-unresponsive", { source }).catch(
      () => {}
    );
    try {
      const result = await dialog.showMessageBox(window, {
        type: "warning",
        title: "OneOPC 控制中心响应检查",
        message: "控制中心暂时无响应",
        detail:
            "后台任务监管未中断，未提交表单已持续保存到本机。继续等待不会影响当前任务；重新加载后可恢复最近一次成功保存的草稿。",
        buttons: ["继续等待", "重新加载控制中心"],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      });
      if (result.response === 1) {
        recoverRenderer(window, source, { automatic: false });
      } else {
        markRendererResponsive(window, "user-continued-waiting");
      }
    } finally {
      state.promptOpen = false;
    }
  }, RENDERER_RECOVERY_POLICY.unresponsiveDelayMs);
  state.unresponsiveTimer.unref?.();
}

function attachRendererRecovery(window) {
  const state = rendererRecoveryState(window);
  window.webContents.on("render-process-gone", (_event, details) => {
    if (isQuitting || details.reason === "clean-exit") return;
    recordRuntimeRecovery("render-process-gone", {
      reason: details.reason,
      exitCode: details.exitCode
    }).catch(() => {});
    recoverRenderer(window, details.reason || "renderer-gone");
  });
  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, _url, isMainFrame) => {
      if (!isMainFrame || errorCode === -3 || isQuitting) return;
      recordRuntimeRecovery("main-frame-load-failed", {
        errorCode,
        errorDescription
      }).catch(() => {});
      recoverRenderer(window, `load-${errorCode}`);
    }
  );
  window.on("unresponsive", () => {
    markRendererUnresponsive(window, "unresponsive");
  });
  window.on("responsive", () => {
    markRendererResponsive(window, "electron-responsive");
  });
  state.heartbeatTimer = setInterval(() => {
    if (window.isDestroyed() || isQuitting) return;
    const now = Date.now();
    if (!window.isVisible() || state.recovering || state.promptOpen) {
      state.lastHeartbeatAt = now;
      state.missedHeartbeats = 0;
      return;
    }
    if (now - state.lastHeartbeatAt <= RENDERER_RECOVERY_POLICY.heartbeatStaleMs) {
      state.missedHeartbeats = 0;
      return;
    }
    state.missedHeartbeats += 1;
    if (
      state.missedHeartbeats >=
      RENDERER_RECOVERY_POLICY.heartbeatMissThreshold
    ) {
      markRendererUnresponsive(window, "heartbeat-timeout");
    }
  }, RENDERER_RECOVERY_POLICY.heartbeatCheckMs);
  state.heartbeatTimer.unref?.();
  window.on("closed", () => {
    clearTimeout(state.unresponsiveTimer);
    clearTimeout(state.loadTimer);
    clearInterval(state.heartbeatTimer);
  });
}

function configureSessionSecurity() {
  const appSession = session.defaultSession;
  appSession.setPermissionCheckHandler(() => false);
  appSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false)
  );
  appSession.setDevicePermissionHandler(() => false);
  appSession.setDisplayMediaRequestHandler((_request, callback) =>
    callback({})
  );
  appSession.on("will-download", (event) => {
    event.preventDefault();
  });
}

function attachWebContentBoundary(window) {
  window.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  window.webContents.on("will-redirect", (event) => {
    event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}

async function createWindow() {
  if (windowCreationPromise) return windowCreationPromise;
  windowCreationPromise = (async () => {
    const persisted = await readPersistedWindowState();
    const restored = restoreWindowState(
      persisted,
      screen.getAllDisplays(),
      screen.getPrimaryDisplay()
    );
    const primaryArea = screen.getPrimaryDisplay().workArea;
    const window = new BrowserWindow({
      show: false,
      ...restored.bounds,
      minWidth: Math.min(MINIMUM_SIZE.width, primaryArea.width),
      minHeight: Math.min(MINIMUM_SIZE.height, primaryArea.height),
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 16, y: 18 },
      backgroundColor: "#07111f",
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false
      }
    });
    const webContentsId = window.webContents.id;

    attachWebContentBoundary(window);
    attachRendererRecovery(window);
    window.on("move", () => scheduleWindowStateSave(window));
    window.on("resize", () => scheduleWindowStateSave(window));
    window.on("maximize", () => scheduleWindowStateSave(window));
    window.on("unmaximize", () => scheduleWindowStateSave(window));
    window.on("enter-full-screen", () => {
      scheduleWindowStateSave(window);
      updateFullScreenMenuLabel(window);
    });
    window.on("leave-full-screen", () => {
      scheduleWindowStateSave(window);
      updateFullScreenMenuLabel(window);
    });
    window.on("focus", () => updateFullScreenMenuLabel(window));
    window.on("close", (event) => {
      clearTimeout(windowStateTimer);
      if (isQuitting || windowsReadyToClose.has(window)) {
        persistWindowState(window).catch(() => {});
        return;
      }
      event.preventDefault();
      if (windowsFlushingDrafts.has(window)) return;
      windowsFlushingDrafts.add(window);
      Promise.all([
        requestRendererDraftFlush(window)
          .then(() => flushStagedInputDrafts(webContentsId)),
        persistWindowState(window).catch(() => {})
      ]).finally(() => {
        windowsFlushingDrafts.delete(window);
        if (window.isDestroyed()) return;
        windowsReadyToClose.add(window);
        window.close();
      });
    });
    window.on("closed", () => {
      setTimeout(() => stagedInputDrafts.delete(webContentsId), 5000).unref?.();
      if (!isQuitting) notifyBackgroundContinuation();
    });

    const readyToShow = new Promise((resolve) => {
      window.once("ready-to-show", () => {
        if (restored.isMaximized) window.maximize();
        if (restored.isFullScreen) window.setFullScreen(true);
        window.show();
        app.focus({ steal: true });
        resolve();
      });
    });
    await window.loadFile(path.join(__dirname, "index.html"));
    await readyToShow;
    if (restored.recoveredToVisibleDisplay) {
      await persistWindowState(window);
    }
    return window;
  })().finally(() => {
    windowCreationPromise = null;
  });
  return windowCreationPromise;
}

async function showMainWindow(command = null) {
  let window = BrowserWindow.getAllWindows()[0];
  if (!window) window = await createWindow();
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  if (command) sendRendererCommand(window, command);
  return window;
}

function notifyBackgroundContinuation() {
  if (
    backgroundHintShown ||
    isQuitting ||
    !Notification.isSupported()
  ) {
    return;
  }
  backgroundHintShown = true;
  backgroundNotification = new Notification({
    title: "OneOPC 仍在后台监管任务",
    body: "窗口已关闭，任务监管与故障恢复继续运行。点击此通知可重新打开控制中心。",
    silent: true
  });
  backgroundNotification.on("click", () => {
    showMainWindow().catch(() => {});
  });
  backgroundNotification.on("close", () => {
    backgroundNotification = null;
  });
  backgroundNotification.show();
}

function updateFullScreenMenuLabel(window) {
  if (!window || window.isDestroyed()) return;
  Menu.setApplicationMenu(
    buildApplicationMenu(window.isFullScreen())
  );
}

async function setInterfaceDensity(density) {
  const next = await saveUIPreferences({ density });
  BrowserWindow.getAllWindows().forEach((window) => {
    sendRendererCommand(window, `density:${next.density}`);
  });
  const focused = BrowserWindow.getFocusedWindow();
  Menu.setApplicationMenu(
    buildApplicationMenu(Boolean(focused?.isFullScreen()))
  );
  return next;
}

function showNativeDialog(options) {
  const owner = BrowserWindow.getFocusedWindow();
  return owner
    ? dialog.showMessageBox(owner, options)
    : dialog.showMessageBox(options);
}

async function showGettingStartedHelp() {
  const result = await showNativeDialog({
    type: "info",
    title: "OneOPC 使用帮助",
    message: "从一段需求开始全自动交付",
    detail: [
      "1. 新建交付需求，输入文字描述或导入需求文档。",
      "2. OneOPC 自动组建数字员工小队并推进八个交付阶段。",
      "3. 在任务监管查看心跳、检查点、恢复与证据。",
      "4. 部署和验收完成后，可从首页直接打开交付系统。"
    ].join("\n"),
    buttons: ["新建交付需求", "关闭"],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });

  if (result.response === 0) {
    await showMainWindow("new-requirement");
  }
}

async function showPrivacyNotice() {
  const result = await showNativeDialog({
    type: "info",
    title: "隐私与本地数据",
    message: "交付资产默认保存在本机",
    detail: [
      "需求原文、未提交草稿、运行记录、检查点、数字员工和窗口设置保存在 OneOPC 应用数据目录。",
      "损坏草稿隔离文件最多保留 7 天且不超过 4 份；当需求与员工草稿都被清空时会立即销毁。",
      "技术检索仅按已启用的数据源和执行方式运行；外部源码链接仅允许打开已验证域名。",
      "关闭窗口后任务监管继续运行；选择“退出 OneOPC”才会停止后台监管。"
    ].join("\n\n"),
    buttons: ["打开本地数据目录", "关闭"],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });

  if (result.response === 0) {
    await shell.openPath(app.getPath("userData"));
  }
}

function configureApplicationMetadata() {
  app.setAboutPanelOptions({
    applicationName: "OneOPC",
    applicationVersion: app.getVersion(),
    version: "",
    copyright: "Copyright © 2026 OneOPC",
    credits: [
      "本地优先的全自动交付控制中心",
      "任务监管 · 检查点续跑 · 数字员工 · 技术雷达"
    ].join("\n")
  });
}

function buildApplicationMenu(isFullScreen = false) {
  const command = (name) => () => {
    showMainWindow(name).catch(() => {});
  };
  const template = [
    {
      label: "OneOPC",
      submenu: [
        { role: "about", label: "关于 OneOPC" },
        {
          label: "显示控制中心",
          accelerator: "CommandOrControl+Shift+O",
          click: () => showMainWindow().catch(() => {})
        },
        {
          label: "关闭窗口后任务监管继续运行",
          enabled: false
        },
        { type: "separator" },
        { role: "services", label: "服务" },
        { type: "separator" },
        { role: "hide", label: "隐藏 OneOPC" },
        { role: "hideOthers", label: "隐藏其他" },
        { role: "unhide", label: "全部显示" },
        { type: "separator" },
        { role: "quit", label: "退出 OneOPC" }
      ]
    },
    {
      label: "文件",
      submenu: [
        {
          label: "新建交付需求…",
          accelerator: "CommandOrControl+N",
          click: command("new-requirement")
        },
        { type: "separator" },
        { role: "close", label: "关闭窗口" }
      ]
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切" },
        { role: "copy", label: "复制" },
        { role: "paste", label: "粘贴" },
        { role: "pasteAndMatchStyle", label: "粘贴并匹配样式" },
        { role: "delete", label: "删除" },
        { role: "selectAll", label: "全选" }
      ]
    },
    {
      label: "导航",
      submenu: [
        {
          label: "交付控制中心",
          accelerator: "CommandOrControl+1",
          click: command("page:home")
        },
        {
          label: "项目交付",
          accelerator: "CommandOrControl+2",
          click: command("page:history")
        },
        {
          label: "任务监管",
          accelerator: "CommandOrControl+3",
          click: command("page:tasks")
        },
        {
          label: "数字员工",
          accelerator: "CommandOrControl+4",
          click: command("page:employees")
        },
        {
          label: "技术雷达",
          accelerator: "CommandOrControl+5",
          click: command("page:radar")
        }
      ]
    },
    {
      label: "任务",
      submenu: [
        {
          label: "立即健康检查",
          accelerator: "CommandOrControl+Shift+R",
          click: command("scan-tasks")
        },
        {
          label: "重新扫描本机工具",
          click: command("rescan-tools")
        },
        {
          label: "刷新项目数据",
          click: command("refresh-runs")
        }
      ]
    },
    {
      label: "显示",
      submenu: [
        { role: "reload", label: "重新载入" },
        { role: "toggleDevTools", label: "开发者工具", visible: !app.isPackaged },
        { type: "separator" },
        {
          label: "界面密度",
          submenu: [
            {
              type: "radio",
              label: "标准（显示更多内容）",
              checked: uiPreferences.density === "standard",
              click: () => setInterfaceDensity("standard").catch(() => {})
            },
            {
              type: "radio",
              label: "舒适（文字更易阅读）",
              checked: uiPreferences.density === "comfortable",
              click: () => setInterfaceDensity("comfortable").catch(() => {})
            }
          ]
        },
        {
          label: "切换界面密度",
          accelerator: "CommandOrControl+Shift+D",
          click: () =>
            setInterfaceDensity(
              uiPreferences.density === "comfortable"
                ? "standard"
                : "comfortable"
            ).catch(() => {})
        },
        { type: "separator" },
        { role: "resetZoom", label: "实际大小" },
        { role: "zoomIn", label: "放大" },
        { role: "zoomOut", label: "缩小" },
        { type: "separator" },
        {
          id: "toggle-full-screen",
          role: "togglefullscreen",
          label: isFullScreen
            ? "退出全屏幕"
            : "进入全屏幕"
        }
      ]
    },
    {
      label: "窗口",
      submenu: [
        { role: "minimize", label: "最小化" },
        { role: "zoom", label: "缩放" },
        { type: "separator" },
        { role: "front", label: "前置全部窗口" }
      ]
    },
    {
      role: "help",
      label: "帮助",
      submenu: [
        {
          label: "OneOPC 使用帮助",
          accelerator: "CommandOrControl+Shift+/",
          click: () => showGettingStartedHelp().catch(() => {})
        },
        {
          label: "隐私与本地数据",
          click: () => showPrivacyNotice().catch(() => {})
        },
        { type: "separator" },
        {
          label: "打开本地数据目录",
          click: () => {
            shell.openPath(app.getPath("userData")).catch(() => {});
          }
        }
      ]
    }
  ];
  return Menu.buildFromTemplate(template);
}

async function ensureDirectories() {
  await Promise.all([
    fs.mkdir(inputRoot, { recursive: true }),
    fs.mkdir(runRoot, { recursive: true }),
    fs.mkdir(settingsRoot, { recursive: true })
  ]);
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readEmployeeRegistry() {
  const raw = await readJson(employeeRegistryPath);
  const registry = normalizeRegistry(raw);
  if (!raw || registry.employees.length !== (raw.employees || []).length) {
    await writeEmployeeRegistry(registry);
  }
  return registry;
}

async function writeEmployeeRegistry(registry) {
  const temporary = `${employeeRegistryPath}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  await fs.rename(temporary, employeeRegistryPath);
  return registry;
}

async function saveDigitalEmployee(input) {
  const registry = await readEmployeeRegistry();
  const existing = input.id
    ? registry.employees.find((employee) => employee.id === input.id)
    : null;
  const now = new Date().toISOString();
  const employee = validateEmployee(input, existing);
  employee.id = existing?.id || `OPC-C${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  employee.builtIn = Boolean(existing?.builtIn);
  employee.source = existing?.source || {
    type: "customer-created",
    note: "由客户在 OneOPC 数字员工中心创建"
  };
  employee.createdAt = existing?.createdAt || now;
  employee.updatedAt = now;
  const employees = existing
    ? registry.employees.map((candidate) =>
        candidate.id === employee.id ? employee : candidate
      )
    : [...registry.employees, employee];
  await writeEmployeeRegistry({ ...registry, employees });
  return employee;
}

async function setDigitalEmployeeStatus(employeeId, status) {
  const registry = await readEmployeeRegistry();
  const employee = registry.employees.find((candidate) => candidate.id === employeeId);
  if (!employee) throw new Error("数字员工不存在");
  employee.status = status === "inactive" ? "inactive" : "active";
  employee.updatedAt = new Date().toISOString();
  await writeEmployeeRegistry(registry);
  return employee;
}

async function assignProjectTeam(runId, employeeIds) {
  const run = await readRun(runId);
  if (!run) throw new Error("交付任务不存在");
  const registry = await readEmployeeRegistry();
  const team = selectProjectTeam(registry.employees, employeeIds || []);
  if (team.length !== 4) throw new Error("项目小队必须覆盖四个交付岗位");
  const now = new Date().toISOString();
  run.team = {
    mode: "manual",
    employeeIds: team.map((employee) => employee.id),
    updatedAt: now
  };
  run.events.push({
    at: now,
    stage: run.currentStage,
    type: "team.assigned",
    summary: "项目数字员工小队已更新",
    detail: team.map((employee) => `${employee.roleName}:${employee.name}`).join(";")
  });
  await persistRun(run);
  return { ...run, coordination: buildCoordination(run, registry.employees) };
}

async function findBinary(names) {
  const home = app.getPath("home");
  const searchDirectories = [
    ...String(process.env.PATH || "").split(path.delimiter),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    path.join(home, ".local", "bin"),
    path.join(home, ".claude", "local"),
    path.join(home, "Desktop", "projects", ".tools", "bin")
  ].filter(Boolean);

  for (const name of names) {
    for (const directory of [...new Set(searchDirectories)]) {
      const candidate = path.join(directory, name);
      if (await exists(candidate)) return candidate;
    }
  }
  return null;
}

async function findApplication(names) {
  const home = app.getPath("home");
  const roots = ["/Applications", path.join(home, "Applications")];
  for (const name of names) {
    for (const root of roots) {
      const candidate = path.join(root, name);
      if (await exists(candidate)) return candidate;
    }
  }
  return null;
}

async function hasMatchingEntry(directory, prefix) {
  try {
    const entries = await fs.readdir(directory);
    return entries.some((entry) => entry.toLowerCase().startsWith(prefix));
  } catch {
    return false;
  }
}

async function detectCopilot() {
  const home = app.getPath("home");
  const cli = await findBinary(["github-copilot"]);
  if (cli) return { path: cli, source: "cli" };

  const extensionRoots = [
    path.join(home, ".vscode", "extensions"),
    path.join(home, ".cursor", "extensions"),
    path.join(home, ".vscode-insiders", "extensions")
  ];
  for (const root of extensionRoots) {
    if (await hasMatchingEntry(root, "github.copilot-")) {
      return { path: root, source: "extension" };
    }
  }

  const gh = await findBinary(["gh"]);
  if (gh) {
    try {
      const { stdout } = await execFileAsync(gh, ["extension", "list"], {
        timeout: 2500
      });
      if (/copilot/i.test(stdout)) return { path: gh, source: "gh-extension" };
    } catch {
      // An unavailable or unauthenticated gh CLI is not a Copilot install.
    }
  }
  return null;
}

async function buildToolCatalog() {
  const traeApp = await findApplication([
    "Trae CN.app",
    "TRAE.app",
    "TRAE SOLO CN.app"
  ]);
  const workBuddyApp = await findApplication([
    "WorkBuddy.app",
    "TraeBuddy.app",
    "Trae Buddy.app"
  ]);
  const cursorApp = await findApplication(["Cursor.app"]);
  const claudeApp = await findApplication(["Claude.app"]);
  const codexApp = await findApplication(["Codex.app"]);
  const codexCli = await findBinary(["codex"]);
  const claudeCli = await findBinary(["claude"]);
  const copilot = await detectCopilot();

  return {
    detectedAt: new Date().toISOString(),
    work: [
      {
        id: "trae-work",
        name: "Trae Work",
        installed: Boolean(traeApp),
        path: traeApp,
        source: "application",
        preferred: true
      },
      {
        id: "work-buddy",
        name: "WorkBuddy",
        installed: Boolean(workBuddyApp),
        path: workBuddyApp,
        source: "application",
        preferred: false
      }
    ],
    code: [
      {
        id: "trae-buddy",
        name: "TraeBuddy",
        installed: Boolean(workBuddyApp),
        path: workBuddyApp,
        source: "application",
        preferred: true
      },
      {
        id: "trae-code",
        name: "Trae Code",
        installed: Boolean(traeApp),
        path: traeApp,
        source: "application",
        preferred: false
      },
      {
        id: "codex",
        name: "Codex",
        installed: Boolean(codexApp || codexCli),
        path: codexApp || codexCli,
        source: codexApp ? "application" : "cli",
        preferred: false
      },
      {
        id: "cursor",
        name: "Cursor",
        installed: Boolean(cursorApp),
        path: cursorApp,
        source: "application",
        preferred: false
      },
      {
        id: "claude-code",
        name: "Claude Code",
        installed: Boolean(claudeCli || claudeApp),
        path: claudeCli || claudeApp,
        source: claudeCli ? "cli" : "application",
        preferred: false
      },
      {
        id: "github-copilot",
        name: "GitHub Copilot",
        installed: Boolean(copilot),
        path: copilot?.path || null,
        source: copilot?.source || "extension",
        preferred: false
      }
    ]
  };
}

function selectDefault(tools, preferredId) {
  return (
    tools.find((tool) => tool.id === preferredId && tool.installed) ||
    tools.find((tool) => tool.installed) ||
    null
  );
}

async function readToolSelection() {
  try {
    return JSON.parse(
      await fs.readFile(path.join(settingsRoot, "tool-selection.json"), "utf8")
    );
  } catch {
    return {};
  }
}

async function detectTools() {
  const catalog = await buildToolCatalog();
  const saved = await readToolSelection();
  const savedWork = catalog.work.find(
    (tool) => tool.id === saved.work && tool.installed
  );
  const savedCode = catalog.code.find(
    (tool) => tool.id === saved.code && tool.installed
  );
  catalog.selection = {
    work: (savedWork || selectDefault(catalog.work, "trae-work"))?.id || null,
    code: (savedCode || selectDefault(catalog.code, "trae-buddy"))?.id || null
  };
  await fs.writeFile(
    path.join(settingsRoot, "tool-selection.json"),
    `${JSON.stringify(catalog.selection, null, 2)}\n`,
    "utf8"
  );
  detectedToolchain = catalog;
  return catalog;
}

async function saveToolSelection(selection) {
  const catalog = detectedToolchain || (await detectTools());
  const work = catalog.work.find(
    (tool) => tool.id === selection.work && tool.installed
  );
  const code = catalog.code.find(
    (tool) => tool.id === selection.code && tool.installed
  );
  const next = {
    work: work?.id || selectDefault(catalog.work, "trae-work")?.id || null,
    code: code?.id || selectDefault(catalog.code, "trae-buddy")?.id || null
  };
  await fs.writeFile(
    path.join(settingsRoot, "tool-selection.json"),
    `${JSON.stringify(next, null, 2)}\n`,
    "utf8"
  );
  catalog.selection = next;
  detectedToolchain = catalog;
  return catalog;
}

async function sha256(filePath) {
  const content = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

function safeId() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `OP-${stamp}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

async function persistRun(run) {
  const runDirectory = path.join(runRoot, run.id);
  await fs.mkdir(runDirectory, { recursive: true });
  const runPath = path.join(runDirectory, "run.json");
  const temporaryPath = `${runPath}.${process.pid}.${Date.now()}.${crypto
    .randomBytes(4)
    .toString("hex")}.tmp`;
  await fs.writeFile(
    temporaryPath,
    `${JSON.stringify(run, null, 2)}\n`,
    "utf8"
  );
  await fs.rename(temporaryPath, runPath);
}

async function readRun(runId) {
  const runPath = path.join(runRoot, runId, "run.json");
  return JSON.parse(await fs.readFile(runPath, "utf8"));
}

async function readJson(targetPath) {
  try {
    return JSON.parse(await fs.readFile(targetPath, "utf8"));
  } catch {
    return null;
  }
}

async function listProcesses() {
  const { stdout } = await execFileAsync(
    "/bin/ps",
    ["-axo", "pid=,command="],
    { timeout: 5000, maxBuffer: 4 * 1024 * 1024 }
  );
  return stdout
    .split("\n")
    .map((line) => {
      const match = line.match(/^\s*(\d+)\s+(.+)$/);
      return match ? { pid: Number(match[1]), command: match[2] } : null;
    })
    .filter(Boolean);
}

async function launchTool(tool) {
  if (tool.source !== "application" || !tool.path?.endsWith(".app")) {
    throw new Error(`${tool.name} 没有可安全重启的应用入口`);
  }
  await execFileAsync("/usr/bin/open", [tool.path], { timeout: 10000 });
}

async function recoverManagedTask(run, tool, checkpoint) {
  if (!tool.id.startsWith("trae-")) {
    throw new Error(`${tool.name} 尚未安装任务级恢复适配器`);
  }
  const runDirectory = path.join(runRoot, run.id);
  const heartbeatPath = path.join(
    runDirectory,
    "control",
    `heartbeat-${tool.role}.json`
  );
  const prompt = [
    "[OneOPC RESUME CONTRACT]",
    `Run ID: ${run.id}`,
    `Checkpoint: ${checkpoint.stepId}`,
    `Checkpoint sequence: ${checkpoint.sequence}`,
    `Current stage: ${run.stages[checkpoint.stage]}`,
    `Task contract: ${path.join(runDirectory, "control", "task-contract.json")}`,
    `Control request: ${path.join(runDirectory, "control", "control-request.json")}`,
    `Heartbeat file: ${heartbeatPath}`,
    "",
    "Continue this existing delivery task from the checkpoint above.",
    "Do not recreate completed work and do not clear the workspace.",
    "Read existing artifacts before acting. Write the heartbeat JSON every 15 seconds",
    "with runId, state, at and checkpointSequence. Persist a new checkpoint before",
    "every external side effect. Before each step, stop immediately if the control",
    "request action is cancel. If blocked, record the reason instead of restarting."
  ].join("\n");
  const binary = sidecarPath({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    projectRoot
  });
  const result = await callSidecar(binary, "chat.submit", {
    bundleId: "cn.trae.app",
    prompt,
    sourceDocument: run.input?.archivedPath || "",
    workingDirectory: runDirectory,
    workflow: tool.role === "work" ? "traework" : "chat"
  });
  await fs.writeFile(
    heartbeatPath,
    `${JSON.stringify(
      {
        runId: run.id,
        state: "starting",
        at: new Date().toISOString(),
        checkpointSequence: checkpoint.sequence,
        source: "computer-use-submit"
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return result;
}

async function stopManagedTask(run, tool, checkpoint) {
  const controlDirectory = path.join(runRoot, run.id, "control");
  const requestPath = path.join(controlDirectory, "control-request.json");
  const requestedAt = new Date().toISOString();
  const request = {
    schemaVersion: 1,
    runId: run.id,
    action: "cancel",
    requestedAt,
    checkpoint: structuredClone(checkpoint),
    tool: {
      id: tool?.id || null,
      name: tool?.name || null,
      role: tool?.role || null
    },
    status: "requested",
    evidence: null
  };
  await fs.mkdir(controlDirectory, { recursive: true });
  const persistRequest = async () => {
    const temporaryPath = `${requestPath}.tmp`;
    await fs.writeFile(
      temporaryPath,
      `${JSON.stringify(request, null, 2)}\n`,
      "utf8"
    );
    await fs.rename(temporaryPath, requestPath);
  };
  await persistRequest();

  const currentTool = run.supervision?.tools?.[tool?.role];
  if (
    !currentTool ||
    !["running", "waiting", "starting"].includes(currentTool.taskState)
  ) {
    request.status = "confirmed";
    request.confirmedAt = new Date().toISOString();
    request.evidence = {
      method: "task_not_active",
      taskState: currentTool?.taskState || "unknown"
    };
    await persistRequest();
    return {
      confirmed: true,
      method: "task_not_active",
      requestPath
    };
  }

  if (!tool?.id?.startsWith("trae-")) {
    request.status = "pending_confirmation";
    request.evidence = {
      method: "adapter_unavailable",
      reason: `${tool?.name || "当前工具"} 尚未安装任务停止适配器`
    };
    await persistRequest();
    return {
      confirmed: false,
      method: "adapter_unavailable",
      reason: request.evidence.reason,
      requestPath
    };
  }

  const binary = sidecarPath({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    projectRoot
  });
  let lastError = null;
  try {
    await callSidecar(binary, "app.focus", {
      bundleId: "cn.trae.app"
    });
    for (const label of ["stop", "cancel"]) {
      try {
        const result = await callSidecar(binary, "ui.press", {
          bundleId: "cn.trae.app",
          label
        });
        if (String(result.method || "").startsWith("AX")) {
          request.status = "confirmed";
          request.confirmedAt = new Date().toISOString();
          request.evidence = {
            method: result.method,
            label,
            result
          };
          await persistRequest();
          return {
            confirmed: true,
            method: result.method,
            label,
            requestPath
          };
        }
        lastError = new Error("停止控件未通过 Accessibility 确认");
      } catch (error) {
        lastError = error;
      }
    }
  } catch (error) {
    lastError = error;
  }

  request.status = "pending_confirmation";
  request.evidence = {
    method: "accessibility_unconfirmed",
    reason: lastError?.message || "未找到可确认的任务停止控件"
  };
  await persistRequest();
  return {
    confirmed: false,
    method: "accessibility_unconfirmed",
    reason: request.evidence.reason,
    requestPath
  };
}

async function restoreCancelledTask(run, checkpoint) {
  const controlDirectory = path.join(runRoot, run.id, "control");
  const requestPath = path.join(controlDirectory, "control-request.json");
  const request = {
    schemaVersion: 1,
    runId: run.id,
    action: "resume",
    requestedAt: new Date().toISOString(),
    checkpoint: structuredClone(checkpoint),
    status: "acknowledged",
    evidence: {
      method: "user_undo",
      summary: "终止已撤销，允许从保存的检查点恢复"
    }
  };
  await fs.mkdir(controlDirectory, { recursive: true });
  const temporaryPath = `${requestPath}.tmp`;
  await fs.writeFile(
    temporaryPath,
    `${JSON.stringify(request, null, 2)}\n`,
    "utf8"
  );
  await fs.rename(temporaryPath, requestPath);
  return {
    acknowledged: true,
    method: "user_undo",
    requestPath
  };
}

async function writeTaskContract(run) {
  const controlDirectory = path.join(runRoot, run.id, "control");
  await fs.mkdir(controlDirectory, { recursive: true });
  await fs.writeFile(
    path.join(controlDirectory, "task-contract.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        runId: run.id,
        checkpoint: run.supervision.checkpoint,
        heartbeat: {
          intervalMs: 15000,
          timeoutMs: run.supervision.policy.heartbeatTimeoutMs,
          files: {
            work: "heartbeat-work.json",
            code: "heartbeat-code.json"
          },
          requiredFields: [
            "runId",
            "state",
            "at",
            "checkpointSequence"
          ]
        },
        recovery: {
          mode: "continue",
          resetWorkspace: false,
          resumeFrom: run.supervision.checkpoint.stepId
        },
        control: {
          requestFile: "control-request.json",
          supportedActions: ["cancel"],
          cancelBehavior: "stop-current-run-preserve-checkpoint"
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

async function bootstrapSupervision() {
  const runs = await listRuns();
  for (const run of runs) {
    if (!run.supervision) {
      run.supervision = initialSupervision(run);
      await persistRun(run);
    }
    await writeTaskContract(run);
  }
}

async function readIntelligenceSettings() {
  const defaults = {
    mode: "smart",
    transport: "computer_use",
    fallbackTransport: "provider_api",
    depth: "recommend",
    lookbackDays: 7,
    maxCandidates: 5,
    softTimeoutMs: 90000
  };
  try {
    const saved = JSON.parse(
      await fs.readFile(
        path.join(settingsRoot, "tech-intelligence.json"),
        "utf8"
      )
    );
    return { ...defaults, ...saved };
  } catch {
    return defaults;
  }
}

async function saveIntelligenceSettings(settings) {
  const allowedModes = new Set(["smart", "always", "off"]);
  const allowedTransports = new Set(["computer_use", "provider_api"]);
  const allowedDepths = new Set(["recommend", "verify", "code_graph"]);
  const current = await readIntelligenceSettings();
  const next = {
    ...current,
    mode: allowedModes.has(settings.mode) ? settings.mode : current.mode,
    transport: allowedTransports.has(settings.transport)
      ? settings.transport
      : current.transport,
    fallbackTransport: allowedTransports.has(settings.fallbackTransport)
      ? settings.fallbackTransport
      : current.fallbackTransport,
    depth: allowedDepths.has(settings.depth)
      ? settings.depth
      : current.depth
  };
  await fs.writeFile(
    path.join(settingsRoot, "tech-intelligence.json"),
    `${JSON.stringify(next, null, 2)}\n`,
    "utf8"
  );
  return next;
}

async function persistIntelligenceResult(run, result) {
  const intelligenceDirectory = path.join(
    runRoot,
    run.id,
    "tech-intelligence"
  );
  await fs.mkdir(intelligenceDirectory, { recursive: true });
  await Promise.all([
    fs.writeFile(
      path.join(intelligenceDirectory, "query-profile.json"),
      `${JSON.stringify(result.profile, null, 2)}\n`,
      "utf8"
    ),
    fs.writeFile(
      path.join(intelligenceDirectory, "candidates.json"),
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8"
    ),
    fs.writeFile(
      path.join(intelligenceDirectory, "reference-bundle.json"),
      `${JSON.stringify(
        {
          schema_version: result.schema_version,
          run_id: result.run_id,
          strategy: result.recommendation.strategy,
          summary: result.recommendation.summary,
          candidates: result.candidates
        },
        null,
        2
      )}\n`,
      "utf8"
    )
  ]);
}

async function archiveAdvisoryJob(runId, jobDirectory) {
  const targetDirectory = path.join(
    runRoot,
    runId,
    "tech-intelligence",
    "provider-job"
  );
  await fs.mkdir(targetDirectory, { recursive: true });
  for (const name of [
    "request.json",
    "progress.json",
    "result.json",
    "events.jsonl",
    "transport-evidence.json"
  ]) {
    const source = path.join(jobDirectory, name);
    if (await exists(source)) {
      await fs.copyFile(source, path.join(targetDirectory, name));
    }
  }
}

async function executeTechnologyIntelligence(runId, options = {}) {
  if (activeIntelligenceRuns.has(runId)) {
    return activeIntelligenceRuns.get(runId);
  }

  const execution = (async () => {
    const settings = await readIntelligenceSettings();
    const run = await readRun(runId);
    const force = Boolean(options.force);
    const now = new Date().toISOString();

    if (settings.mode === "off" && !force) {
      run.techIntelligence = {
        mode: "off",
        status: "skipped",
        updatedAt: now,
        candidates: []
      };
      run.events.push({
        at: now,
        stage: 1,
        type: "tech_intelligence.skipped",
        summary: "可选技术参考已跳过",
        detail: "全局模式设置为关闭；主交付流程不受影响"
      });
      await persistRun(run);
      return run.techIntelligence;
    }

    run.techIntelligence = {
      mode: force ? "manual" : settings.mode,
      status: "running",
      startedAt: now,
      requestedTransport: settings.transport,
      actualTransport: null,
      depth: settings.depth,
      candidates: []
    };
    run.events.push({
      at: now,
      stage: 1,
      type: "tech_intelligence.started",
      summary: "开始检索可选技术参考",
      detail: `mode:${force ? "manual" : settings.mode};transport:${settings.transport};depth:${settings.depth}`
    });
    await persistRun(run);

    const reportRoot = path.join(
      app.getPath("home"),
      "Library",
      "Application Support",
      "Technology Exploration Agent",
      "reports"
    );
    let timeout;
    try {
      const profile = buildQueryProfile(run);
      const advisory = await Promise.race([
        executeAdvisory({
          run,
          profile,
          mode: force ? "manual" : settings.mode,
          transport: settings.transport,
          fallbackTransport: settings.fallbackTransport,
          depth: settings.depth,
          maxCandidates: settings.maxCandidates,
          softTimeoutMs: settings.softTimeoutMs,
          jobsRoot: path.join(
            app.getPath("home"),
            "Library",
            "Application Support",
            "Technology Exploration Agent",
            "jobs"
          ),
          isPackaged: app.isPackaged,
          resourcesPath: process.resourcesPath,
          projectRoot,
          onProgress: async (progress) => {
            const latest = await readRun(runId);
            latest.techIntelligence = {
              ...latest.techIntelligence,
              status: "running",
              phase: progress.phase,
              percent: progress.percent,
              message: progress.message,
              updatedAt: progress.updatedAt
            };
            await persistRun(latest);
          }
        }),
        new Promise((_, reject) => {
          timeout = setTimeout(() => {
            const error = new Error("Technology intelligence soft timeout");
            error.code = "SOFT_TIMEOUT";
            reject(error);
          }, settings.softTimeoutMs);
        })
      ]);
      clearTimeout(timeout);
      const result = advisory.result;
      await archiveAdvisoryJob(runId, advisory.jobDirectory);
      let graphResult = null;
      if (settings.depth === "code_graph") {
        try {
          graphResult = await generateCodeGraph({
            candidates: result.candidates,
            home: app.getPath("home"),
            runDirectory: path.join(runRoot, runId),
            onProgress: async (phase, percent, message) => {
              const current = await readRun(runId);
              current.techIntelligence = {
                ...current.techIntelligence,
                status: "running",
                graph: { status: "running", phase, percent, message }
              };
              await persistRun(current);
            }
          });
        } catch (graphError) {
          graphResult = {
            status: "error",
            reason: graphError.message
          };
        }
      }
      await persistIntelligenceResult(run, result);
      const completedAt = new Date().toISOString();
      const latestRun = await readRun(runId);
      latestRun.techIntelligence = {
        mode: result.mode,
        status: result.status,
        queryId: result.query_id,
        requestedTransport: result.requested_transport,
        actualTransport: result.actual_transport,
        fallbackUsed: result.fallback_used,
        fallbackReason: result.fallback_reason,
        depth: settings.depth,
        updatedAt: completedAt,
        profile: result.profile,
        funnel: result.funnel,
        reportCoverage: result.report_coverage,
        recommendation: result.recommendation,
        candidates: result.candidates,
        graph: graphResult
          ? {
              status: graphResult.status,
              reason: graphResult.reason || null,
              evidencePath: graphResult.evidencePath || null,
              evidence: graphResult.evidence || null
            }
          : null,
        artifact: path.join(
          runRoot,
          latestRun.id,
          "tech-intelligence",
          "candidates.json"
        )
      };
      latestRun.events.push({
        at: completedAt,
        stage: 2,
        type: `tech_intelligence.${result.status}`,
        summary:
          result.status === "completed"
            ? `技术参考检索完成：发现 ${result.candidates.length} 个候选`
            : result.status === "no_match"
              ? "技术参考检索完成：未发现高相关候选"
              : "技术参考数据源当前不可用",
        detail: `${result.funnel.collected} 条情报 → ${result.funnel.repository_or_model_candidates} 个开源实体 → ${result.funnel.matched} 个匹配`,
        artifact: latestRun.techIntelligence.artifact
      });
      if (graphResult) {
        latestRun.events.push({
          at: completedAt,
          stage: 2,
          type: `technology.codegraph.${graphResult.status}`,
          summary:
            graphResult.status === "completed"
              ? `CodeGraph 验证完成：${graphResult.evidence.nodes.length} 个节点`
              : graphResult.status === "skipped"
                ? "CodeGraph 未满足执行门槛，已跳过"
                : "CodeGraph 验证失败，技术参考仍可使用",
          detail:
            graphResult.status === "completed"
              ? `discovery:${graphResult.evidence.discoveryFitScore};verified:${graphResult.evidence.verifiedFitScore};edges:${graphResult.evidence.edges.length}`
              : graphResult.reason,
          artifact: graphResult.evidencePath || null
        });
      }
      await persistRun(latestRun);
      return latestRun.techIntelligence;
    } catch (error) {
      clearTimeout(timeout);
      let cachedResult = null;
      try {
        cachedResult = await analyzeTechnology({
          run: await readRun(runId),
          mode: "local_cache",
          reportRoot,
          lookbackDays: settings.lookbackDays,
          maxCandidates: settings.maxCandidates
        });
      } catch {
        // Local cache is the last non-blocking fallback.
      }
      if (cachedResult?.status === "completed") {
        await persistIntelligenceResult(run, cachedResult);
        const fallbackAt = new Date().toISOString();
        const latestRun = await readRun(runId);
        latestRun.techIntelligence = {
          mode: force ? "manual" : settings.mode,
          status: "completed",
          requestedTransport: settings.transport,
          actualTransport: "local_cache",
          fallbackUsed: true,
          fallbackReason: error.message,
          depth: settings.depth,
          queryId: cachedResult.query_id,
          updatedAt: fallbackAt,
          profile: cachedResult.profile,
          funnel: cachedResult.funnel,
          reportCoverage: cachedResult.report_coverage,
          recommendation: cachedResult.recommendation,
          candidates: cachedResult.candidates,
          artifact: path.join(
            runRoot,
            runId,
            "tech-intelligence",
            "candidates.json"
          )
        };
        latestRun.events.push({
          at: fallbackAt,
          stage: 2,
          type: "tech_intelligence.fallback",
          summary: "双通道不可用，已显式降级到本地情报缓存",
          detail: `${settings.transport} failed: ${error.message};actual:local_cache`,
          artifact: latestRun.techIntelligence.artifact
        });
        await persistRun(latestRun);
        return latestRun.techIntelligence;
      }
      const failedAt = new Date().toISOString();
      const status = error.code === "SOFT_TIMEOUT" ? "timed_out" : "error";
      const latestRun = await readRun(runId);
      latestRun.techIntelligence = {
        mode: force ? "manual" : settings.mode,
        status,
        updatedAt: failedAt,
        candidates: [],
        error: error.message
      };
      latestRun.events.push({
        at: failedAt,
        stage: 2,
        type: `tech_intelligence.${status}`,
        summary:
          status === "timed_out"
            ? "技术参考检索超过软时限，主流程继续"
            : "技术参考检索失败，主流程继续",
        detail: error.message
      });
      await persistRun(latestRun);
      return latestRun.techIntelligence;
    }
  })();

  activeIntelligenceRuns.set(runId, execution);
  try {
    return await execution;
  } finally {
    activeIntelligenceRuns.delete(runId);
  }
}

async function importRequirementFromPath(
  sourcePath,
  handoff = null,
  inputOptions = {}
) {
  const toolchain = detectedToolchain || (await detectTools());
  const employeeRegistry = await readEmployeeRegistry();
  const id = safeId();
  const requirementDirectory = path.join(inputRoot, id);
  await fs.mkdir(requirementDirectory, { recursive: true });

  const inputType = inputOptions.type === "text" ? "text" : "file";
  const sourceName =
    inputOptions.name ||
    (sourcePath ? path.basename(sourcePath) : "原始需求.md");
  const archivedPath = path.join(requirementDirectory, sourceName);
  let bytes;
  let digest;
  if (inputType === "text") {
    const content = Buffer.from(inputOptions.content || "", "utf8");
    bytes = content.byteLength;
    digest = crypto.createHash("sha256").update(content).digest("hex");
    await fs.writeFile(archivedPath, content);
  } else {
    const stat = await fs.stat(sourcePath);
    bytes = stat.size;
    digest = await sha256(sourcePath);
    await fs.copyFile(sourcePath, archivedPath);
  }

  const now = new Date().toISOString();
  const title =
    inputOptions.title ||
    handoff?.projectName ||
    path.basename(sourcePath, path.extname(sourcePath));
  const run = {
    id,
    title,
    status: "ready",
    currentStage: 0,
    progress: 0,
    createdAt: now,
    updatedAt: now,
    origin: handoff
      ? {
          type: "technology-exploration",
          deliveryId: handoff.deliveryId,
          projectId: handoff.projectId,
          handoffPath: handoff.handoffPath
        }
      : null,
    input: {
      type: inputType,
      name: sourceName,
      sourcePath: sourcePath || null,
      archivedPath,
      bytes,
      sha256: digest,
      preview: inputOptions.preview || null
    },
    output: null,
    tools: {
      detectedAt: toolchain.detectedAt,
      selection: toolchain.selection,
      work: toolchain.work.filter((tool) => tool.installed),
      code: toolchain.code.filter((tool) => tool.installed)
    },
    team: {
      mode: "auto",
      employeeIds: selectProjectTeam(
        employeeRegistry.employees,
        [],
        `${title} ${sourceName} ${inputOptions.requirementText || ""}`
      ).map(
        (employee) => employee.id
      ),
      matchedAt: now
    },
    stages: [
      "需求理解",
      "业务确认",
      "方案设计",
      "开发",
      "测试",
      "交付",
      "部署",
      "验收"
    ],
    events: [
      {
        at: now,
        stage: 0,
        type:
          inputType === "text"
            ? "requirement.text_archived"
            : "requirement.archived",
        summary:
          inputType === "text"
            ? "原始文字需求已归档并锁定"
            : "原始需求已归档并锁定",
        detail: `sha256:${digest}`
      },
      {
        at: now,
        stage: 0,
        type: handoff ? "technology.handoff.accepted" : "toolchain.auto_selected",
        summary: handoff
          ? "已接收 Technology Exploration 的 Demo 交付事件"
          : "研发工具已自动识别并选择",
        detail: handoff
          ? `delivery:${handoff.deliveryId};project:${handoff.projectId}`
          : `work:${toolchain.selection.work || "unavailable"};code:${
              toolchain.selection.code || "unavailable"
            }`
      }
    ]
  };
  run.supervision = initialSupervision(run);

  await fs.writeFile(
    path.join(requirementDirectory, "metadata.json"),
    `${JSON.stringify(run.input, null, 2)}\n`,
    "utf8"
  );
  await persistRun(run);
  await writeTaskContract(run);
  setImmediate(() => {
    executeTechnologyIntelligence(run.id).catch(() => {
      // The adapter persists its own soft-failure event when possible.
    });
  });
  return run;
}

async function importTextRequirement(input = {}) {
  const asset = buildTextRequirementAsset(input);

  return importRequirementFromPath(null, null, {
    type: "text",
    title: asset.title,
    name: asset.name,
    content: asset.content,
    requirementText: asset.description,
    preview: asset.preview
  });
}

async function importRequirement() {
  const result = await dialog.showOpenDialog({
    title: "选择需求文档",
    properties: ["openFile"],
    filters: [
      {
        name: "需求文档",
        extensions: ["md", "txt", "pdf", "docx", "json"]
      }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return importRequirementFromPath(result.filePaths[0]);
}

async function updateHandoffStatus(requestPath, patch) {
  const root = path.dirname(requestPath);
  const current = (await readJson(path.join(root, "status.json"))) || {};
  await fs.writeFile(
    path.join(root, "status.json"),
    `${JSON.stringify(
      {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
        events: [
          ...(current.events || []),
          ...(patch.event
            ? [{ at: new Date().toISOString(), ...patch.event }]
            : [])
        ]
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

async function acceptTechnologyHandoff(requestPath) {
  const handoff = await readJson(requestPath);
  if (
    !handoff ||
    handoff.schemaVersion !== "technology-demo-handoff/1.0" ||
    handoff.executionTool !== "oneopc"
  ) {
    throw new Error("OneOPC 收到的 Demo Handoff 无效");
  }
  const run = await importRequirementFromPath(handoff.requirementPath, {
    ...handoff,
    handoffPath: requestPath
  });
  await updateHandoffStatus(requestPath, {
    state: "running",
    phase: "OneOPC 已接管，正在启动需求理解",
    percent: 8,
    message: "受监管交付任务已创建",
    runId: run.id,
    workspacePath: path.join(runRoot, run.id),
    event: {
      type: "oneopc.accepted",
      message: `OneOPC 已创建 Run ${run.id}`
    }
  });
  await taskSupervisor.action(run.id, "start");
  return run;
}

async function syncTechnologyHandoffs() {
  const runs = await listRuns();
  for (const run of runs.filter((item) => item.origin?.handoffPath)) {
    const supervision = run.supervision || {};
    const terminal = ["completed", "failed", "cancelled"].includes(run.status);
    const stageIndex = Math.max(0, Number(run.currentStage || 0));
    const percent = terminal
      ? run.status === "completed" ? 100 : Number(run.progress || 0)
      : Math.max(8, Math.round((stageIndex / Math.max(1, run.stages.length)) * 90));
    await updateHandoffStatus(run.origin.handoffPath, {
      state: terminal ? run.status : "running",
      phase: run.stages[stageIndex] || "交付执行",
      percent,
      message:
        supervision.state === "recovering"
          ? "检测到执行异常，正在从检查点恢复"
          : terminal
            ? run.status === "completed" ? "Demo 已完成交付" : "交付任务已停止"
            : "OneOPC 正在持续监管真实执行",
      runId: run.id,
      workspacePath: path.join(runRoot, run.id),
      previewUrl: run.output?.url || run.output?.previewUrl || null,
      recoveryCount: supervision.recovery?.restartCount || 0,
      checkpoint: supervision.checkpoint || null
    });
  }
}

async function listRuns() {
  await ensureDirectories();
  const registry = await readEmployeeRegistry();
  const entries = await fs.readdir(runRoot, { withFileTypes: true });
  const runs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          const raw = await fs.readFile(
            path.join(runRoot, entry.name, "run.json"),
            "utf8"
          );
          return JSON.parse(raw);
        } catch {
          return null;
        }
      })
  );

  return runs
    .filter(Boolean)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((run) => ({
      ...run,
      coordination: buildCoordination(run, registry.employees)
    }));
}

function injectDevelopmentFault(moduleId) {
  if (app.isPackaged || !developmentFaults.has(moduleId)) return;
  const remaining = developmentFaults.get(moduleId);
  if (Number.isFinite(remaining)) {
    if (remaining <= 1) {
      developmentFaults.delete(moduleId);
    } else {
      developmentFaults.set(moduleId, remaining - 1);
    }
  }
  throw new Error(`开发态故障注入：${moduleId} 模块暂不可用`);
}

async function runStartupModule(moduleId, operation, ready = dataDirectoriesReady) {
  await ready;
  injectDevelopmentFault(moduleId);
  return operation();
}

function registerIpc() {
  ipcMain.on("runtime:heartbeat", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) markRendererResponsive(window, "heartbeat");
  });
  ipcMain.on("drafts:flush-complete", (event, requestId, success) => {
    const pending = pendingDraftFlushes.get(requestId);
    if (!pending || pending.webContentsId !== event.sender.id) return;
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) return;
    pending.complete(success);
  });
  ipcMain.on("drafts:stage", (event, scope, value) => {
    event.returnValue = stageInputDraft(event.sender.id, scope, value);
  });
  ipcMain.handle("requirements:import", importRequirement);
  ipcMain.handle("requirements:import-text", (_event, input) =>
    importTextRequirement(input || {})
  );
  ipcMain.handle("drafts:read", readInputDrafts);
  ipcMain.handle("drafts:save", (_event, scope, value) =>
    updateInputDraft(scope, value)
  );
  ipcMain.handle("drafts:clear", (event, scope) => {
    clearStagedInputDraft(event.sender.id, scope);
    return updateInputDraft(scope, null);
  });
  ipcMain.handle("ui:preferences:get", () => uiPreferences);
  ipcMain.handle("ui:preferences:set", (_event, preferences) =>
    setInterfaceDensity(preferences?.density)
  );
  ipcMain.handle("runs:list", () =>
    runStartupModule("runs", async () => {
      const runs = await listRuns();
      if (!stressProfileEnabled) return runs;
      return buildStressRuns(runs).map((run) => {
        if (!stressSupervisionRuns.has(run.id)) {
          stressSupervisionRuns.set(run.id, structuredClone(run));
        }
        return stressSupervisionRuns.get(run.id);
      });
    })
  );
  ipcMain.handle("employees:list", async () =>
    runStartupModule(
      "employees",
      async () => {
        const employees = (await readEmployeeRegistry()).employees;
        return stressProfileEnabled
          ? buildStressEmployees(employees)
          : employees;
      }
    )
  );
  ipcMain.handle("employees:save", (_event, employee) =>
    saveDigitalEmployee(employee || {})
  );
  ipcMain.handle("employees:status", (_event, employeeId, status) =>
    setDigitalEmployeeStatus(employeeId, status)
  );
  ipcMain.handle("teams:assign", (_event, runId, employeeIds) =>
    assignProjectTeam(runId, employeeIds)
  );
  ipcMain.handle("supervisor:scan", (_event, runId) =>
    runStartupModule(
      "supervisor",
      () => taskSupervisor.tick(runId || null),
      supervisionReady
    )
  );
  ipcMain.handle("supervisor:action", (_event, runId, action) =>
    supervisionReady.then(async () => {
      if (!stressProfileEnabled || !runId.startsWith("STRESS-")) {
        return taskSupervisor.action(runId, action);
      }
      let sandboxRun = stressSupervisionRuns.get(runId);
      if (!sandboxRun) {
        sandboxRun = buildStressRuns([], 72).find(
          (candidate) => candidate.id === runId
        );
      }
      if (!sandboxRun) throw new Error("压力监管沙箱任务不存在");
      const sandboxSupervisor = new TaskSupervisor({
        runRoot,
        now: Date.now,
        intervalMs: 10000,
        listRuns: async () => [structuredClone(sandboxRun)],
        readRun: async () => structuredClone(sandboxRun),
        persistRun: async (run) => {
          sandboxRun = structuredClone(run);
          stressSupervisionRuns.set(run.id, sandboxRun);
        },
        readJson: async () => null,
        listProcesses: async () =>
          Object.values(sandboxRun.supervision?.tools || {})
            .filter((tool) => tool.pid)
            .map((tool) => ({
              pid: tool.pid,
              command: "/Applications/Trae CN.app/Contents/MacOS/Electron"
            })),
        launchTool: async () => {},
        cancelTask: async (_run, tool) =>
          stressCancelPending
            ? {
                confirmed: false,
                method: "accessibility_unconfirmed",
                reason: "压力沙箱模拟未找到 Stop 控件",
                toolId: tool.id
              }
            : {
                confirmed: true,
                method: "AXPressStressFixture",
                label: "stop",
                toolId: tool.id
              },
        restoreTask: async () => ({
          acknowledged: true,
          method: "stress_user_undo"
        }),
        recoverTask: async () => ({
          confirmation: "stress_resume_submitted"
        })
      });
      return sandboxSupervisor.action(runId, action);
    })
  );
  ipcMain.handle("intelligence:settings:get", () =>
    runStartupModule("settings", readIntelligenceSettings)
  );
  ipcMain.handle("intelligence:settings:set", (_event, settings) =>
    saveIntelligenceSettings(settings || {})
  );
  ipcMain.handle("intelligence:run", (_event, runId) =>
    executeTechnologyIntelligence(runId, { force: true })
  );
  ipcMain.handle("intelligence:focus", async () => {
    await execFileAsync(
      "/usr/bin/open",
      [
        "-b",
        "com.local.technology-exploration",
        "--args",
        "--show-latest",
        "--open-match"
      ],
      { timeout: 5000 }
    );
    return true;
  });
  ipcMain.handle("tools:detect", () =>
    runStartupModule("tools", detectTools)
  );
  ipcMain.handle("tools:select", (_event, selection) =>
    saveToolSelection(selection || {})
  );
  ipcMain.handle("paths:reveal", async (_event, targetPath) => {
    if (!targetPath) return false;
    shell.showItemInFolder(targetPath);
    return true;
  });
  ipcMain.handle("output:open", async (_event, url) => {
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url || "")) {
      throw new Error("Only local HTTP output URLs are allowed");
    }
    await shell.openExternal(url);
    return true;
  });
  ipcMain.handle("source:open", async (_event, url) => {
    if (!/^https:\/\/(github\.com|huggingface\.co)\//.test(url || "")) {
      throw new Error("Only verified GitHub or Hugging Face URLs are allowed");
    }
    await shell.openExternal(url);
    return true;
  });
}

app.whenReady().then(async () => {
  configureDataPaths();
  configureApplicationMetadata();
  configureSessionSecurity();
  dataDirectoriesReady = ensureDirectories();
  await dataDirectoriesReady;
  await runSettingsHousekeeping();
  uiPreferences = await readUIPreferences();
  taskSupervisor = new TaskSupervisor({
    runRoot,
    listRuns,
    readRun,
    persistRun,
    readJson,
    listProcesses,
    launchTool,
    recoverTask: recoverManagedTask,
    cancelTask: stopManagedTask,
    restoreTask: restoreCancelledTask
  });
  supervisionReady = dataDirectoriesReady.then(bootstrapSupervision);
  registerIpc();
  Menu.setApplicationMenu(buildApplicationMenu());
  createWindow().catch((error) => {
    console.error("OneOPC window creation failed:", error);
  });
  const recoverWindows = () => {
    BrowserWindow.getAllWindows().forEach(ensureWindowOnVisibleDisplay);
  };
  screen.on("display-added", recoverWindows);
  screen.on("display-removed", recoverWindows);
  screen.on("display-metrics-changed", recoverWindows);
  if (app.isPackaged) {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: false
    });
  }
  supervisionReady
    .then(() => taskSupervisor.start())
    .catch((error) => {
      console.error("OneOPC supervision bootstrap failed:", error);
    });
  const handoffIndex = process.argv.indexOf("--technology-handoff");
  if (handoffIndex >= 0 && process.argv[handoffIndex + 1]) {
    supervisionReady
      .then(() => acceptTechnologyHandoff(process.argv[handoffIndex + 1]))
      .catch(async (error) => {
        await updateHandoffStatus(process.argv[handoffIndex + 1], {
          state: "failed",
          phase: "OneOPC 接管失败",
          message: error.message,
          event: { type: "oneopc.failed", message: error.message }
        }).catch(() => {});
      });
  }
  handoffStatusTimer = setInterval(
    () => syncTechnologyHandoffs().catch(() => {}),
    5000
  );
  handoffStatusTimer.unref?.();

  app.on("activate", () => {
    showMainWindow().catch(() => {});
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  isQuitting = true;
  clearInterval(handoffStatusTimer);
  taskSupervisor?.stop();
  clearTimeout(windowStateTimer);
  if (quitStatePersisted) return;
  event.preventDefault();
  Promise.all(
    BrowserWindow.getAllWindows().flatMap((window) => {
      const webContentsId = window.webContents.id;
      return [
        requestRendererDraftFlush(window)
          .then(() => flushStagedInputDrafts(webContentsId)),
        persistWindowState(window).catch(() => {})
      ];
    })
  ).then(() =>
    Promise.allSettled([
      inputDraftsWriteQueue,
      windowStateWriteQueue,
      uiPreferencesWriteQueue
    ])
  ).finally(() => {
    quitStatePersisted = true;
    app.quit();
  });
});
