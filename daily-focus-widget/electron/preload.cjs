const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dailyFocus", {
  getState: () => ipcRenderer.invoke("state:get"),
  saveTasks: (tasks) => ipcRenderer.invoke("tasks:save", tasks),
  updateSettings: (settings) => ipcRenderer.invoke("settings:update", settings),
  toggleCollapse: () => ipcRenderer.invoke("window:toggle-collapse"),
  hide: () => ipcRenderer.send("window:hide"),
  quit: () => ipcRenderer.send("app:quit"),
  onCollapsedChange: (callback) => {
    const handler = (_event, collapsed) => callback(collapsed);
    ipcRenderer.on("window:collapsed", handler);
    return () => ipcRenderer.removeListener("window:collapsed", handler);
  },
  onFocusQuickAdd: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("focus-quick-add", handler);
    return () => ipcRenderer.removeListener("focus-quick-add", handler);
  }
});
