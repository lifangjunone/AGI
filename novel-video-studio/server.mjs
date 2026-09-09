import { createReadStream } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, makeConfig } from "./lib/config.mjs";
import { ProductionPipeline } from "./lib/pipeline.mjs";
import { ProjectStore } from "./lib/store.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
await loadEnv(ROOT);
const config = makeConfig(ROOT);
const store = new ProjectStore(config.dataDirectory);
const pipeline = new ProductionPipeline(config, store);
const PUBLIC = path.join(ROOT, "public");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

function projectSummary(project) {
  const shots = project.episodes?.flatMap((episode) => episode.shots || []) || [];
  const displayedSource = project.source
    || project.sources?.find((source) => source.id === project.suggestedSourceId);
  return {
    id: project.id,
    novelName: project.novelName,
    status: project.status,
    stage: project.stage,
    progress: project.progress,
    mode: project.mode,
    queuePosition: project.queuePosition,
    estimatedWaitMinutes: project.estimatedWaitMinutes,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    queuedAt: project.queuedAt,
    startedAt: project.startedAt,
    completedAt: project.completedAt,
    sourceTitle: displayedSource?.title || null,
    sourceConfirmed: Boolean(project.sourceConfirmed),
    episodeCount: project.episodes?.length || 0,
    shotCount: shots.length,
    completedShots: shots.filter((shot) => shot.status === "succeeded").length,
    error: project.error
  };
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 128 * 1024) throw new Error("请求不能超过 128 KB");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new Error("请求不是有效 JSON");
  }
}

async function commandExists(command) {
  const candidates = [
    command,
    ...(process.env.PATH || "").split(path.delimiter).map((directory) => path.join(directory, command)),
    `/opt/homebrew/bin/${command}`,
    `/usr/local/bin/${command}`,
    `/Users/bytedance/Desktop/projects/.tools/homebrew/bin/${command}`
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return true;
    } catch {
      // Try next path.
    }
  }
  return false;
}

async function serveStatic(response, pathname) {
  const entrypoints = new Set(["/", "/web", "/web/", "/mobile", "/mobile/", "/desktop", "/desktop/"]);
  const requested = entrypoints.has(pathname) ? "index.html" : pathname.replace(/^\/+/, "");
  const file = path.resolve(PUBLIC, requested);
  if (!file.startsWith(`${PUBLIC}${path.sep}`) && file !== path.join(PUBLIC, "index.html")) return false;
  try {
    const fileStat = await stat(file);
    if (!fileStat.isFile()) return false;
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(file)] || "application/octet-stream",
      "Content-Length": fileStat.size,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff"
    });
    createReadStream(file).pipe(response);
    return true;
  } catch {
    return false;
  }
}

