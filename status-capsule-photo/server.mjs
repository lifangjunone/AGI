import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGeneration, publicTemplates } from "./src/generator.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicRoot = join(root, "src");
const port = Number(process.env.PORT || 45620);
const host = process.env.HOST || "127.0.0.1";
const basePath = (process.env.BASE_PATH || "/status-capsule").replace(/\/$/, "");
const version = "0.1.0";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
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

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) {
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
      : file.includes("-v1.webp") ? "public, max-age=31536000, immutable"
      : "public, max-age=86400",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
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
  const stream = createReadStream(file);
  stream.on("error", () => {
    if (!res.headersSent) {
      send(res, 500, "Unable to read asset");
    } else {
      res.destroy();
    }
  });
  stream.pipe(res);
}

function staticCandidate(pathname) {
  let relative;
  try {
    relative = decodeURIComponent(pathname.slice(basePath.length + 1)) || "index.html";
  } catch {
    return null;
  }
  relative = normalize(relative).replace(/^(\.\.(\/|\\|$))+/, "");
  if (relative === "." || relative.endsWith("/")) {
    relative = join(relative, "index.html");
  }
  const candidate = join(publicRoot, relative);
  if (!candidate.startsWith(publicRoot) || !existsSync(candidate) || !statSync(candidate).isFile()) {
    return null;
  }
  return candidate;
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/health" || url.pathname === `${basePath}/health`) {
      return sendJson(res, 200, {
        status: "ok",
        service: "status-capsule-photo",
        version,
        basePath,
        imageProviderConfigured: Boolean(process.env.IMAGE_PROVIDER)
      });
    }

    if (url.pathname === basePath) {
      res.writeHead(308, { Location: `${basePath}/` });
      return res.end();
    }

    if (req.method === "GET" && url.pathname === `${basePath}/api/templates`) {
      return sendJson(res, 200, { ok: true, templates: publicTemplates() });
    }

    if (req.method === "POST" && url.pathname === `${basePath}/api/generate`) {
      try {
        const payload = await readJson(req);
        return sendJson(res, 200, await buildGeneration(payload));
      } catch (error) {
        return sendJson(res, error.status || 500, { ok: false, error: error.message || "internal_error" });
      }
    }

    if (!url.pathname.startsWith(`${basePath}/`)) {
      return send(res, 404, "Not found");
    }

    const candidate = staticCandidate(url.pathname);
    if (!candidate) return send(res, 404, "Not found");
    return sendFile(res, candidate);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().listen(port, host, () => {
    console.log(`状态盲盒照片生成 listening on http://${host}:${port}${basePath}/`);
  });
}
