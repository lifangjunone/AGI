const { contextBridge, ipcRenderer } = require("electron");

const APP_COMMANDS = new Set([
  "new-requirement",
  "page:home",
  "page:history",
  "page:tasks",
  "page:employees",
  "page:radar",
  "scan-tasks",
  "rescan-tools",
  "refresh-runs",
  "density:standard",
  "density:comfortable",
  "runtime-recovered"
]);

const appCommandListeners = new Set();
const draftFlushListeners = new Set();
const pendingAppCommands = [];
const listener = (_event, command) => {
  if (!APP_COMMANDS.has(command)) return;
  if (appCommandListeners.size === 0) {
    pendingAppCommands.push(command);
    if (pendingAppCommands.length > 10) pendingAppCommands.shift();
    return;
  }
  appCommandListeners.forEach((callback) => callback(command));
};

ipcRenderer.on("app:command", listener);
ipcRenderer.on("drafts:flush-request", async (_event, requestId) => {
  let success = draftFlushListeners.size > 0;
  try {
    await Promise.all(
      [...draftFlushListeners].map((callback) => callback())
    );
  } catch {
    success = false;
  }
  ipcRenderer.send("drafts:flush-complete", requestId, success);
});
ipcRenderer.send("runtime:heartbeat");
setInterval(() => {
  ipcRenderer.send("runtime:heartbeat");
}, 2_000);

contextBridge.exposeInMainWorld("oneopc", {
  importRequirement: () => ipcRenderer.invoke("requirements:import"),
  importTextRequirement: (input) =>
    ipcRenderer.invoke("requirements:import-text", input),
  readInputDrafts: () => ipcRenderer.invoke("drafts:read"),
  stageInputDraft: (scope, value) =>
    ipcRenderer.sendSync("drafts:stage", scope, value),
  saveInputDraft: (scope, value) =>
    ipcRenderer.invoke("drafts:save", scope, value),
  clearInputDraft: (scope) => ipcRenderer.invoke("drafts:clear", scope),
  getUIPreferences: () => ipcRenderer.invoke("ui:preferences:get"),
  setInterfaceDensity: (density) =>
    ipcRenderer.invoke("ui:preferences:set", { density }),
  listRuns: () => ipcRenderer.invoke("runs:list"),
  listEmployees: () => ipcRenderer.invoke("employees:list"),
  saveEmployee: (employee) => ipcRenderer.invoke("employees:save", employee),
  setEmployeeStatus: (employeeId, status) =>
    ipcRenderer.invoke("employees:status", employeeId, status),
  assignProjectTeam: (runId, employeeIds) =>
    ipcRenderer.invoke("teams:assign", runId, employeeIds),
  scanTasks: (runId) => ipcRenderer.invoke("supervisor:scan", runId),
  controlTask: (runId, action) =>
    ipcRenderer.invoke("supervisor:action", runId, action),
  detectTools: () => ipcRenderer.invoke("tools:detect"),
  selectTools: (selection) => ipcRenderer.invoke("tools:select", selection),
  getIntelligenceSettings: () =>
    ipcRenderer.invoke("intelligence:settings:get"),
  setIntelligenceSettings: (settings) =>
    ipcRenderer.invoke("intelligence:settings:set", settings),
  runIntelligence: (runId) =>
    ipcRenderer.invoke("intelligence:run", runId),
  focusTechnologyExploration: () =>
    ipcRenderer.invoke("intelligence:focus"),
  revealPath: (targetPath) => ipcRenderer.invoke("paths:reveal", targetPath),
  openOutput: (url) => ipcRenderer.invoke("output:open", url),
  openSource: (url) => ipcRenderer.invoke("source:open", url),
  onAppCommand: (callback) => {
    if (typeof callback !== "function") return () => {};
    appCommandListeners.add(callback);
    pendingAppCommands.splice(0).forEach((command) => callback(command));
    return () => appCommandListeners.delete(callback);
  },
  onDraftFlushRequest: (callback) => {
    if (typeof callback !== "function") return () => {};
    draftFlushListeners.add(callback);
    return () => draftFlushListeners.delete(callback);
  }
});
