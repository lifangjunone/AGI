const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  globalShortcut,
  nativeImage,
  screen,
  shell,
} = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const {
  AUTO_HIDE_DELAY_MS,
  AUTO_HIDE_POLL_MS,
  isPointInsideBounds,
  shouldAutoHide,
} = require("./overlay-behavior.cjs");
const { createSpeechService } = require("./speech.cjs");
const { createTranslationService } = require("./translation.cjs");

let mainWindow;
let overlayWindow;
let petWindow;
let tray;
let nativeProcess;
let petDragOrigin;
let enabled = true;
let autoHideOnHoverLeave = false;
let petVisible = true;
let nativeStatus = "starting";
let activeOverlayTrigger;
let hoverGeneration = 0;
let autoHideTimer;
let autoHideOutsideSince;
let cursorWasInsideOverlay = false;
const translate = createTranslationService();
const speech = createSpeechService();

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const webUrl = process.env.VITE_DEV_SERVER_URL;

function loadView(window, view) {
  if (isDev) {
    return window.loadURL(`${webUrl}/?view=${view}`);
  }
  return window.loadFile(path.join(__dirname, "../dist/index.html"), {
    query: { view },
  });
}

function createWindows() {
  const common = {
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  mainWindow = new BrowserWindow({
    ...common,
    width: 920,
    height: 650,
    minWidth: 760,
    minHeight: 560,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#f2efe8",
  });
  loadView(mainWindow, "main");
  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  overlayWindow = new BrowserWindow({
    ...common,
    width: 390,
    height: 340,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    hasShadow: true,
  });
  overlayWindow.setAlwaysOnTop(true, "floating");
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  loadView(overlayWindow, "overlay");
  overlayWindow.on("hide", () => {
    clearAutoHideTimer();
    activeOverlayTrigger = undefined;
  });

  const petPosition = readPetPosition();
  petWindow = new BrowserWindow({
    ...common,
    ...petPosition,
    width: 76,
    height: 84,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    hasShadow: false,
    acceptFirstMouse: true,
  });
  petWindow.setAlwaysOnTop(true, "floating");
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  loadView(petWindow, "pet");
  petWindow.once("ready-to-show", () => petWindow.showInactive());
  petWindow.on("moved", savePetPosition);
}

function petPositionPath() {
  return path.join(app.getPath("userData"), "pet-position.json");
}

function preferencesPath() {
  return path.join(app.getPath("userData"), "preferences.json");
}

function readPreferences() {
  try {
    const preferences = JSON.parse(fs.readFileSync(preferencesPath(), "utf8"));
    autoHideOnHoverLeave = preferences.autoHideOnHoverLeave === true;
  } catch {
    // First launch or invalid preferences.
  }
}

function savePreferences() {
  try {
    fs.mkdirSync(path.dirname(preferencesPath()), { recursive: true });
    fs.writeFileSync(preferencesPath(), JSON.stringify({ autoHideOnHoverLeave }));
  } catch (error) {
    console.error("[preferences]", error);
  }
}

function readPetPosition() {
  const workArea = screen.getPrimaryDisplay().workArea;
  const fallback = {
    x: workArea.x + workArea.width - 96,
    y: workArea.y + Math.round((workArea.height - 84) / 2),
  };
  try {
    const position = JSON.parse(fs.readFileSync(petPositionPath(), "utf8"));
    const display = screen.getDisplayNearestPoint(position);
    const bounds = display.workArea;
    if (
      position.x >= bounds.x &&
      position.x <= bounds.x + bounds.width - 76 &&
      position.y >= bounds.y &&
      position.y <= bounds.y + bounds.height - 84
    ) {
      return { x: position.x, y: position.y };
    }
  } catch {
    // First launch or stale position.
  }
  return fallback;
}

function savePetPosition() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const { x, y } = petWindow.getBounds();
  try {
    fs.mkdirSync(path.dirname(petPositionPath()), { recursive: true });
    fs.writeFileSync(petPositionPath(), JSON.stringify({ x, y }));
  } catch (error) {
    console.error("[pet-position]", error);
  }
}

