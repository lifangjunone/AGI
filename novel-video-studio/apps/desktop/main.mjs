import { app, BrowserWindow, shell } from "electron";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

let mainWindow;
let localServer;

app.setName("长卷制片厂");

async function firstExisting(paths) {
  for (const candidate of paths) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next supported configuration path.
    }
  }
  return undefined;
}

async function configureRuntime() {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const userDataDirectory = app.getPath("userData");
  const configFile = await firstExisting([
    path.join(userDataDirectory, ".env.local"),
    path.resolve(moduleDirectory, "../../.env.local")
  ]);
  if (configFile) process.env.NOVEL_STUDIO_CONFIG_FILE = configFile;
  process.env.NOVEL_STUDIO_DATA_DIRECTORY = path.join(userDataDirectory, "data");
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 680,
    backgroundColor: "#10110f",
    title: "长卷制片厂",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}/desktop/`);
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${port}/`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
  mainWindow.on("closed", () => { mainWindow = undefined; });
}

app.whenReady().then(async () => {
  await configureRuntime();
  const { startServer } = await import("../../server.mjs");
  localServer = await startServer({ host: "127.0.0.1", port: 0, quiet: true });
  createWindow(localServer.port);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(localServer.port);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => localServer?.server.close());
