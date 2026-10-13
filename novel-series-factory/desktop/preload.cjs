const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  importText: () => ipcRenderer.invoke("story:import"),
  exportAsset: (id, filename) => ipcRenderer.invoke("story:export", { id, filename }),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: settings => ipcRenderer.invoke("settings:save", settings),
  setVideoFullscreen: enabled => ipcRenderer.invoke("video:fullscreen", Boolean(enabled)),
});
