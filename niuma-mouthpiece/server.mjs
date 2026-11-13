import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { diagnoseWithModel } from "./src/model-diagnosis.mjs";
import { UsageStore } from "./src/usage-store.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicRoot = join(root, "src");
const port = Number(process.env.PORT || 45410);
const host = process.env.HOST || "127.0.0.1";
const basePath = "/niuma";
const freeLimit = Number(process.env.NIUMA_FREE_LIMIT || 20);
const billingUrl = process.env.NIUMA_BILLING_URL || "https://billing.lifeyoume.icu/";
const dataPath = process.env.NIUMA_DATA_PATH || join(root, "data", "usage.json");
const adminToken = process.env.NIUMA_ADMIN_TOKEN || "";
const usage = new UsageStore(dataPath);
await usage.load();

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp"
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...headers
  });
  res.end(body);
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(JSON.stringify(body));
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").map((part) => {
    const [key, ...rest] = part.trim().split("=");
    return [key, decodeURIComponent(rest.join("=") || "")];
  }).filter(([key]) => key));
}

function visitorIdentity(req, res) {
  const existing = parseCookies(req).niuma_vid;
  if (existing && /^[a-f0-9-]{20,64}$/i.test(existing)) return existing;
  const visitorId = randomUUID();
  res.setHeader("Set-Cookie", `niuma_vid=${visitorId}; Path=${basePath}/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`);
  return visitorId;
}

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

function isAdminRequest(req) {
  const platformAdmin = String(req.headers["x-lifeyoume-admin-user"] || "").trim();
  if (platformAdmin) return true;
  const authorization = String(req.headers.authorization || "");
  return Boolean(adminToken && authorization.startsWith("Bearer ") && secureEqual(authorization.slice(7).trim(), adminToken));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) {
      throw Object.assign(new Error("request_too_large"), { status: 413 });
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("invalid_json"), { status: 400 });
  }
}

function sendFile(res, file) {
  const extension = extname(file);
  res.writeHead(200, {
    "Content-Type": types[extension] || "application/octet-stream",
    "Cache-Control": [".html", ".css", ".js", ".mjs"].includes(extension)
      ? "no-cache, must-revalidate"
      : "public, max-age=86400",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'"
    ].join("; ")
  });
  createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/health" || url.pathname === `${basePath}/health`) {
    return sendJson(res, 200, {
      status: "ok",
      service: "niuma-mouthpiece",
      version: "0.1.0",
      basePath,
      maasConfigured: Boolean(process.env.MAAS_SERVICE_KEY)
    });
  }

  if (req.method === "GET" && url.pathname === `${basePath}/api/quota`) {
    const visitorId = visitorIdentity(req, res);
    return sendJson(res, 200, { ok: true, quota: usage.quotaFor(visitorId, freeLimit) });
  }

  if (req.method === "GET" && url.pathname === `${basePath}/api/admin/stats`) {
    if (!isAdminRequest(req)) return sendJson(res, 401, { ok: false, error: "admin_authentication_required" });
    await usage.load();
    return sendJson(res, 200, { ok: true, freeLimit, ...usage.adminStats() });
  }

  if (req.method === "POST" && url.pathname === `${basePath}/api/diagnose`) {
    try {
      const visitorId = visitorIdentity(req, res);
      const quota = usage.quotaFor(visitorId, freeLimit);
      if (quota.remaining <= 0) {
        return sendJson(res, 402, {
          ok: false,
          error: "free_quota_exhausted",
          message: `你的 ${freeLimit} 次免费嘴替已用完。付费开通即将上线。`,
          quota,
          actions: { billingUrl, label: "查看开通方式" }
        });
      }
      const payload = await readJson(req);
      const text = String(payload.rage || payload.text || "").trim();
      if (!text) return sendJson(res, 400, { ok: false, error: "rage_required" });
      if (text.length > 220) return sendJson(res, 400, { ok: false, error: "rage_too_long" });
      const result = await diagnoseWithModel(text);
      const persisted = await usage.recordGeneration({
        visitorId,
        userId: String(req.headers["x-lifeyoume-user-id"] || "").trim(),
        source: result.source,
        model: result.model,
        freeLimit
      });
      return sendJson(res, 200, { ok: true, result, quota: persisted.quota });
    } catch (error) {
      return sendJson(res, error.status || 500, { ok: false, error: error.message || "internal_error" });
    }
  }

  if (url.pathname === basePath) {
    res.writeHead(308, { Location: `${basePath}/` });
    return res.end();
  }

  if (!url.pathname.startsWith(`${basePath}/`)) {
    return send(res, 404, "Not found");
  }

  let relative;
  try {
    relative = decodeURIComponent(url.pathname.slice(basePath.length + 1)) || "index.html";
  } catch {
    return send(res, 400, "Bad request");
  }

  relative = normalize(relative).replace(/^(\.\.(\/|\\|$))+/, "");
  if (relative === "." || relative.endsWith("/")) {
    relative = join(relative, "index.html");
  }

  const candidate = join(publicRoot, relative);
  if (!candidate.startsWith(publicRoot) || !existsSync(candidate) || !statSync(candidate).isFile()) {
    return send(res, 404, "Not found");
  }

  return sendFile(res, candidate);
});

server.listen(port, host, () => {
  console.log(`牛马嘴替 listening on http://${host}:${port}${basePath}/`);
});
