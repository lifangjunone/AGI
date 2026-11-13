import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { AnalyticsStore } from "./analytics-store.mjs";
import { buildFortune, buildModelPrompt, normalizeBirthDate, normalizeBirthTime } from "./fate-engine.mjs";
import { geocodePlace } from "./geocoder.mjs";
import { completeWithMaas, maasConfiguration } from "./maas-client.mjs";
import { buildProfessionalReading } from "./numerologist-engine.mjs";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const publicRoot = join(root, "public");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 43330);
const dataPath = process.env.ASTRO_FATE_DATA_PATH || join(root, "data", "analytics.json");
const freeLimit = Number(process.env.ASTRO_FATE_FREE_LIMIT || 3);
const billingUrl = process.env.ASTRO_FATE_BILLING_URL || "https://billing.lifeyoume.icu/";
const registerUrl = process.env.ASTRO_FATE_REGISTER_URL || "https://auth.lifeyoume.icu/register?return_to=https%3A%2F%2Flifeyoume.icu%2Fastro-fate%2F";
const adminToken = process.env.ASTRO_FATE_ADMIN_TOKEN || "";
const analytics = new AnalyticsStore(dataPath);
await analytics.load();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function send(response, status, body, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers
  });
  response.end(typeof body === "string" ? body : JSON.stringify(body));
}

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseCookies(request) {
  return Object.fromEntries(String(request.headers.cookie || "").split(";").map((part) => {
    const [key, ...rest] = part.trim().split("=");
    return [key, decodeURIComponent(rest.join("=") || "")];
  }).filter(([key]) => key));
}

function visitorIdentity(request, response) {
  const cookies = parseCookies(request);
  const existing = cookies.astro_fate_vid;
  if (existing && /^[a-f0-9-]{20,64}$/i.test(existing)) return existing;
  const id = randomUUID();
  response.setHeader("set-cookie", `astro_fate_vid=${encodeURIComponent(id)}; Path=/astro-fate/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`);
  return id;
}

function userIdFromHeaders(request) {
  return String(request.headers["x-lifeyoume-user-id"] || "").trim();
}

function isAdminRequest(request) {
  const platformAdmin = String(request.headers["x-lifeyoume-admin-user"] || "").trim();
  if (platformAdmin) return true;
  const authorization = String(request.headers.authorization || "");
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  return Boolean(adminToken && secureEqual(token, adminToken));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 512 * 1024) throw Object.assign(new Error("request_too_large"), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("invalid_json"), { status: 400 });
  }
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") throw Object.assign(new Error("invalid_payload"), { status: 400 });
  let birthDate;
  let birthTime;
  try {
    birthDate = normalizeBirthDate(payload.birthDate);
  } catch {
    throw Object.assign(new Error("birth_date_required"), { status: 400 });
  }
  try {
    birthTime = normalizeBirthTime(payload.birthTime);
  } catch {
    throw Object.assign(new Error("invalid_birth_time"), { status: 400 });
  }
  return {
    name: String(payload.name || "").trim(),
    birthDate,
    birthTime: String(payload.birthTime || birthTime.time).trim() || birthTime.time,
    birthTimeInput: String(payload.birthTime || "").trim(),
    birthPlace: String(payload.birthPlace || "").trim(),
    latitude: Number.isFinite(Number(payload.latitude)) ? Number(payload.latitude) : null,
    longitude: Number.isFinite(Number(payload.longitude)) ? Number(payload.longitude) : 116.4,
    gender: String(payload.gender || "").trim(),
    relationshipGoal: String(payload.relationshipGoal || "").trim()
  };
}

function handleGeocode(url, response) {
  const query = String(url.searchParams.get("q") || "").trim();
  if (!query) {
    send(response, 400, { ok: false, error: "place_required" });
    return;
  }
  const matches = geocodePlace(query);
  send(response, 200, { ok: true, query, matches });
}

