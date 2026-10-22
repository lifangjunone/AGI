import express from "express";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs, existsSync } from "node:fs";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { dirname, resolve } from "node:path";

const app = express();
const root = process.cwd();
const production = process.argv.includes("--production");
const port = Number(process.env.PORT || 5173);
const dataFile = resolve(process.env.FLOWFRAME_DATA_DIR || resolve(root, "data"), "model-configs.json");
const allowedTypes = new Set(["llm", "image", "video", "tts", "stt", "vision", "avatar", "music", "enhance", "moderation"]);
const allowedProviders = new Set(["OpenAI Compatible", "Replicate", "Custom API", "本地服务"]);
const allowedAuth = new Set(["Bearer Token", "API Key Header", "无需鉴权"]);
const apiPrefixes = ["", "/flowframe"];
const requestLog = new Map();

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

function apiPaths(path) {
  return apiPrefixes.map(prefix => `${prefix}${path}`);
}

function parseCookies(request) {
  return Object.fromEntries((request.headers.cookie || "").split(";").flatMap(part => {
    const index = part.indexOf("=");
    if (index < 1) return [];
    return [[part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())]];
  }));
}

function ownerFor(request, response) {
  let token = parseCookies(request).flowframe_workspace;
  if (!/^[a-f0-9-]{36}$/.test(token || "")) {
    token = randomUUID();
    response.append("Set-Cookie", `flowframe_workspace=${token}; Path=/flowframe; HttpOnly; SameSite=Strict; Max-Age=31536000${production ? "; Secure" : ""}`);
  }
  return createHash("sha256").update(token).digest("hex");
}

function publicConfig(config) {
  const { apiKey: _apiKey, owner: _owner, ...safe } = config;
  return { ...safe, hasApiKey: Boolean(config.apiKey) };
}

async function readStore() {
  try {
    const parsed = JSON.parse(await fs.readFile(dataFile, "utf8"));
    return Array.isArray(parsed.configs) ? parsed : { configs: [] };
  } catch (error) {
    if (error.code === "ENOENT") return { configs: [] };
    throw error;
  }
}

