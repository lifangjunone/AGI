const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopWindow", {
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  loadSpeechModel: () => ipcRenderer.invoke("speech:model"),
  synthesizeSpeech: (request) => ipcRenderer.invoke("tts:synthesize", request),
  askGrammar: (request) => ipcRenderer.invoke("grammar:ask", request),
  explainStudy: (request) => ipcRenderer.invoke("study:explain", request),
  getLipSyncHealth: () => ipcRenderer.invoke("tts:lipsync-health"),
  getRendererConfig: () => ipcRenderer.invoke("renderer:config"),
  updateRendererState: (state) => ipcRenderer.invoke("renderer:state", state),
  platform: process.platform
});
