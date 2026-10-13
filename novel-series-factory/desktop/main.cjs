const { app, BrowserWindow, utilityProcess, ipcMain, dialog, session } = require("electron");
const { basename, join } = require("node:path");
const { randomBytes } = require("node:crypto");
const fs = require("node:fs/promises");

app.setName("故事片场");
let window, worker, origin, token, dataDir, configDir, restarting = false, quitting = false;
const root = join(__dirname, "..");
const uuid = /^[0-9a-f-]{36}$/;
const assets = /^(episode-\d{2}\.(mp4|srt)|narration-\d{2}\.wav|voice-[a-z0-9-]+-(sample|reference)\.wav|story-\d{2}\.json|narration\.wav|story\.json|series-complete\.mp4|commercial-delivery\.zip|(character|scene|prop)-[a-z0-9-]+-(sheet|front|threeQuarter|side|back)\.(jpg|png))$/;
const settingsFields = [
  ["ARK_BASE_URL", "方舟 API 地址"],
  ["ARK_API_KEY", "方舟 API Key", true],
  ["REFERENCE_ENV_FILE", "引用配置文件"],
  ["ARK_LLM_MODEL", "语言模型"],
  ["ARK_MULTIMODAL_MODEL", "多模态模型"],
  ["ARK_IMAGE_MODEL", "图像模型"],
  ["ARK_VIDEO_MODEL", "视频模型"],
  ["SEEDANCE_MULTIMODAL_REFERENCES", "Seedance 多模态参考"],
  ["SEEDANCE_CROSS_EPISODE_VIDEO_REFERENCE", "跨集视频续写"],
  ["SEEDANCE_MAX_REFERENCE_IMAGES", "单集人物参考图上限"],
  ["ASR_API_URL", "ASR 地址"],
  ["ASR_API_KEY", "ASR API Key", true],
  ["ASR_MODEL", "ASR 模型"],
  ["TTS_API_URL", "TTS 服务地址"],
  ["TTS_MODEL", "TTS 模型"],
  ["TTS_DEFAULT_SPEAKER", "默认音色"],
  ["FALLBACK_VIDEO_API_URL", "兜底视频地址"],
  ["FALLBACK_VIDEO_API_KEY", "兜底视频 Key", true],
  ["FALLBACK_VIDEO_MODEL", "兜底视频模型"],
  ["RERANK_API_URL", "重排服务地址"],
  ["RERANK_API_KEY", "重排服务 Key", true],
  ["RERANK_MODEL", "重排模型"],
  ["TIMESTAMP_API_URL", "时间戳服务地址"],
  ["TIMESTAMP_API_KEY", "时间戳服务 Key", true],
  ["TIMESTAMP_MODEL", "时间戳模型"],
  ["HERMES_ENABLED", "启用 Hermes Agent"],
  ["HERMES_MODE", "Hermes 模式"],
  ["HERMES_API_URL", "Hermes API 地址"],
  ["HERMES_API_KEY", "Hermes API Key", true],
  ["HERMES_MODEL", "Hermes 模型"],
  ["HERMES_MAX_ROUNDS", "Hermes 最大循环轮次"],
  ["ALLOW_BILLABLE_GENERATION", "允许付费生成"],
  ["DAILY_BUDGET_CNY", "每日预算"],
  ["VIDEO_COST_CNY_PER_SECOND", "视频生成估算单价（元/秒）"],
  ["MAX_MODEL_CONCURRENCY", "模型并发"],
  ["MODEL_REQUEST_TIMEOUT_MS", "请求超时"],
];

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { window?.show(); window?.focus(); });
  app.whenReady().then(start).catch(error => {
    dialog.showErrorBox("故事片场启动失败", error.message);
    app.quit();
  });
}

