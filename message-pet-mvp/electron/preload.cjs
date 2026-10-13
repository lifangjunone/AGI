const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("messagePetDesktop", {
  isDesktop: true,
  collapse: () => ipcRenderer.invoke("window:collapse"),
  expand: (view = "inbox") => ipcRenderer.invoke("window:expand", view),
  hide: () => ipcRenderer.send("window:hide"),
  notify: (payload) => ipcRenderer.invoke("notification:show", payload),
  onModeChange: (callback) => {
    const handler = (_event, mode) => callback(mode);
    ipcRenderer.on("window:mode", handler);
    return () => ipcRenderer.removeListener("window:mode", handler);
  },
  onNavigate: (callback) => {
    const handler = (_event, view) => callback(view);
    ipcRenderer.on("navigate", handler);
    return () => ipcRenderer.removeListener("navigate", handler);
  },
});
