const path = require("node:path");
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  screen,
  Tray
} = require("electron");
const { createStore } = require("./store.cjs");
const { getReminderCandidates } = require("./reminders.cjs");
const { getDockedBounds } = require("./window-layout.cjs");

let mainWindow;
let tray;
let store;
let reminderTimer;
let quitting = false;
let windowCollapsed = false;
let expandedBounds = { width: 420, height: 620 };

const COLLAPSED_WIDTH = 286;
const COLLAPSED_HEIGHT = 46;
const EXPANDED_MIN_HEIGHT = 520;

function getBoundsForDock(width, height, position) {
  const display = screen.getDisplayMatching(mainWindow.getBounds());
  return getDockedBounds(display.workArea, width, height, position);
}

function dockWindow(position = store.read().settings.dockPosition) {
  if (!mainWindow) return;
  const [width, height] = mainWindow.getSize();
  mainWindow.setBounds(getBoundsForDock(width, height, position), true);
}

function createTrayIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
      <rect x="3" y="3" width="14" height="14" rx="4" fill="none" stroke="black" stroke-width="1.8"/>
      <path d="M6.5 10.2 9 12.6l4.8-5.2" fill="none" stroke="black" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  const icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
  icon.setTemplateImage(true);
  return icon;
}

function showWindow({ quickAdd = false } = {}) {
  if (!mainWindow) return;
  if (quickAdd && windowCollapsed) setWindowCollapsed(false);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (quickAdd) mainWindow.webContents.send("focus-quick-add");
}

function setWindowCollapsed(collapsed) {
  if (!mainWindow || collapsed === windowCollapsed) return windowCollapsed;

  if (collapsed) {
    const currentBounds = mainWindow.getBounds();
    expandedBounds = {
      width: Math.max(currentBounds.width, 380),
      height: Math.max(currentBounds.height, EXPANDED_MIN_HEIGHT)
    };
    mainWindow.setMinimumSize(COLLAPSED_WIDTH, COLLAPSED_HEIGHT);
    mainWindow.setMaximumSize(COLLAPSED_WIDTH, COLLAPSED_HEIGHT);
    mainWindow.setResizable(false);
    mainWindow.setBounds(
      getBoundsForDock(COLLAPSED_WIDTH, COLLAPSED_HEIGHT, store.read().settings.dockPosition),
      true
    );
  } else {
    mainWindow.setMaximumSize(520, 10000);
    mainWindow.setMinimumSize(380, EXPANDED_MIN_HEIGHT);
    mainWindow.setResizable(true);
    mainWindow.setBounds(
      getBoundsForDock(expandedBounds.width, expandedBounds.height, store.read().settings.dockPosition),
      true
    );
  }

  windowCollapsed = collapsed;
  mainWindow.webContents.send("window:collapsed", windowCollapsed);
  return windowCollapsed;
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
  } else {
    showWindow();
  }
}

function createWindow() {
  const state = store.read();
  mainWindow = new BrowserWindow({
    width: 420,
    height: 620,
    minWidth: 380,
    minHeight: 520,
    maxWidth: 520,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: state.settings.alwaysOnTop,
    vibrancy: "sidebar",
    visualEffectState: "active",
    titleBarStyle: "hidden",
    trafficLightPosition: { x: -100, y: -100 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  mainWindow.once("ready-to-show", () => showWindow());
  mainWindow.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip("今日小记");
  tray.on("click", toggleWindow);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "查看今日待办", click: () => showWindow() },
    { label: "快速添加", accelerator: "CommandOrControl+Shift+Space", click: () => showWindow({ quickAdd: true }) },
    { type: "separator" },
    { label: "退出今日小记", click: () => app.quit() }
  ]));
}

function checkReminders() {
  const data = store.read();
  if (!data.settings.remindersEnabled || !Notification.isSupported()) return;

  const candidates = getReminderCandidates(data.tasks, data.reminderLog);
  for (const reminder of candidates) {
    const notification = new Notification({
      title: reminder.title,
      body: reminder.body,
      silent: false
    });
    notification.on("click", () => showWindow());
    notification.show();
  }

  if (candidates.length) {
    store.update((current) => {
      for (const reminder of candidates) current.reminderLog[reminder.key] = Date.now();
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      current.reminderLog = Object.fromEntries(
        Object.entries(current.reminderLog).filter(([, timestamp]) => timestamp >= cutoff)
      );
    });
  }
}

app.whenReady().then(() => {
  app.setName("今日小记");
  if (process.platform === "darwin") app.dock.hide();
  store = createStore(app.getPath("userData"));
  createWindow();
  createTray();

  globalShortcut.register("CommandOrControl+Shift+Space", () => showWindow({ quickAdd: true }));
  reminderTimer = setInterval(checkReminders, 60_000);
  setTimeout(checkReminders, 5_000);
});

app.on("before-quit", () => {
  quitting = true;
  clearInterval(reminderTimer);
});

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => {});
app.on("activate", () => showWindow());

ipcMain.handle("state:get", () => store.read());
ipcMain.handle("tasks:save", (_event, tasks) => store.update((data) => {
  data.tasks = Array.isArray(tasks) ? tasks.slice(0, 500) : data.tasks;
}));
ipcMain.handle("settings:update", (_event, settings) => store.update((data) => {
  data.settings = { ...data.settings, ...settings };
  mainWindow.setAlwaysOnTop(data.settings.alwaysOnTop);
  app.setLoginItemSettings({ openAtLogin: data.settings.launchAtLogin });
  if (settings.dockPosition === "left" || settings.dockPosition === "right") {
    dockWindow(settings.dockPosition);
  }
}));
ipcMain.handle("window:toggle-collapse", () => setWindowCollapsed(!windowCollapsed));
ipcMain.on("window:hide", () => mainWindow.hide());
ipcMain.on("app:quit", () => app.quit());