async function handleAnalyze(request, response) {
  const visitorId = visitorIdentity(request, response);
  const quota = analytics.quotaFor(visitorId, Number.isFinite(freeLimit) ? freeLimit : 3);
  const userId = userIdFromHeaders(request);
  if (!userId && quota.remaining <= 0) {
    send(response, 402, {
      ok: false,
      error: "free_quota_exhausted",
      message: "你的 3 次免费测算已用完。注册 LifeYouMe 账号后可继续开通完整测算。",
      quota,
      actions: {
        registerUrl,
        billingUrl,
        label: "注册 / 开通后继续测算"
      }
    });
    return;
  }
  const payload = validatePayload(await readJson(request));
  const fortune = buildFortune(payload);
  const professional = await buildProfessionalReading(fortune).catch((error) => ({
    enabled: true,
    source: "Numerologist_skills",
    available: false,
    ziwei: { available: false, reason: "engine_error" },
    qimen: { available: false, reason: "engine_error" },
    synthesis: { available: false, systems: ["星座", "轻量八字"], label: "基础测算", highlights: [] },
    errors: [{ engine: "professional", message: error.message }]
  }));
  const config = maasConfiguration();
  let modelReport = "";
  let model = { used: false, modelId: config?.modelId || "lym-chat-quality", error: null };
  if (config) {
    try {
      modelReport = await completeWithMaas(config, buildModelPrompt(fortune, professional));
      model = { used: true, modelId: config.modelId, error: null };
    } catch (error) {
      model = { used: false, modelId: config.modelId, error: error.message };
    }
  }
  const persisted = await analytics.recordAnalysis({
    visitorId,
    userId,
    input: payload,
    fortune,
    professional,
    source: model.used ? "maas" : "local-rules",
    model
  });
  send(response, 200, {
    ok: true,
    source: model.used ? "maas" : "local-rules",
    model,
    fortune,
    professional,
    quota: persisted.quota,
    recordId: persisted.record.id,
    report: modelReport || fallbackReport(fortune, professional)
  });
}

function fallbackReport(fortune, professional = null) {
  const { subject, astrology, bazi, compatibility, romance } = fortune;
  const lines = [
    `## ${subject.name}的星命矩阵`,
    "",
    `你的太阳星座是${astrology.sunSign.name}，上升星座近似为${astrology.ascendant.name}。这组组合让你一边保留${astrology.sunSign.traits.join("、")}的核心动力，一边以${astrology.ascendant.traits.join("、")}的方式进入关系。`,
    "",
    `八字轻量盘显示年柱为${bazi.pillars.year}，生肖${bazi.yearAnimal}，主气偏${bazi.dominantElement}，适合补足${bazi.supportiveElements.join("、")}能量。更匹配的星座包括：${compatibility.bestSigns.join("、")}；更有缘的属相包括：${compatibility.bestAnimals.join("、")}。`,
    "",
    `姻缘节奏上，你的桃花地支为${romance.peachBlossomBranch}，对应${romance.peachBlossomAnimal}。接下来值得留意的桃花年是：${romance.peachBlossomYears.join("、")}。`,
    "",
    `桃花方向偏${romance.direction}，可关注${romance.provinces.join("、")}相关的人、城市、项目或旅行机会。缘分不是“等来”的，更像在正确方向上提高遇见好人的概率。`
  ];
  if (professional?.available) {
    lines.push("", "## 专业合参");
    for (const item of professional.synthesis?.highlights || []) lines.push("", item);
  } else {
    lines.push("", "## 专业合参", "", "紫微斗数/奇门遁甲专业引擎当前未启用或缺少必要信息，本次先返回基础星座与八字规则报告。");
  }
  return lines.join("\n");
}

async function serveStatic(url, response) {
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const normalized = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicRoot, normalized);
  if (!filePath.startsWith(publicRoot)) {
    send(response, 403, { ok: false, error: "forbidden" });
    return;
  }
  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "content-type": MIME[extname(filePath)] || "application/octet-stream",
      "cache-control": "no-cache"
    });
    response.end(content);
  } catch {
    send(response, 404, { ok: false, error: "not_found" });
  }
}

export function createAppServer() {
  return createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        send(response, 200, { ok: true, maasConfigured: Boolean(maasConfiguration()) });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/starmap") {
        await analytics.load();
        send(response, 200, { ok: true, ...analytics.publicStats() });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/admin/stats") {
        if (!isAdminRequest(request)) {
          send(response, 401, { ok: false, error: "admin_authentication_required" });
          return;
        }
        await analytics.load();
        send(response, 200, { ok: true, ...analytics.adminStats() });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/geocode") {
        handleGeocode(url, response);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/analyze") {
        await handleAnalyze(request, response);
        return;
      }
      if (request.method === "GET" || request.method === "HEAD") {
        await serveStatic(url, response);
        return;
      }
      send(response, 405, { ok: false, error: "method_not_allowed" });
    } catch (error) {
      send(response, error.status || 500, { ok: false, error: error.message || "internal_error" });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createAppServer().listen(port, host, () => {
    console.log(`Astro Fate Matrix listening on http://${host}:${port}`);
  });
}
