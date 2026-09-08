import { createReadStream } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateVideo, listVideos } from "./lib/video-service.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIRECTORY = path.join(ROOT, "public");
const DATA_DIRECTORY = path.join(ROOT, "data");

async function loadEnv(filePath) {
  try {
    const content = await readFile(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 1) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

await loadEnv(path.join(ROOT, ".env"));
await loadEnv(path.join(ROOT, ".env.local"));

const config = {
  apiUrl: process.env.VIDEO_API_URL || "http://127.0.0.1:32280/api/v3/chat/completions",
  apiKey: process.env.VIDEO_API_KEY || "",
  modelId: process.env.VIDEO_MODEL_ID || ""
};
const port = Number(process.env.PORT || 4317);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error("请求内容不能超过 64 KB");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("请求内容不是有效 JSON");
  }
}

async function commandExists(command) {
  const paths = (process.env.PATH || "").split(path.delimiter);
  for (const directory of paths) {
    try {
      await access(path.join(directory, command));
      return true;
    } catch {
      // Continue searching PATH.
    }
  }
  return false;
}

async function serveFile(request, response, filePath) {
  const fileStat = await stat(filePath);
  const contentType = mimeTypes[path.extname(filePath)] || "application/octet-stream";
  const range = request.headers.range;

  if (range && contentType === "video/mp4") {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      response.writeHead(416, { "Content-Range": `bytes */${fileStat.size}` });
      response.end();
      return;
    }
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), fileStat.size - 1) : fileStat.size - 1;
    if (start > end || start >= fileStat.size) {
      response.writeHead(416, { "Content-Range": `bytes */${fileStat.size}` });
      response.end();
      return;
    }
    response.writeHead(206, {
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${fileStat.size}`,
      "Content-Type": contentType
    });
    createReadStream(filePath, { start, end }).pipe(response);
    return;
  }

  response.writeHead(200, {
    "Content-Length": fileStat.size,
    "Content-Type": contentType,
    "Cache-Control": contentType === "video/mp4" ? "private, max-age=3600" : "no-cache"
  });
  createReadStream(filePath).pipe(response);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  try {
    if (request.method === "GET" && url.pathname === "/api/status") {
      const [ffmpegReady, ffprobeReady] = await Promise.all([
        commandExists("ffmpeg"),
        commandExists("ffprobe")
      ]);
      sendJson(response, 200, {
        ready: Boolean(config.apiKey && config.modelId && ffmpegReady && ffprobeReady),
        modelConfigured: Boolean(config.apiKey && config.modelId),
        ffmpegReady,
        model: config.modelId || null
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/videos") {
      sendJson(response, 200, { videos: await listVideos(DATA_DIRECTORY) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/generate") {
      if (!config.apiKey || !config.modelId) {
        sendJson(response, 503, { error: "模型尚未配置，请检查 .env.local" });
        return;
      }
      const input = await readJson(request);
      const video = await generateVideo({
        input,
        config,
        dataDirectory: DATA_DIRECTORY,
        signal: AbortSignal.timeout(20 * 60 * 1000)
      });
      sendJson(response, 201, { video });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/videos/")) {
      const fileName = path.basename(url.pathname);
      if (!/^[a-f0-9-]+\.mp4$/.test(fileName)) throw Object.assign(new Error(), { code: "ENOENT" });
      await serveFile(request, response, path.join(DATA_DIRECTORY, "videos", fileName));
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      const requestedPath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const filePath = path.resolve(PUBLIC_DIRECTORY, requestedPath);
      if (!filePath.startsWith(`${PUBLIC_DIRECTORY}${path.sep}`)) {
        sendJson(response, 403, { error: "禁止访问" });
        return;
      }
      await serveFile(request, response, filePath);
      return;
    }

    sendJson(response, 404, { error: "未找到该接口" });
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(response, 404, { error: "未找到资源" });
      return;
    }
    console.error(`[${new Date().toISOString()}]`, error);
    sendJson(response, 500, { error: error.message || "服务内部错误" });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Frame/60 Studio running at http://127.0.0.1:${port}`);
});