async function start() {
  const userData = app.getPath("userData");
  // Development preserves the existing project library; packaged builds use writable app data.
  dataDir = app.isPackaged ? join(userData, "data") : join(root, "data");
  configDir = app.isPackaged ? userData : root;
  await ensureConfigFile();
  origin = await startWorker();
  const partition = "nsf-desktop";
  const ses = session.fromPartition(partition);
  ses.webRequest.onBeforeSendHeaders({ urls: ["http://127.0.0.1:*/*"] }, (details, callback) => {
    const headers = { ...details.requestHeaders };
    if (origin && details.url.startsWith(`${origin}/`)) headers["x-desktop-token"] = token;
    callback({ requestHeaders: headers });
  });
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.webRequest.onHeadersReceived((details, callback) => callback({
    responseHeaders: { ...details.responseHeaders,
      "Content-Security-Policy": ["default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'none'"] },
  }));
  window = new BrowserWindow({
    width: 1280, height: 850, minWidth: 920, minHeight: 680, backgroundColor: "#111315",
    title: "故事片场", titleBarStyle: "hiddenInset", show: false,
    webPreferences: { preload: join(__dirname, "preload.cjs"), contextIsolation: true,
      sandbox: true, nodeIntegration: false, partition },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`${origin}/`)) event.preventDefault();
  });
  ipcMain.handle("story:import", async event => {
    authorize(event);
    const result = await dialog.showOpenDialog(window, { properties: ["openFile"], filters: [{ name: "UTF-8 小说正文", extensions: ["txt"] }] });
    if (result.canceled) return null;
    const path = result.filePaths[0];
    if ((await fs.stat(path)).size > 10_000_000) throw new Error("TXT 文件限制 10 MB");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(await fs.readFile(path));
    if ([...text].length > 1_000_000) throw new Error("小说正文最多支持 100 万字符，请按卷拆分");
    return { name: basename(path), text };
  });
  ipcMain.handle("story:export", async (event, { id, filename }) => {
    authorize(event);
    if (!uuid.test(id) || !assets.test(filename)) throw new Error("Invalid asset");
    const source = join(dataDir, "projects", id, filename);
    await fs.access(source);
    const result = await dialog.showSaveDialog(window, { defaultPath: filename });
    if (result.canceled) return false;
    await fs.copyFile(source, result.filePath);
    return true;
  });
  ipcMain.handle("settings:get", async event => {
    authorize(event);
    return readSettings();
  });
  ipcMain.handle("settings:save", async (event, settings) => {
    authorize(event);
    await saveSettings(settings);
    const nextOrigin = await restartWorker();
    setTimeout(() => window.loadURL(`${nextOrigin}/studio.html#settings`).catch(error => console.error(error.message)), 50);
    return { ok: true };
  });
  ipcMain.handle("video:fullscreen", async (event, enabled) => {
    authorize(event);
    if (!window || window.isDestroyed()) throw new Error("桌面窗口不可用");
    window.setFullScreen(Boolean(enabled));
    return { fullscreen: Boolean(enabled) };
  });
  window.on("close", event => {
    if (quitting) return;
    event.preventDefault();
    dialog.showMessageBox(window, { type: "question", message: "退出故事片场？",
      detail: "项目会保留。正在运行的本地任务将中断，下次打开可重试。", buttons: ["继续使用", "退出"], cancelId: 0 })
      .then(({ response }) => { if (response === 1) { quitting = true; app.quit(); } });
  });
  window.once("ready-to-show", () => window.show());
  await window.loadURL(`${origin}/studio.html`);
}

async function startWorker() {
  token = randomBytes(32).toString("hex");
  worker = utilityProcess.fork(join(root, "server.mjs"), [], {
    env: { ...process.env, HOST: "127.0.0.1", PORT: "0", NSF_DATA_DIR: dataDir,
      NSF_CONFIG_DIR: configDir, NSF_DESKTOP_TOKEN: token },
    stdio: "pipe",
  });
  worker.stderr.on("data", b => console.error(b.toString()));
  const nextOrigin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("本地服务启动超时")), 20000);
    worker.once("message", message => { clearTimeout(timer); resolve(message.url); });
    worker.once("exit", () => { clearTimeout(timer); reject(new Error("本地服务意外退出")); });
  });
  worker.on("exit", () => {
    if (!quitting && !restarting) dialog.showErrorBox("制作服务已停止", "请重新启动应用。中断任务会保留，并可重试。");
  });
  return nextOrigin;
}

