const path = require("node:path");
const { fork } = require("node:child_process");
const http = require("node:http");
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  screen,
  Tray,
} = require("electron");

let mainWindow;
let tray;
let quitting = false;
let mode = "pet";
let serverProcess;

const PET_SIZE = { width: 220, height: 250 };
const DASHBOARD_SIZE = { width: 1180, height: 760 };
const DESKTOP_PORT = 43173;

function trayIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
      <path d="M5 8 3.5 3.8 8 5.5A8 8 0 0 1 14 5.5l4.5-1.7L17 8a7 7 0 1 1-12 0Z"
        fill="none" stroke="black" stroke-width="1.8" stroke-linejoin="round"/>
      <circle cx="8.2" cy="11" r="1" fill="black"/><circle cx="13.8" cy="11" r="1" fill="black"/>
    </svg>`;
  const icon = nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
  );
  icon.setTemplateImage(true);
  return icon;
}

function petBounds() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  return {
    x: display.workArea.x + display.workArea.width - PET_SIZE.width - 20,
    y: display.workArea.y + display.workArea.height - PET_SIZE.height - 24,
    ...PET_SIZE,
  };
}

function dashboardBounds() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const width = Math.min(DASHBOARD_SIZE.width, display.workArea.width - 60);
  const height = Math.min(DASHBOARD_SIZE.height, display.workArea.height - 60);
  return {
    x: Math.round(display.workArea.x + (display.workArea.width - width) / 2),
    y: Math.round(display.workArea.y + (display.workArea.height - height) / 2),
    width,
    height,
  };
}

function setMode(nextMode, view = "inbox") {
  if (!mainWindow) return;
  mode = nextMode;
  const petMode = mode === "pet";
  mainWindow.setResizable(!petMode);
  mainWindow.setMinimumSize(petMode ? PET_SIZE.width : 900, petMode ? PET_SIZE.height : 620);
  mainWindow.setBounds(petMode ? petBounds() : dashboardBounds(), true);
  mainWindow.setAlwaysOnTop(petMode, petMode ? "floating" : "normal");
  mainWindow.setSkipTaskbar(petMode);
  mainWindow.webContents.send("window:mode", mode);
  if (!petMode) mainWindow.webContents.send("navigate", view);
  mainWindow.show();
  if (!petMode) mainWindow.focus();
}

function toggleWindow() {
  if (!mainWindow) return;
  if (!mainWindow.isVisible()) {
    mainWindow.show();
    return;
  }
  setMode(mode === "pet" ? "dashboard" : "pet");
}

function waitForServer(url, attempts = 40) {
  return new Promise((resolve, reject) => {
    const check = (remaining) => {
      const request = http.get(url, (response) => {
        response.resume();
        if (response.statusCode < 500) resolve();
        else if (remaining > 0) setTimeout(() => check(remaining - 1), 100);
        else reject(new Error("消息服务启动失败"));
      });
      request.on("error", () => {
        if (remaining > 0) setTimeout(() => check(remaining - 1), 100);
        else reject(new Error("消息服务启动失败"));
      });
    };
    check(attempts);
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    ...PET_SIZE,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    titleBarStyle: "hidden",
    trafficLightPosition: { x: -100, y: -100 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  await mainWindow.loadURL(`http://127.0.0.1:${DESKTOP_PORT}`);
  mainWindow.once("ready-to-show", () => {
    mainWindow.setBounds(petBounds());
    mainWindow.show();
    mainWindow.webContents.send("window:mode", "pet");
  });
  mainWindow.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip("消息灵宠");
  tray.on("click", toggleWindow);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "显示桌面宠物", click: () => setMode("pet") },
      { label: "打开消息中心", click: () => setMode("dashboard", "inbox") },
      { label: "查看群聊 @我", click: () => setMode("dashboard", "mentions") },
      { label: "查看今日待办", click: () => setMode("dashboard", "todos") },
      { type: "separator" },
      { label: "隐藏", click: () => mainWindow.hide() },
      { label: "退出消息灵宠", click: () => app.quit() },
    ]),
  );
}

app.whenReady().then(() => {
  app.setName("消息灵宠");
  if (process.platform === "darwin") app.dock.hide();
  serverProcess = fork(path.join(__dirname, "../server.mjs"), [], {
    env: {
      ...process.env,
      PORT: String(DESKTOP_PORT),
      HOST: "127.0.0.1",
      MESSAGE_PET_DATA_DIR: path.join(app.getPath("userData"), "data"),
    },
    stdio: "ignore",
  });
  waitForServer(`http://127.0.0.1:${DESKTOP_PORT}/api/dashboard`)
    .then(createWindow)
    .catch((error) => {
      console.error(error);
      app.quit();
    });
  createTray();
  globalShortcut.register("CommandOrControl+Shift+M", toggleWindow);
});

app.on("before-quit", () => {
  quitting = true;
  serverProcess?.kill();
});
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => {});
app.on("activate", () => (mainWindow ? mainWindow.show() : createWindow()));

ipcMain.handle("window:collapse", () => setMode("pet"));
ipcMain.handle("window:expand", (_event, view) => setMode("dashboard", view));
ipcMain.on("window:hide", () => mainWindow.hide());
ipcMain.handle("notification:show", (_event, payload = {}) => {
  if (!Notification.isSupported()) return false;
  const notification = new Notification({
    title: payload.title || "消息灵宠提醒",
    body: payload.body || "你有一条重要消息需要处理",
    silent: false,
  });
  notification.on("click", () => setMode("dashboard", payload.view || "inbox"));
  notification.show();
  return true;
});
