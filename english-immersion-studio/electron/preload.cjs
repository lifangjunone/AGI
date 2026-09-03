const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopWindow", {
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  synthesizeSpeech: (request) => ipcRenderer.invoke("tts:synthesize", request),
  getLipSyncHealth: () => ipcRenderer.invoke("tts:lipsync-health"),
  getRendererConfig: () => ipcRenderer.invoke("renderer:config"),
  updateRendererState: (state) => ipcRenderer.invoke("renderer:state", state),
  platform: process.platform
});
