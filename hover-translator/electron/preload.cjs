const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("translator", {
  translate: (text) => ipcRenderer.invoke("translate", text),
  speak: (text) => ipcRenderer.invoke("speech:speak", text),
  stopSpeaking: () => ipcRenderer.send("speech:stop"),
  getState: () => ipcRenderer.invoke("state:get"),
  setEnabled: (enabled) => ipcRenderer.invoke("state:set-enabled", enabled),
  setAutoHideOnHoverLeave: (enabled) =>
    ipcRenderer.invoke("state:set-auto-hide-on-hover-leave", enabled),
  toggleMainWindow: () => ipcRenderer.send("pet:toggle-main"),
  showPetMenu: () => ipcRenderer.send("pet:menu"),
  startPetDrag: () => ipcRenderer.send("pet:drag-start"),
  movePet: (deltaX, deltaY) => ipcRenderer.send("pet:drag-move", { deltaX, deltaY }),
  endPetDrag: () => ipcRenderer.send("pet:drag-end"),
  hideWindow: () => ipcRenderer.send("window:hide"),
  minimizeWindow: () => ipcRenderer.send("window:minimize"),
  openPermissions: (permission) => ipcRenderer.send("permissions:open", permission),
  onTranslation: (listener) => {
    const handler = (_, payload) => listener(payload);
    ipcRenderer.on("translation:result", handler);
    return () => ipcRenderer.removeListener("translation:result", handler);
  },
  onState: (listener) => {
    const handler = (_, payload) => listener(payload);
    ipcRenderer.on("state:changed", handler);
    return () => ipcRenderer.removeListener("state:changed", handler);
  },
});