function createTray() {
  if (!tray) {
    const icon = nativeImage.createFromDataURL(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAjklEQVQ4T2NkoBAwUqifYdQABv7//88ABYxAfAaIfwPxTyD+D8Q/gPgJEP8HYh1AfAeIfwHxJyD+AcQ/WBjYgfgfEP8C4gNA/B+I/wHxTyD+AMQ/gPgXEP8GYiAYXQDE/4H4LxD/BuL/QPwfLHkQiP8D8W8g/gHE/4H4DxD/B+L/QPwPiH8D8X8g/g/EP4H4PxD/B+I/MBoA6p49EXZKfkcAAAAASUVORK5CYII=",
    );
    icon.setTemplateImage(true);
    tray = new Tray(icon);
    tray.setToolTip("Hover Translator");
    tray.on("click", showMainWindow);
  }
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "显示控制台", click: () => showMainWindow() },
      { label: "显示桌面宠物", click: () => showPet() },
      {
        label: "启用取词",
        type: "checkbox",
        checked: enabled,
        click: (item) => setEnabled(item.checked),
      },
      {
        label: "离开单词自动关闭",
        type: "checkbox",
        checked: autoHideOnHoverLeave,
        click: (item) => setAutoHideOnHoverLeave(item.checked),
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function showMainWindow() {
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  broadcastState();
}

function toggleMainWindow() {
  if (mainWindow.isVisible()) {
    mainWindow.hide();
    broadcastState();
  } else {
    showMainWindow();
  }
}

function showPet() {
  petVisible = true;
  petWindow?.showInactive();
  broadcastState();
}

function hidePet() {
  petVisible = false;
  petWindow?.hide();
  broadcastState();
}

function showPetMenu() {
  Menu.buildFromTemplate([
    { label: "打开翻译台", click: showMainWindow },
    {
      label: enabled ? "暂停取词" : "开启取词",
      click: () => setEnabled(!enabled),
    },
    { type: "separator" },
    { label: "隐藏桌面宠物", click: hidePet },
    {
      label: "退出",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]).popup({ window: petWindow });
}

function broadcastState() {
  const state = getState();
  for (const window of [mainWindow, overlayWindow, petWindow]) {
    window?.webContents.send("state:changed", state);
  }
  return state;
}

function getState() {
  return {
    enabled,
    autoHideOnHoverLeave,
    nativeStatus,
    petVisible,
    mainVisible: Boolean(mainWindow?.isVisible()),
  };
}

function setEnabled(value) {
  enabled = Boolean(value);
  if (!enabled) {
    clearAutoHideTimer();
    overlayWindow.hide();
  }
  createTray();
  return broadcastState();
}

function setAutoHideOnHoverLeave(value) {
  autoHideOnHoverLeave = Boolean(value);
  if (!autoHideOnHoverLeave) clearAutoHideTimer();
  savePreferences();
  createTray();
  return broadcastState();
}

function clearAutoHideTimer() {
  if (autoHideTimer) clearTimeout(autoHideTimer);
  autoHideTimer = undefined;
  autoHideOutsideSince = undefined;
  cursorWasInsideOverlay = false;
}

function scheduleAutoHide(reason) {
  clearAutoHideTimer();
  if (!shouldAutoHide(autoHideOnHoverLeave, activeOverlayTrigger)) return;
  autoHideOutsideSince = Date.now();
  // #region debug-point F:auto-hide-delay
  fetch("http://127.0.0.1:7777/event", { method: "POST", body: JSON.stringify({ sessionId: "example-hover-dismiss", runId: "post-fix-3", hypothesisId: "F", location: "electron/main.cjs:scheduleAutoHide", msg: "[DEBUG] Auto-hide polling started", data: { reason, trigger: activeOverlayTrigger, delayMs: AUTO_HIDE_DELAY_MS, pollMs: AUTO_HIDE_POLL_MS }, ts: Date.now() }) }).catch(() => {});
  // #endregion

  const checkPointer = () => {
    autoHideTimer = undefined;
    if (!shouldAutoHide(autoHideOnHoverLeave, activeOverlayTrigger)) return;
    const pointerInside = isPointInsideBounds(
      screen.getCursorScreenPoint(),
      overlayWindow.getBounds(),
    );
    if (pointerInside) {
      if (!cursorWasInsideOverlay) {
        // #region debug-point G:main-process-overlay-enter
        fetch("http://127.0.0.1:7777/event", { method: "POST", body: JSON.stringify({ sessionId: "example-hover-dismiss", runId: "post-fix-3", hypothesisId: "G", location: "electron/main.cjs:checkPointer", msg: "[DEBUG] Main process detected pointer inside overlay", data: { trigger: activeOverlayTrigger }, ts: Date.now() }) }).catch(() => {});
        // #endregion
      }
      cursorWasInsideOverlay = true;
      autoHideOutsideSince = undefined;
    } else {
      if (cursorWasInsideOverlay || autoHideOutsideSince === undefined) {
        // #region debug-point G:main-process-overlay-leave
        fetch("http://127.0.0.1:7777/event", { method: "POST", body: JSON.stringify({ sessionId: "example-hover-dismiss", runId: "post-fix-3", hypothesisId: "G", location: "electron/main.cjs:checkPointer", msg: "[DEBUG] Main process detected pointer outside overlay; grace restarted", data: { trigger: activeOverlayTrigger, delayMs: AUTO_HIDE_DELAY_MS }, ts: Date.now() }) }).catch(() => {});
        // #endregion
        autoHideOutsideSince = Date.now();
      }
      cursorWasInsideOverlay = false;
      if (Date.now() - autoHideOutsideSince >= AUTO_HIDE_DELAY_MS) {
        // #region debug-point F:auto-hide-fired
        fetch("http://127.0.0.1:7777/event", { method: "POST", body: JSON.stringify({ sessionId: "example-hover-dismiss", runId: "post-fix-3", hypothesisId: "F", location: "electron/main.cjs:checkPointer", msg: "[DEBUG] Auto-hide fired after pointer stayed outside", data: { reason, trigger: activeOverlayTrigger, overlayVisible: overlayWindow.isVisible() }, ts: Date.now() }) }).catch(() => {});
        // #endregion
        overlayWindow.hide();
        return;
      }
    }
    autoHideTimer = setTimeout(checkPointer, AUTO_HIDE_POLL_MS);
  };
  autoHideTimer = setTimeout(checkPointer, AUTO_HIDE_POLL_MS);
}

function nativeBinaryPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app.asar.unpacked", "native/bin/hover-ocr")
    : path.join(app.getAppPath(), "native/bin/hover-ocr");
}

function startNativeListener() {
  if (process.platform !== "darwin") {
    nativeStatus = "unsupported";
    broadcastState();
    return;
  }
  nativeProcess = spawn(nativeBinaryPath(), [], { stdio: ["ignore", "pipe", "pipe"] });
  const lines = readline.createInterface({ input: nativeProcess.stdout });
  lines.on("line", (line) => {
    try {
      handleNativeEvent(JSON.parse(line));
    } catch {
      nativeStatus = "error";
      broadcastState();
    }
  });
  nativeProcess.stderr.on("data", (data) => console.error(`[hover-ocr] ${data}`));
  nativeProcess.on("exit", () => {
    nativeStatus = "stopped";
    broadcastState();
  });
}

async function handleNativeEvent(event) {
  if (event.type === "ready") {
    nativeStatus = "ready";
    broadcastState();
    return;
  }
  if (event.type === "permission") {
    nativeStatus =
      event.detail === "input-monitoring-required"
        ? "input-monitoring-required"
        : "permission-required";
    broadcastState();
    return;
  }
  if (event.type === "hoverLeave") {
    // #region debug-point C-D:hover-leave-decision
    fetch("http://127.0.0.1:7777/event", { method: "POST", body: JSON.stringify({ sessionId: "example-hover-dismiss", runId: "post-fix-3", hypothesisId: "C-D", location: "electron/main.cjs:handleNativeEvent", msg: "[DEBUG] Hover leave decision", data: { autoHideOnHoverLeave, activeOverlayTrigger, overlayVisible: overlayWindow.isVisible(), willHide: shouldAutoHide(autoHideOnHoverLeave, activeOverlayTrigger) }, ts: Date.now() }) }).catch(() => {});
    // #endregion
    if (autoHideOnHoverLeave) {
      hoverGeneration += 1;
      scheduleAutoHide("source-leave");
    }
    return;
  }
  if (!enabled || !event.text) return;

  const requestGeneration =
    event.type === "hover" ? ++hoverGeneration : (hoverGeneration += 1);
  try {
    const result = await translate(event.text);
    if (autoHideOnHoverLeave && requestGeneration !== hoverGeneration) return;
    const display = screen.getPrimaryDisplay();
    const point = {
      x: Math.round(event.x || display.bounds.width / 2),
      y: Math.round(display.bounds.height - (event.y || display.bounds.height / 2)),
    };
    showOverlay({ ...result, trigger: event.type }, point);
  } catch (error) {
    if (autoHideOnHoverLeave && requestGeneration !== hoverGeneration) return;
    showOverlay(
      {
        query: event.text,
        error: error instanceof Error ? error.message : "翻译失败",
        trigger: event.type,
      },
      screen.getCursorScreenPoint(),
    );
  }
}

function showOverlay(payload, point) {
  clearAutoHideTimer();
  const display = screen.getDisplayNearestPoint(point);
  const bounds = display.workArea;
  const size = overlayWindow.getBounds();
  const x = Math.min(Math.max(point.x + 18, bounds.x + 8), bounds.x + bounds.width - size.width - 8);
  const y = Math.min(Math.max(point.y + 22, bounds.y + 8), bounds.y + bounds.height - size.height - 8);
  // #region debug-point C:overlay-trigger
  fetch("http://127.0.0.1:7777/event", { method: "POST", body: JSON.stringify({ sessionId: "example-hover-dismiss", runId: "post-fix-3", hypothesisId: "C", location: "electron/main.cjs:showOverlay", msg: "[DEBUG] Overlay trigger assigned", data: { trigger: payload.trigger, autoHideOnHoverLeave, query: payload.query }, ts: Date.now() }) }).catch(() => {});
  // #endregion
  activeOverlayTrigger = payload.trigger;
  overlayWindow.setPosition(x, y, false);
  overlayWindow.webContents.send("translation:result", payload);
  overlayWindow.show();
  overlayWindow.moveTop();
}

app.whenReady().then(() => {
  app.dock?.hide();
  readPreferences();
  createWindows();
  createTray();
  startNativeListener();
  globalShortcut.register("CommandOrControl+Shift+T", showMainWindow);
});

app.on("before-quit", () => {
  app.isQuitting = true;
  nativeProcess?.kill();
  speech.stop();
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", (event) => event.preventDefault());

ipcMain.handle("translate", async (_, text) => translate(text));
ipcMain.handle("speech:speak", (_, text) => speech.speak(text));
ipcMain.on("speech:stop", () => speech.stop());
ipcMain.handle("state:get", getState);
ipcMain.handle("state:set-enabled", (_, value) => setEnabled(value));
ipcMain.handle("state:set-auto-hide-on-hover-leave", (_, value) => setAutoHideOnHoverLeave(value));
ipcMain.on("pet:toggle-main", toggleMainWindow);
ipcMain.on("pet:menu", showPetMenu);
ipcMain.on("pet:drag-start", () => {
  if (!petWindow || petWindow.isDestroyed()) return;
  petDragOrigin = petWindow.getBounds();
});
ipcMain.on("pet:drag-move", (_, delta) => {
  if (!petDragOrigin || !petWindow || petWindow.isDestroyed()) return;
  const deltaX = Number(delta?.deltaX);
  const deltaY = Number(delta?.deltaY);
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;
  const target = {
    x: Math.round(petDragOrigin.x + deltaX),
    y: Math.round(petDragOrigin.y + deltaY),
  };
  const display = screen.getDisplayNearestPoint({
    x: target.x + 38,
    y: target.y + 42,
  });
  const bounds = display.workArea;
  petWindow.setPosition(
    Math.min(Math.max(target.x, bounds.x), bounds.x + bounds.width - 76),
    Math.min(Math.max(target.y, bounds.y), bounds.y + bounds.height - 84),
    false,
  );
});
ipcMain.on("pet:drag-end", () => {
  petDragOrigin = undefined;
  savePetPosition();
});
ipcMain.on("window:hide", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.hide();
  broadcastState();
});
ipcMain.on("window:minimize", (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
ipcMain.on("permissions:open", (_, permission) => {
  const pane =
    permission === "input-monitoring-required"
      ? "Privacy_ListenEvent"
      : "Privacy_ScreenCapture";
  shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${pane}`);
});
