const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const { createRendererBridge } = require("./renderer-bridge.cjs");
const { registerTtsHandlers } = require("./tts.cjs");

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
let rendererBridge;

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 18, y: 17 },
    backgroundColor: "#11120f",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    window.loadURL(devUrl);
  } else {
    window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  window.once("ready-to-show", () => window.show());
}

app.whenReady().then(() => {
  rendererBridge = createRendererBridge();
  registerTtsHandlers(ipcMain);
  ipcMain.handle("renderer:state", (_event, message) =>
    rendererBridge.publish(message)
  );
  ipcMain.handle("renderer:config", () => ({
    signalUrl: process.env.VITE_METAHUMAN_SIGNAL_URL ?? ""
  }));
  ipcMain.on("window:minimize", (event) =>
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  );
  ipcMain.on("window:maximize", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    window.isMaximized() ? window.unmaximize() : window.maximize();
  });
  ipcMain.on("window:close", (event) =>
    BrowserWindow.fromWebContents(event.sender)?.close()
  );

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  rendererBridge?.close();
  rendererBridge = undefined;
});
