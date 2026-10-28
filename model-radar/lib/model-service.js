import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const execFileAsync = promisify(execFile);

const TYPE_MAP = {
  "text-generation": "语言模型",
  "text2text-generation": "语言模型",
  "image-text-to-text": "多模态",
  "visual-question-answering": "多模态",
  "image-to-text": "多模态",
  "text-to-image": "图像生成",
  "image-to-image": "图像生成",
  "text-to-video": "视频生成",
  "automatic-speech-recognition": "语音模型",
  "text-to-speech": "语音模型",
  "audio-text-to-text": "语音模型",
  "feature-extraction": "嵌入模型",
  "sentence-similarity": "嵌入模型"
};

const DISPLAY_PROVIDERS = new Map([
  ["deepseek-ai", "DeepSeek"],
  ["black-forest-labs", "Black Forest Labs"],
  ["qwen", "Qwen"],
  ["Qwen", "Qwen"],
  ["meta-llama", "Meta"],
  ["mistralai", "Mistral AI"],
  ["google", "Google"],
  ["openai", "OpenAI"],
  ["anthropic", "Anthropic"],
  ["stabilityai", "Stability AI"],
  ["microsoft", "Microsoft"],
  ["nvidia", "NVIDIA"],
  ["ByteDance-Seed", "ByteDance Seed"],
  ["tencent", "Tencent"],
  ["MiniMaxAI", "MiniMax"],
  ["moonshotai", "Moonshot AI"]
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function ageHours(date, now) {
  return Math.max(0, (now - new Date(date).getTime()) / HOUR);
}

export function classifyModel(model) {
  const tag = model.pipeline_tag || "";
  if (TYPE_MAP[tag]) return TYPE_MAP[tag];
  const tags = (model.tags || []).join(" ").toLowerCase();
  if (tags.includes("video")) return "视频生成";
  if (tags.includes("image") || tags.includes("diffusion")) return "图像生成";
  if (tags.includes("audio") || tags.includes("speech")) return "语音模型";
  if (tags.includes("embedding")) return "嵌入模型";
  if (tags.includes("multimodal") || tags.includes("vision")) return "多模态";
  return "语言模型";
}

export function normalizeProvider(raw = "") {
  const owner = raw.split("/")[0] || "Community";
  if (DISPLAY_PROVIDERS.has(owner)) return DISPLAY_PROVIDERS.get(owner);
  return owner
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function normalizeHuggingFace(model, now = Date.now()) {
  const createdAt = model.createdAt || new Date(now).toISOString();
  const recency = Math.exp(-ageHours(createdAt, now) / 120);
  const trend = Math.log10(1 + (model.trendingScore || 0)) / 3.5;
  const likes = Math.log10(1 + (model.likes || 0)) / 4;
  const downloads = Math.log10(1 + (model.downloads || 0)) / 7;
  const momentum = Math.round(clamp(trend * 100, 0, 100));
  const freshness = Math.round(clamp(recency * 100, 0, 100));
  const adoption = Math.round(clamp((likes * 0.6 + downloads * 0.4) * 100, 0, 100));
  const heat = Math.round(clamp(momentum * 0.55 + freshness * 0.25 + adoption * 0.2, 0, 100));

  return {
    id: model.id || model.modelId,
    name: (model.id || model.modelId || "").split("/").pop(),
    provider: normalizeProvider(model.id || model.modelId),
    type: classifyModel(model),
    heat,
    scoreBreakdown: { momentum, freshness, adoption },
    trendScore: model.trendingScore || 0,
    likes: model.likes || 0,
    downloads: model.downloads || 0,
    createdAt,
    updatedAt: model.lastModified || createdAt,
    source: "Hugging Face",
    url: `https://huggingface.co/${model.id || model.modelId}`,
    tags: (model.tags || []).filter((tag) => !tag.includes(":")).slice(0, 4),
    summary: `${classifyModel(model)} · ${formatCompact(model.downloads || 0)} 次下载 · ${formatCompact(model.likes || 0)} 赞`
  };
}

function formatCompact(value) {
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function normalizeOpenRouter(model, now = Date.now()) {
  const createdAt = new Date((model.created || now / 1000) * 1000).toISOString();
  const modelId = model.hugging_face_id || model.id;
  const modality = model.architecture?.modality || "text->text";
  const type = modality.includes("image")
    ? "多模态"
    : modality.includes("audio")
      ? "语音模型"
      : "语言模型";
  const freshness = Math.round(clamp(Math.exp(-ageHours(createdAt, now) / 120) * 100, 0, 100));
  const contextSignal = clamp(Math.log10(1 + (model.context_length || 0)) / 6, 0, 1);
  const momentum = Math.round(clamp((model.pricing?.prompt === "0" ? 0.82 : 0.64) * 100, 0, 100));
  const adoption = Math.round(clamp((contextSignal * 0.7 + (model.reasoning ? 0.3 : 0.15)) * 100, 0, 100));
  const heat = Math.round(clamp(momentum * 0.55 + freshness * 0.25 + adoption * 0.2, 0, 100));
  return {
    id: modelId,
    name: model.name?.split(":").pop()?.trim() || model.id.split("/").pop(),
    provider: normalizeProvider(model.hugging_face_id || model.id),
    type,
    heat,
    scoreBreakdown: { momentum, freshness, adoption },
    trendScore: 0,
    likes: 0,
    downloads: 0,
    createdAt,
    updatedAt: createdAt,
    source: "OpenRouter",
    url: `https://openrouter.ai/${model.id}`,
    tags: [
      model.pricing?.prompt === "0" ? "免费" : "API",
      model.context_length ? `${formatCompact(model.context_length)} context` : null,
      model.reasoning ? "推理" : null
    ].filter(Boolean),
    summary: `${type} · ${formatCompact(model.context_length || 0)} 上下文 · ${model.pricing?.prompt === "0" ? "免费调用" : "API 可用"}`
  };
}

function dedupeAndRank(items) {
  const models = new Map();
  for (const item of items) {
    const key = item.id.toLowerCase();
    const current = models.get(key);
    if (!current || item.heat > current.heat) {
      models.set(key, current
        ? { ...item, source: `${current.source} + ${item.source}`, heat: Math.min(100, Math.max(current.heat, item.heat) + 3) }
        : item);
    }
  }
  return [...models.values()]
    .sort((a, b) => b.heat - a.heat || new Date(b.createdAt) - new Date(a.createdAt))
    .map((model, index) => ({ ...model, rank: index + 1 }));
}

function addMovement(models, previous) {
  const previousById = new Map((previous?.models || []).map((model) => [model.id.toLowerCase(), model]));
  return models.map((model) => {
    const old = previousById.get(model.id.toLowerCase());
    return {
      ...model,
      movement: old
        ? { rankDelta: old.rank - model.rank, heatDelta: model.heat - old.heat, isNew: false }
        : previous
          ? { rankDelta: null, heatDelta: null, isNew: true }
          : null
    };
  });
}

async function fetchJson(url, fetcher, timeoutMs = 12_000) {
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "LifeYouMe-Model-Radar/1.0" } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  } catch (error) {
    if (process.env.CURL_FETCH_FALLBACK !== "true") throw error;
    const seconds = Math.max(1, Math.ceil(timeoutMs / 1000));
    const { stdout } = await execFileAsync("/usr/bin/curl", [
      "-4",
      "--fail",
      "--silent",
      "--show-error",
      "--location",
      "--max-time",
      String(seconds),
      "--header",
      "user-agent: LifeYouMe-Model-Radar/1.0",
      url
    ], { maxBuffer: 8 * 1024 * 1024 });
    return JSON.parse(stdout);
  }
}

export class ModelService {
  constructor({ fetcher = fetch, now = () => Date.now(), ttlMs = HOUR, historyPath = null } = {}) {
    this.fetcher = fetcher;
    this.now = now;
    this.ttlMs = ttlMs;
    this.historyPath = historyPath;
    this.snapshot = null;
    this.refreshing = null;
    this.historyLoaded = false;
  }

  async loadHistory() {
    if (this.historyLoaded || !this.historyPath) return;
    this.historyLoaded = true;
    try {
      this.snapshot = JSON.parse(await readFile(this.historyPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") console.error("读取模型历史快照失败：", error.message);
    }
  }

  async persist(snapshot) {
    if (!this.historyPath) return;
    await mkdir(dirname(this.historyPath), { recursive: true });
    await writeFile(this.historyPath, `${JSON.stringify(snapshot)}\n`, "utf8");
  }

  async getSnapshot({ force = false } = {}) {
    await this.loadHistory();
    const fresh = this.snapshot && this.now() - new Date(this.snapshot.updatedAt).getTime() < this.ttlMs;
    if (!force && fresh) return this.snapshot;
    return this.refresh();
  }

  async refresh() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.collect().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  async collect() {
    await this.loadHistory();
    const now = this.now();
    const previous = this.snapshot;
    const warnings = [];
    const huggingFaceApi = process.env.HUGGINGFACE_API_BASE || "https://huggingface.co";
    const tasks = [
      fetchJson(`${huggingFaceApi}/api/models?sort=trendingScore&direction=-1&limit=80`, this.fetcher, 30_000)
        .then((rows) => rows.map((row) => normalizeHuggingFace(row, now)))
        .catch((error) => {
          warnings.push(`Hugging Face: ${error.message}`);
          return [];
        }),
      fetchJson("https://openrouter.ai/api/v1/models", this.fetcher, 30_000)
        .then((payload) => (payload.data || [])
          .filter((row) => now - row.created * 1000 < 14 * DAY)
          .map((row) => normalizeOpenRouter(row, now)))
        .catch((error) => {
          warnings.push(`OpenRouter: ${error.message}`);
          return [];
        })
    ];
    const rankedModels = dedupeAndRank((await Promise.all(tasks)).flat()).slice(0, 60);
    const models = addMovement(rankedModels, previous);

    if (!models.length && this.snapshot) {
      return { ...this.snapshot, stale: true, warnings, nextUpdateAt: new Date(now + this.ttlMs).toISOString() };
    }
    if (!models.length) throw new Error(`没有可用数据源：${warnings.join("；")}`);

    const providers = [...new Set(models.map((model) => model.provider))].length;
    const types = [...new Set(models.map((model) => model.type))].length;
    const sameLeader = previous?.models?.[0]?.id?.toLowerCase() === models[0]?.id?.toLowerCase();
    const leaderSinceAt = sameLeader
      ? previous.leaderSinceAt || previous.updatedAt
      : new Date(now).toISOString();
    const leaderHours = Math.max(1, Math.floor((now - new Date(leaderSinceAt).getTime()) / HOUR) + 1);
    this.snapshot = {
      updatedAt: new Date(now).toISOString(),
      nextUpdateAt: new Date(now + this.ttlMs).toISOString(),
      stale: false,
      warnings,
      stats: { models: models.length, providers, types },
      leaderSinceAt,
      leaderHours,
      hasComparison: Boolean(previous),
      models
    };
    await this.persist(this.snapshot);
    return this.snapshot;
  }
}