async function writeStore(store) {
  await fs.mkdir(dirname(dataFile), { recursive: true, mode: 0o700 });
  const temporary = `${dataFile}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, dataFile);
  await fs.chmod(dataFile, 0o600);
}

function isPrivateAddress(address) {
  if (address === "::1" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:")) return true;
  if (!address.includes(".")) return false;
  const [a, b] = address.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function validateTarget(rawBaseUrl, provider) {
  let url;
  try {
    url = new URL(rawBaseUrl);
  } catch {
    throw new Error("Base URL 格式无效");
  }
  if (url.username || url.password || url.search || url.hash) throw new Error("Base URL 不能包含账号、查询参数或片段");
  const local = provider === "本地服务";
  if (local) {
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("本地服务仅支持 HTTP(S)");
    if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) throw new Error("本地服务仅允许访问本机回环地址");
  } else {
    if (url.protocol !== "https:") throw new Error("外部模型服务必须使用 HTTPS");
    const addresses = isIP(url.hostname)
      ? [{ address: url.hostname }]
      : await lookup(url.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
      throw new Error("目标地址指向内网或保留网段，已拒绝连接");
    }
  }
  return url.toString().replace(/\/+$/, "");
}

function requestHeaders(config) {
  const headers = { Accept: "application/json", "User-Agent": "FlowFrame-Model-Verifier/1.0" };
  if (config.auth === "Bearer Token") headers.Authorization = `Bearer ${config.apiKey}`;
  if (config.auth === "API Key Header") headers["x-api-key"] = config.apiKey;
  return headers;
}

async function fetchJson(url, config) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      headers: requestHeaders(config),
      signal: controller.signal,
      redirect: "error",
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { /* validated below */ }
    if (!response.ok) {
      const detail = body?.error?.message || body?.message || `HTTP ${response.status}`;
      throw new Error(`供应商拒绝连接：${detail}`);
    }
    if (!body || typeof body !== "object") throw new Error("供应商未返回可验证的 JSON 数据");
    return body;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("连接超时（12 秒）");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function providerRequest(url, config, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 20_000);
  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        ...requestHeaders(config),
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      redirect: "error",
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { /* validated below */ }
    if (!response.ok) {
      const detail = body?.error?.message || body?.message || `HTTP ${response.status}`;
      throw new Error(`供应商请求失败：${detail}`);
    }
    if (!body || typeof body !== "object") throw new Error("供应商未返回可识别的 JSON 任务");
    return body;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("供应商请求超时");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeJobStatus(status) {
  const value = String(status || "").toLowerCase();
  if (["succeeded", "completed", "complete", "done", "ready"].includes(value)) return "done";
  if (["failed", "error", "canceled", "cancelled"].includes(value)) return "failed";
  if (["processing", "running", "starting", "in_progress"].includes(value)) return "running";
  return "queued";
}

function outputFrom(body) {
  const output = body.output ?? body.data?.output ?? body.result?.url ?? body.video?.url;
  if (Array.isArray(output)) return output.find(value => typeof value === "string") || "";
  if (typeof output === "string") return output;
  return output?.url || "";
}

function generationRequest(config, input, referenceDataUrl) {
  const duration = Math.max(1, Math.min(30, Number.parseInt(input.duration, 10) || 5));
  const commonInput = {
    prompt: input.prompt,
    duration,
    aspect_ratio: input.ratio,
    mode: input.mode,
    ...(referenceDataUrl ? { image: referenceDataUrl } : {}),
  };
  if (config.provider === "Replicate") {
    const [owner, model] = config.model.split("/");
    return {
      url: `${config.baseUrl}/models/${encodeURIComponent(owner)}/${encodeURIComponent(model)}/predictions`,
      body: { input: commonInput },
    };
  }
  if (config.provider === "OpenAI Compatible") {
    return {
      url: `${config.baseUrl}/videos`,
      body: {
        model: config.model,
        prompt: input.prompt,
        seconds: duration,
        size: input.ratio,
        ...(referenceDataUrl ? { input_reference: referenceDataUrl } : {}),
      },
    };
  }
  return {
    url: `${config.baseUrl}/generations`,
    body: { model: config.model, input: commonInput },
  };
}

function statusUrlFor(config, body, externalId) {
  let candidate;
  if (body.urls?.get) candidate = body.urls.get;
  else if (body.status_url) candidate = body.status_url;
  else if (config.provider === "Replicate") candidate = `${config.baseUrl}/predictions/${encodeURIComponent(externalId)}`;
  else if (config.provider === "OpenAI Compatible") candidate = `${config.baseUrl}/videos/${encodeURIComponent(externalId)}`;
  else candidate = `${config.baseUrl}/generations/${encodeURIComponent(externalId)}`;
  const statusUrl = new URL(candidate, `${config.baseUrl}/`);
  const configuredUrl = new URL(config.baseUrl);
  if (statusUrl.origin !== configuredUrl.origin) {
    throw new Error("供应商返回了跨域状态地址，已拒绝跟随");
  }
  return statusUrl.toString();
}

function publicJob(job) {
  const { owner: _owner, statusUrl: _statusUrl, ...safe } = job;
  return safe;
}

function publicProject(project) {
  const { owner: _owner, ...safe } = project;
  return safe;
}

function publicAsset(asset) {
  const { owner: _owner, filePath: _filePath, ...safe } = asset;
  return { ...safe, url: `/flowframe/api/assets/${asset.id}/content` };
}

const acceptedAssetTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["video/mp4", ".mp4"],
  ["video/webm", ".webm"],
  ["audio/mpeg", ".mp3"],
  ["audio/wav", ".wav"],
  ["audio/ogg", ".ogg"],
]);

function projectFromInput(input, existing, owner) {
  const title = String(input.title ?? existing?.title ?? "未命名项目").trim().slice(0, 120) || "未命名项目";
  const timeline = input.timeline && typeof input.timeline === "object"
    ? {
        time: Math.max(0, Math.min(3600, Number(input.timeline.time) || 0)),
        clips: Math.max(0, Math.min(200, Number(input.timeline.clips) || 0)),
        tool: String(input.timeline.tool || "媒体").slice(0, 20),
        mediaTab: String(input.timeline.mediaTab || "项目素材").slice(0, 20),
        propertyTab: String(input.timeline.propertyTab || "基础").slice(0, 20),
        removedBg: Boolean(input.timeline.removedBg),
      }
    : existing?.timeline || { time: 0, clips: 1, tool: "媒体", mediaTab: "项目素材", propertyTab: "基础", removedBg: false };
  return {
    id: existing?.id || randomUUID(),
    owner,
    title,
    image: String(input.image ?? existing?.image ?? "").slice(0, 2000),
    ratio: String(input.ratio ?? existing?.ratio ?? "16:9").slice(0, 16),
    status: String(input.status ?? existing?.status ?? "draft") === "completed" ? "completed" : "draft",
    timeline,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function modelIdsFrom(body) {
  const rows = Array.isArray(body.data) ? body.data : Array.isArray(body.models) ? body.models : [];
  return rows.map(item => typeof item === "string" ? item : item?.id || item?.name).filter(Boolean);
}

async function verifyConnection(input, existingApiKey = "") {
  const config = {
    type: String(input.type || ""),
    provider: String(input.provider || ""),
    baseUrl: String(input.baseUrl || "").trim(),
    model: String(input.model || "").trim(),
    apiKey: String(input.apiKey || existingApiKey || ""),
    auth: String(input.auth || ""),
  };
  if (!allowedTypes.has(config.type) || !allowedProviders.has(config.provider) || !allowedAuth.has(config.auth)) {
    throw new Error("模型类型、接口协议或鉴权方式无效");
  }
  if (!config.baseUrl || !config.model) throw new Error("Base URL 和模型 ID 不能为空");
  if (config.auth !== "无需鉴权" && !config.apiKey) throw new Error("当前鉴权方式需要 API Key");
  const baseUrl = await validateTarget(config.baseUrl, config.provider);
  const started = Date.now();
  let evidence;

  if (config.provider === "Replicate") {
    if (!/^[\w.-]+\/[\w.-]+$/.test(config.model)) throw new Error("Replicate 模型 ID 应为 owner/model");
    const [owner, model] = config.model.split("/");
    const body = await fetchJson(`${baseUrl}/models/${encodeURIComponent(owner)}/${encodeURIComponent(model)}`, config);
    const returned = `${body.owner || ""}/${body.name || ""}`;
    if (returned !== config.model) throw new Error(`返回的模型与配置不一致：${returned || "未知"}`);
    evidence = `供应商返回了精确模型 ${returned}`;
  } else {
    const body = await fetchJson(`${baseUrl}/models`, config);
    const ids = modelIdsFrom(body);
    if (!ids.includes(config.model)) {
      throw new Error(ids.length
        ? `服务可连接，但模型列表中不存在“${config.model}”`
        : "服务可连接，但没有返回任何可用模型 ID");
    }
    evidence = `模型列表确认存在 ${config.model}`;
  }
  return { latencyMs: Date.now() - started, evidence, normalizedBaseUrl: baseUrl };
}

function rateLimit(request, response, next) {
  const key = request.ip || request.socket.remoteAddress || "unknown";
  const now = Date.now();
  const recent = (requestLog.get(key) || []).filter(time => now - time < 60_000);
  if (recent.length >= 20) return response.status(429).json({ ok: false, message: "操作过于频繁，请稍后再试" });
  recent.push(now);
  requestLog.set(key, recent);
  next();
}

app.get(apiPaths("/api/model-configs"), async (request, response, next) => {
  try {
    const owner = ownerFor(request, response);
    const store = await readStore();
    response.json({ ok: true, configs: store.configs.filter(item => item.owner === owner).map(publicConfig) });
  } catch (error) { next(error); }
});

app.post(apiPaths("/api/model-connections/verify"), rateLimit, async (request, response) => {
  try {
    const owner = ownerFor(request, response);
    const store = await readStore();
    const existing = store.configs.find(item => item.owner === owner && item.id === request.body.id);
    const result = await verifyConnection(request.body, existing?.apiKey);
    response.json({ ok: true, verified: true, ...result });
  } catch (error) {
    response.status(422).json({ ok: false, verified: false, code: "MODEL_VERIFY_FAILED", message: error.message });
  }
});

app.post(apiPaths("/api/model-configs"), rateLimit, async (request, response) => {
  try {
    const owner = ownerFor(request, response);
    const store = await readStore();
    const existingIndex = store.configs.findIndex(item => item.owner === owner && item.id === request.body.id);
    const existing = existingIndex >= 0 ? store.configs[existingIndex] : null;
    const apiKey = String(request.body.apiKey || existing?.apiKey || "");
    const base = {
      id: existing?.id || randomUUID(),
      owner,
      type: String(request.body.type || ""),
      name: String(request.body.name || "").trim().slice(0, 80),
      provider: String(request.body.provider || ""),
      baseUrl: String(request.body.baseUrl || "").trim(),
      model: String(request.body.model || "").trim().slice(0, 160),
      apiKey,
      auth: String(request.body.auth || ""),
      mode: String(request.body.mode || "同步响应"),
      enabled: request.body.enabled !== false,
      status: "draft",
      latency: "未验证",
      evidence: "",
      updatedAt: new Date().toISOString(),
    };
    if (!base.name || !base.model) return response.status(400).json({ ok: false, message: "配置名称和模型 ID 不能为空" });
    if (!allowedTypes.has(base.type) || !allowedProviders.has(base.provider) || !allowedAuth.has(base.auth)) {
      return response.status(400).json({ ok: false, message: "模型配置字段无效" });
    }
    if (request.body.verify) {
      const verified = await verifyConnection(base, apiKey);
      base.baseUrl = verified.normalizedBaseUrl;
      base.status = "verified";
      base.latency = `${verified.latencyMs}ms`;
      base.evidence = verified.evidence;
      base.verifiedAt = new Date().toISOString();
    }
    if (existingIndex >= 0) store.configs[existingIndex] = base;
    else store.configs.push(base);
    await writeStore(store);
    response.status(existing ? 200 : 201).json({ ok: true, config: publicConfig(base) });
  } catch (error) {
    response.status(422).json({ ok: false, message: error.message });
  }
});

app.delete(apiPaths("/api/model-configs/:id"), rateLimit, async (request, response, next) => {
  try {
    const owner = ownerFor(request, response);
    const store = await readStore();
    const before = store.configs.length;
    store.configs = store.configs.filter(item => !(item.owner === owner && item.id === request.params.id));
    if (store.configs.length === before) return response.status(404).json({ ok: false, message: "配置不存在" });
    await writeStore(store);
    response.json({ ok: true });
  } catch (error) { next(error); }
});

app.get(apiPaths("/api/jobs"), async (request, response, next) => {
  try {
    const owner = ownerFor(request, response);
    const store = await readStore();
    response.json({
      ok: true,
      jobs: (store.jobs || []).filter(item => item.owner === owner).slice(-20).reverse().map(publicJob),
    });
  } catch (error) { next(error); }
});

app.post(apiPaths("/api/jobs"), rateLimit, async (request, response) => {
  try {
    const owner = ownerFor(request, response);
    const prompt = String(request.body.prompt || "").trim();
    if (!prompt || prompt.length > 1000) return response.status(400).json({ ok: false, message: "提示词长度必须为 1–1000 字" });
    const store = await readStore();
    const config = store.configs.find(item =>
      item.owner === owner && item.id === request.body.modelId &&
      item.type === "video" && item.status === "verified" && item.enabled !== false);
    if (!config) return response.status(409).json({ ok: false, message: "视频模型不存在、未验证或已停用" });
    const referenceAsset = request.body.referenceAssetId
      ? (store.assets || []).find(item =>
          item.owner === owner && item.id === request.body.referenceAssetId && item.category === "image")
      : null;
    if (request.body.referenceAssetId && !referenceAsset) {
      return response.status(400).json({ ok: false, message: "参考图不存在或不属于当前工作空间" });
    }
    if (request.body.mode !== "文生视频" && !referenceAsset) {
      return response.status(400).json({ ok: false, message: "图生视频与多图参考模式必须上传参考图" });
    }
    let referenceDataUrl = "";
    if (referenceAsset) {
      if (referenceAsset.size > 8 * 1024 * 1024) {
        return response.status(413).json({ ok: false, message: "参考图不能超过 8MB" });
      }
      const referenceBytes = await fs.readFile(referenceAsset.filePath);
      referenceDataUrl = `data:${referenceAsset.mimeType};base64,${referenceBytes.toString("base64")}`;
    }
    const generation = generationRequest(config, request.body, referenceDataUrl);
    const body = await providerRequest(generation.url, config, { method: "POST", body: generation.body });
    const externalId = String(body.id || body.data?.id || body.task_id || "");
    if (!externalId) throw new Error("供应商没有返回任务 ID，无法追踪生成状态");
    const status = normalizeJobStatus(body.status);
    const job = {
      id: randomUUID(),
      owner,
      externalId,
      modelId: config.id,
      modelName: config.name,
      model: config.model,
      prompt,
      ratio: String(request.body.ratio || "16:9"),
      duration: String(request.body.duration || "5 秒"),
      mode: String(request.body.mode || "文生视频"),
      referenceAssetId: referenceAsset?.id || "",
      status,
      progress: status === "done" ? 100 : 0,
      outputUrl: outputFrom(body),
      statusUrl: statusUrlFor(config, body, externalId),
      error: status === "failed" ? String(body.error || body.message || "生成失败") : "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.jobs = [...(store.jobs || []), job].slice(-100);
    await writeStore(store);
    response.status(201).json({ ok: true, job: publicJob(job) });
  } catch (error) {
    response.status(422).json({ ok: false, message: error.message });
  }
});

app.get(apiPaths("/api/jobs/:id"), rateLimit, async (request, response) => {
  try {
    const owner = ownerFor(request, response);
    const store = await readStore();
    const index = (store.jobs || []).findIndex(item => item.owner === owner && item.id === request.params.id);
    if (index < 0) return response.status(404).json({ ok: false, message: "任务不存在" });
    const job = store.jobs[index];
    if (!["done", "failed"].includes(job.status)) {
      const config = store.configs.find(item => item.owner === owner && item.id === job.modelId);
      if (!config) throw new Error("任务关联的模型配置已删除");
      const body = await providerRequest(job.statusUrl, config);
      job.status = normalizeJobStatus(body.status);
      job.progress = Number(body.progress ?? body.data?.progress ?? (job.status === "done" ? 100 : job.progress || 0));
      job.outputUrl = outputFrom(body) || job.outputUrl;
      job.error = job.status === "failed" ? String(body.error || body.message || "生成失败") : "";
      job.updatedAt = new Date().toISOString();
      store.jobs[index] = job;
      await writeStore(store);
    }
    response.json({ ok: true, job: publicJob(job) });
  } catch (error) {
    response.status(422).json({ ok: false, message: error.message });
  }
});

app.get(apiPaths("/api/projects"), async (request, response, next) => {
  try {
    const owner = ownerFor(request, response);
    const store = await readStore();
    const projects = (store.projects || [])
      .filter(item => item.owner === owner)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .map(publicProject);
    response.json({ ok: true, projects });
  } catch (error) { next(error); }
});

app.post(apiPaths("/api/projects"), rateLimit, async (request, response, next) => {
  try {
    const owner = ownerFor(request, response);
    const store = await readStore();
    const project = projectFromInput(request.body, null, owner);
    store.projects = [...(store.projects || []), project];
    await writeStore(store);
    response.status(201).json({ ok: true, project: publicProject(project) });
  } catch (error) { next(error); }
});

app.put(apiPaths("/api/projects/:id"), rateLimit, async (request, response, next) => {
  try {
    const owner = ownerFor(request, response);
    const store = await readStore();
    const index = (store.projects || []).findIndex(item => item.owner === owner && item.id === request.params.id);
    if (index < 0) return response.status(404).json({ ok: false, message: "项目不存在" });
    const project = projectFromInput(request.body, store.projects[index], owner);
    store.projects[index] = project;
    await writeStore(store);
    response.json({ ok: true, project: publicProject(project) });
  } catch (error) { next(error); }
});

app.delete(apiPaths("/api/projects/:id"), rateLimit, async (request, response, next) => {
  try {
    const owner = ownerFor(request, response);
    const store = await readStore();
    const before = (store.projects || []).length;
    store.projects = (store.projects || []).filter(item => !(item.owner === owner && item.id === request.params.id));
    if (store.projects.length === before) return response.status(404).json({ ok: false, message: "项目不存在" });
    await writeStore(store);
    response.json({ ok: true });
  } catch (error) { next(error); }
});

app.get(apiPaths("/api/assets"), async (request, response, next) => {
  try {
    const owner = ownerFor(request, response);
    const store = await readStore();
    response.json({
      ok: true,
      assets: (store.assets || [])
        .filter(item => item.owner === owner)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .map(publicAsset),
    });
  } catch (error) { next(error); }
});

app.post(
  apiPaths("/api/assets"),
  rateLimit,
  express.raw({ type: "application/octet-stream", limit: "32mb" }),
  async (request, response, next) => {
    try {
      const owner = ownerFor(request, response);
      const mimeType = String(request.headers["x-file-type"] || "").toLowerCase();
      const extension = acceptedAssetTypes.get(mimeType);
      if (!extension) return response.status(415).json({ ok: false, message: "仅支持 JPG、PNG、WebP、MP4、WebM、MP3、WAV 与 OGG" });
      if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
        return response.status(400).json({ ok: false, message: "上传文件为空" });
      }
      const originalName = decodeURIComponent(String(request.headers["x-file-name"] || "未命名素材")).slice(0, 180);
      const id = randomUUID();
      const assetDirectory = resolve(dirname(dataFile), "assets", owner);
      await fs.mkdir(assetDirectory, { recursive: true, mode: 0o700 });
      const filePath = resolve(assetDirectory, `${id}${extension}`);
      await fs.writeFile(filePath, request.body, { mode: 0o600, flag: "wx" });
      const category = mimeType.startsWith("video/") ? "video" : mimeType.startsWith("audio/") ? "audio" : "image";
      const asset = {
        id,
        owner,
        name: originalName,
        mimeType,
        category,
        size: request.body.length,
        filePath,
        createdAt: new Date().toISOString(),
      };
      const store = await readStore();
      store.assets = [...(store.assets || []), asset];
      await writeStore(store);
      response.status(201).json({ ok: true, asset: publicAsset(asset) });
    } catch (error) { next(error); }
  },
);

app.get(apiPaths("/api/assets/:id/content"), async (request, response, next) => {
  try {
    const owner = ownerFor(request, response);
    const store = await readStore();
    const asset = (store.assets || []).find(item => item.owner === owner && item.id === request.params.id);
    if (!asset) return response.status(404).end();
    response.setHeader("Content-Type", asset.mimeType);
    response.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(asset.name)}`);
    response.setHeader("Cache-Control", "private, max-age=3600");
    response.sendFile(asset.filePath);
  } catch (error) { next(error); }
});

app.delete(apiPaths("/api/assets/:id"), rateLimit, async (request, response, next) => {
  try {
    const owner = ownerFor(request, response);
    const store = await readStore();
    const index = (store.assets || []).findIndex(item => item.owner === owner && item.id === request.params.id);
    if (index < 0) return response.status(404).json({ ok: false, message: "素材不存在" });
    const [asset] = store.assets.splice(index, 1);
    await writeStore(store);
    await fs.unlink(asset.filePath).catch(error => {
      if (error.code !== "ENOENT") throw error;
    });
    response.json({ ok: true });
  } catch (error) { next(error); }
});

if (production) {
  const dist = resolve(root, "dist");
  if (!existsSync(dist)) {
    console.error("dist 不存在，请先运行 npm run build");
    process.exit(1);
  }
  app.use("/flowframe", express.static(dist, { fallthrough: true }));
  app.get(["/flowframe", "/flowframe/*path"], (_request, response) => response.sendFile(resolve(dist, "index.html")));
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({ root, server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ ok: false, message: "服务暂时不可用" });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`FlowFrame running at http://127.0.0.1:${port}`);
});
