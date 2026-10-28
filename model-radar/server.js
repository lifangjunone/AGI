import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { ModelService } from "./lib/model-service.js";

const root = fileURLToPath(new URL("./public", import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const service = new ModelService({ historyPath: process.env.SNAPSHOT_PATH || null });
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};

function json(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function serveStatic(pathname, response) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  let target = join(root, safePath);
  try {
    if ((await stat(target)).isDirectory()) target = join(target, "index.html");
    const body = await readFile(target);
    response.writeHead(200, {
      "content-type": mime[extname(target)] || "application/octet-stream",
      "cache-control": target.endsWith(".html") ? "no-cache" : "public, max-age=3600"
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname === "/api/models" && request.method === "GET") {
    try {
      json(response, 200, await service.getSnapshot());
    } catch (error) {
      json(response, 503, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/api/refresh" && request.method === "POST") {
    try {
      json(response, 200, await service.getSnapshot({ force: true }));
    } catch (error) {
      json(response, 503, { error: error.message });
    }
    return;
  }
  if (url.pathname === "/health") {
    json(response, 200, { ok: true, updatedAt: service.snapshot?.updatedAt || null });
    return;
  }
  await serveStatic(decodeURIComponent(url.pathname), response);
});

service.getSnapshot().catch((error) => console.error("首次数据采集失败：", error.message));
const timer = setInterval(() => {
  service.refresh().catch((error) => console.error("定时数据采集失败：", error.message));
}, 60 * 60 * 1000);
timer.unref();

server.listen(port, host, () => {
  console.log(`LifeYouMe Model Radar: http://${host}:${port}`);
});