async function restartWorker() {
  restarting = true;
  try {
    const oldWorker = worker;
    if (oldWorker) {
      await new Promise(resolve => {
        oldWorker.once("exit", resolve);
        oldWorker.kill();
        setTimeout(resolve, 2500);
      });
    }
    origin = await startWorker();
    return origin;
  } finally {
    restarting = false;
  }
}

function authorize(event) {
  if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame ||
      !event.senderFrame.url.startsWith(`${origin}/`)) throw new Error("Invalid caller");
}

function parseEnv(source) {
  const values = {};
  for (const rawLine of String(source || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (value.length >= 2 && ((value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'")))) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

function serializeEnv(values) {
  const known = new Set(settingsFields.map(([key]) => key));
  const lines = [
    "# Managed by 故事片场 desktop settings. Secrets are stored locally only.",
  ];
  for (const [key] of settingsFields) appendEnvLine(lines, key, values[key]);
  for (const key of Object.keys(values).sort()) {
    if (!known.has(key)) appendEnvLine(lines, key, values[key]);
  }
  return `${lines.join("\n")}\n`;
}

function appendEnvLine(lines, key, value) {
  if (value == null) return;
  const text = String(value);
  if (text.includes("\n")) return;
  const quote = /[\s#"'\\]/.test(text);
  lines.push(`${key}=${quote ? JSON.stringify(text) : text}`);
}

async function ensureConfigFile() {
  await fs.mkdir(configDir, { recursive: true });
  const target = join(configDir, ".env.local");
  try {
    await fs.access(target);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    try {
      await fs.copyFile(join(root, ".env.local"), target);
    } catch {
      await fs.copyFile(join(root, ".env.example"), target);
    }
  }
  const source = await fs.readFile(target, "utf8");
  const values = parseEnv(source);
  if (values.ARK_LLM_MODEL === "ep-your-endpoint-id" &&
      values.ARK_MULTIMODAL_MODEL === "ep-your-endpoint-id") {
    values.ARK_LLM_MODEL = "glm-5-2-260617";
    values.ARK_MULTIMODAL_MODEL = "glm-5-2-260617";
    if (values.ARK_IMAGE_MODEL === "doubao-seedream-4-0-250828") {
      values.ARK_IMAGE_MODEL = "doubao-seedream-5-0-260128";
    }
    await fs.writeFile(target, serializeEnv(values), { mode: 0o600 });
  }
}

async function readLocalEnv() {
  await ensureConfigFile();
  try {
    return parseEnv(await fs.readFile(join(configDir, ".env.local"), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function readSettings() {
  const values = await readLocalEnv();
  return {
    configPath: join(configDir, ".env.local"),
    fields: settingsFields.map(([key, label, secret]) => ({
      key,
      label,
      secret: Boolean(secret),
      value: secret ? "" : values[key] || "",
      hasValue: Boolean(values[key]),
      maskedValue: secret && values[key] ? maskSecret(values[key]) : "",
    })),
  };
}

async function saveSettings(settings) {
  const existing = await readLocalEnv();
  const incoming = settings && typeof settings === "object" ? settings : {};
  const allowed = new Set(settingsFields.map(([key]) => key));
  const next = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (!allowed.has(key)) continue;
    if (value === "" && settingsFields.find(field => field[0] === key)?.[2]) continue;
    next[key] = String(value ?? "").trim();
  }
  await fs.writeFile(join(configDir, ".env.local"), serializeEnv(next), { mode: 0o600 });
}

function maskSecret(value) {
  const text = String(value);
  if (text.length <= 10) return "已保存";
  return `${text.slice(0, 6)}…${text.slice(-4)}`;
}
app.on("before-quit", () => { if (quitting) worker?.kill(); });
app.on("window-all-closed", () => { quitting = true; worker?.kill(); app.quit(); });
