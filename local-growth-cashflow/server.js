const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { publicConfig } = require("./config");
const { checkProvider, generateDeliverables } = require("./ai-service");

const root = path.join(__dirname, "public");
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(body));
}

async function readJson(req, maxBytes = 32 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > maxBytes) {
        const error = new Error("请求内容过大");
        error.statusCode = 413;
        reject(error);
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        const error = new Error("请求 JSON 格式无效");
        error.statusCode = 400;
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function handleApi(req, res, urlPath) {
  if (req.method === "GET" && urlPath === "/api/config") {
    return json(res, 200, publicConfig());
  }

  if (req.method === "GET" && urlPath === "/api/health/ai") {
    const results = await Promise.all([checkProvider("ark"), checkProvider("fallback")]);
    return json(res, results.some((result) => result.ok) ? 200 : 503, {
      ok: results.some((result) => result.ok),
      providers: results,
    });
  }

  if (req.method === "POST" && urlPath === "/api/generate") {
    try {
      const input = await readJson(req);
      const result = await generateDeliverables(input);
      return json(res, 200, { ok: true, ...result });
    } catch (error) {
      return json(res, error.statusCode || 500, {
        ok: false,
        error: error.message || "生成失败",
        attempts: error.attempts || undefined,
      });
    }
  }

  return json(res, 404, { ok: false, error: "API not found" });
}

async function handler(req, res) {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath.startsWith("/api/")) return handleApi(req, res, urlPath);

  if (req.method !== "GET" && req.method !== "HEAD") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }
  const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const file = path.resolve(root, relative);

  if (!file.startsWith(`${root}${path.sep}`) && file !== path.join(root, "index.html")) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(file, (error, content) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500);
      return res.end(error.code === "ENOENT" ? "Not found" : "Server error");
    }
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(content);
  });
}

if (require.main === module) {
  const preferredPort = Number(process.env.PORT || 4173);
  const server = http.createServer(handler);
  let port = preferredPort;

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && !process.env.PORT && port < preferredPort + 20) {
      port += 1;
      server.listen(port, "127.0.0.1");
      return;
    }
    throw error;
  });

  server.on("listening", () => {
    console.log(`本地增长现金流工作台：http://127.0.0.1:${port}`);
  });

  server.listen(port, "127.0.0.1");
}

module.exports = { handler };
