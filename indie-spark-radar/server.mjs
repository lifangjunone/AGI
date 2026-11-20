import http from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createProjectInsight, rankProjects } from "./src/insight-engine.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicRoot = join(root, "public");
const projects = JSON.parse(readFileSync(join(root, "data", "projects.json"), "utf8"));

const port = Number(process.env.PORT || 45520);
const host = process.env.HOST || "127.0.0.1";
const basePath = (process.env.BASE_PATH || "/indie-spark").replace(/\/$/, "");
const version = "0.1.0";

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

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32 * 1024) throw Object.assign(new Error("request_too_large"), { status: 413 });
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
      "img-src 'self' data:",
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

function categories() {
  return [...new Set(projects.map((project) => project.category))].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/health" || url.pathname === `${basePath}/health`) {
      return sendJson(res, 200, {
        status: "ok",
        service: "indie-spark-radar",
        version,
        basePath,
        maasConfigured: Boolean(process.env.MAAS_SERVICE_KEY)
      });
    }

    if (req.method === "GET" && url.pathname === `${basePath}/api/projects`) {
      return sendJson(res, 200, {
        ok: true,
        categories: categories(),
        projects: rankProjects(projects, {
          query: url.searchParams.get("q") || "",
          category: url.searchParams.get("category") || ""
        })
      });
    }

    if (req.method === "POST" && url.pathname === `${basePath}/api/insight`) {
      try {
        const payload = await readJson(req);
        const id = String(payload.id || "").trim();
        const userAngle = String(payload.userAngle || "").trim().slice(0, 160);
        const project = projects.find((candidate) => candidate.id === id);
        if (!project) return sendJson(res, 404, { ok: false, error: "project_not_found" });
        const insight = await createProjectInsight(project, { userAngle });
        return sendJson(res, 200, { ok: true, project, insight });
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
    if (relative === "." || relative.endsWith("/")) relative = join(relative, "index.html");
    const candidate = join(publicRoot, relative);
    if (!candidate.startsWith(publicRoot) || !existsSync(candidate) || !statSync(candidate).isFile()) {
      return send(res, 404, "Not found");
    }
    return sendFile(res, candidate);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().listen(port, host, () => {
    console.log(`Indie Spark Radar listening on http://${host}:${port}${basePath}/`);
  });
}