async function serveMedia(request, response, pathname) {
  const relative = pathname.replace(/^\/media\/+/, "");
  const file = path.resolve(config.dataDirectory, relative);
  if (!file.startsWith(`${path.resolve(config.dataDirectory)}${path.sep}`)) return false;
  try {
    const fileStat = await stat(file);
    if (!fileStat.isFile()) return false;
    const range = request.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) return false;
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), fileStat.size - 1) : fileStat.size - 1;
      response.writeHead(206, {
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${fileStat.size}`,
        "Content-Type": MIME_TYPES[path.extname(file)] || "video/mp4"
      });
      createReadStream(file, { start, end }).pipe(response);
      return true;
    }
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(file)] || "application/octet-stream",
      "Content-Length": fileStat.size,
      "Cache-Control": "private, max-age=3600"
    });
    createReadStream(file).pipe(response);
    return true;
  } catch {
    return false;
  }
}

export const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (request.method === "GET" && url.pathname === "/api/status") {
      const [ffmpegReady, ffprobeReady, queue] = await Promise.all([
        commandExists(config.ffmpeg),
        commandExists(config.ffprobe),
        pipeline.queueSnapshot()
      ]);
      sendJson(response, 200, {
        mode: config.mode,
        arkConfigured: Boolean(config.ark.apiKey),
        modelsConfigured: {
          text: Boolean(config.ark.planningModel || config.ark.textModel),
          image: Boolean(config.ark.imageModel),
          video: Boolean(config.ark.videoModel)
        },
        models: {
          planning: config.ark.planningModel || config.ark.textModel,
          image: config.ark.imageModel,
          video: config.ark.videoModel
        },
        ffmpegReady: ffmpegReady && ffprobeReady,
        production: config.production,
        queue,
        billableGenerationEnabled: process.env.ALLOW_BILLABLE_GENERATION === "true"
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/projects") {
      const projects = await store.list();
      sendJson(response, 200, {
        projects: url.searchParams.get("full") === "true" ? projects : projects.map(projectSummary)
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/queue") {
      sendJson(response, 200, { queue: await pipeline.queueSnapshot() });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/generated-image") {
      const source = new URL(url.searchParams.get("source") || "");
      if (source.protocol !== "https:" || source.hostname !== "copilot-cn.bytedance.net") {
        sendJson(response, 400, { error: "不允许代理该图片来源" });
        return;
      }
      const upstream = await fetch(source, { signal: AbortSignal.timeout(120000) });
      if (!upstream.ok) throw new Error(`图片服务返回 ${upstream.status}`);
      const contentType = upstream.headers.get("content-type") || "image/jpeg";
      if (!contentType.startsWith("image/")) throw new Error("图片服务返回了无效内容");
      const body = Buffer.from(await upstream.arrayBuffer());
      response.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": body.length,
        "Cache-Control": "no-store"
      });
      response.end(body);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/projects") {
      const body = await readJson(request);
      sendJson(response, 202, { project: await pipeline.create(body.novelName) });
      return;
    }

    const projectMatch = /^\/api\/projects\/([^/]+)(?:\/(retry|source|export|manifest))?$/.exec(url.pathname);
    if (request.method === "GET" && projectMatch && !projectMatch[2]) {
      const project = await store.get(projectMatch[1]);
      sendJson(response, project ? 200 : 404, project ? { project } : { error: "项目不存在" });
      return;
    }

    if (request.method === "POST" && projectMatch?.[2] === "retry") {
      const project = await store.get(projectMatch[1]);
      if (!project) {
        sendJson(response, 404, { error: "项目不存在" });
        return;
      }
      if (!["failed", "rights-review", "budget-gate"].includes(project.status)) {
        sendJson(response, 409, { error: "只有失败或暂停的任务可以重试" });
        return;
      }
      sendJson(response, 202, { accepted: true, project: await pipeline.enqueue(projectMatch[1], { message: "任务已重新进入生产队列" }) });
      return;
    }

    if (request.method === "POST" && projectMatch?.[2] === "source") {
      const body = await readJson(request);
      sendJson(response, 202, {
        accepted: true,
        project: await pipeline.confirmSource(projectMatch[1], body.sourceId)
      });
      return;
    }

    if (request.method === "POST" && projectMatch?.[2] === "export") {
      await pipeline.exportManifest(projectMatch[1]);
      sendJson(response, 200, { downloadUrl: `/api/projects/${projectMatch[1]}/manifest` });
      return;
    }

    if (request.method === "GET" && projectMatch?.[2] === "manifest") {
      const project = await store.get(projectMatch[1]);
      if (!project) {
        sendJson(response, 404, { error: "项目不存在" });
        return;
      }
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="production-manifest-${project.id}.json"`,
        "Cache-Control": "no-store"
      });
      response.end(`${JSON.stringify(project, null, 2)}\n`);
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/media/") && await serveMedia(request, response, url.pathname)) return;
    if (request.method === "GET" && await serveStatic(response, url.pathname)) return;
    sendJson(response, 404, { error: "资源不存在" });
  } catch (error) {
    sendJson(response, /不存在/.test(error.message) ? 404 : 400, { error: error.message });
  }
});

const reconciliationTimer = setInterval(async () => {
  if (config.mode !== "live") return;
  const rendering = (await store.list()).filter((project) => project.status === "rendering");
  await Promise.all(rendering.map((project) => pipeline.reconcile(project.id)));
}, 15000);
reconciliationTimer.unref();

export async function startServer({
  host = process.env.HOST || "127.0.0.1",
  port = config.port,
  quiet = false
} = {}) {
  await pipeline.resume();
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      const address = server.address();
      const instance = { server, host, port: address.port };
      if (!quiet) process.stdout.write(`Novel Video Studio listening on http://${host}:${address.port}\n`);
      resolve(instance);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await startServer();
}
