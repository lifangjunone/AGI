const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("node:path");
const { createRendererBridge } = require("./renderer-bridge.cjs");
const { registerSpeechModelHandlers } = require("./speech-model.cjs");
const { registerTtsHandlers } = require("./tts.cjs");
const { registerGrammarAiHandlers } = require("./grammar-ai.cjs");
const { registerStudyExplainerHandlers } = require("./study-explainer.cjs");

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
if (process.env.EIS_REMOTE_DEBUGGING_PORT) {
  app.commandLine.appendSwitch(
    "remote-debugging-port",
    process.env.EIS_REMOTE_DEBUGGING_PORT
  );
}
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
  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission) =>
      permission === "media" || permission === "speechRecognition"
  );
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback, details) => {
      const requestsAudio =
        !details.mediaTypes || details.mediaTypes.includes("audio");
      callback(
        (permission === "media" && requestsAudio) ||
          permission === "speechRecognition"
      );
    }
  );
  rendererBridge = createRendererBridge();
  registerSpeechModelHandlers(ipcMain, app);
  registerTtsHandlers(ipcMain);
  registerGrammarAiHandlers(ipcMain, app);
  registerStudyExplainerHandlers(ipcMain, app);
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
