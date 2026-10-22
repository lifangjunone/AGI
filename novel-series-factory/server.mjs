import http from "node:http";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectEnv } from "./lib/env.mjs";
import { createModelHealthMonitor } from "./lib/model-config.mjs";
import { createMvpPipeline } from "./lib/mvp-pipeline.mjs";
import { createHermesAgentLoop } from "./lib/hermes-agent-loop.mjs";

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4360);
const projectRoot = fileURLToPath(new URL("./", import.meta.url)).replace(/\/$/, "");
const publicDir = join(projectRoot, "public");
const basePath = normalizeBasePath(process.env.NSF_BASE_PATH);
const requireUserHeader = process.env.NSF_REQUIRE_USER_HEADER === "true";
const baseDataDir = process.env.NSF_DATA_DIR || join(projectRoot, "data");
const env = await loadProjectEnv(process.env.NSF_CONFIG_DIR || projectRoot);
const modelHealth = createModelHealthMonitor(projectRoot, env);
await modelHealth.refresh();
const runtimeStorage = new AsyncLocalStorage();
const runtimePromises = new Map();

async function createRuntime(dataDir) {
  const runtimePipeline = createMvpPipeline({
    dataDir,
    env: { ...env, NSF_BASE_PATH: basePath },
    services: {
      semanticQualityOperational: () => modelHealth.isOperational("ark_multimodal"),
    },
  });
  await runtimePipeline.initialize();
  return {
    pipeline: runtimePipeline,
    hermesAgent: createHermesAgentLoop({ pipeline: runtimePipeline, dataDir, env }),
  };
}

function runtimeFor(userId = "") {
  const tenant = userId
    ? createHash("sha256").update(userId).digest("hex").slice(0, 32)
    : "desktop";
  if (!runtimePromises.has(tenant)) {
    const dataDir = requireUserHeader ? join(baseDataDir, "users", tenant) : baseDataDir;
    runtimePromises.set(tenant, createRuntime(dataDir).catch(error => {
      runtimePromises.delete(tenant);
      throw error;
    }));
  }
  return runtimePromises.get(tenant);
}

function runtimeProxy(key) {
  return new Proxy({}, {
    get(_target, property) {
      const runtime = runtimeStorage.getStore();
      if (!runtime) throw new Error("Request runtime is unavailable");
      const value = runtime[key][property];
      return typeof value === "function" ? value.bind(runtime[key]) : value;
    },
  });
}

const pipeline = runtimeProxy("pipeline");
const hermesAgent = runtimeProxy("hermesAgent");
if (!requireUserHeader) await runtimeFor();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
  ".srt": "application/x-subrip; charset=utf-8",
  ".zip": "application/zip",
};

const server = http.createServer(async (request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    response.writeHead(400).end("Invalid URL");
    return;
  }
  if (basePath && pathname === basePath) {
    response.writeHead(308, { Location: `${basePath}/` }).end();
    return;
  }
  if (basePath) {
    if (!pathname.startsWith(`${basePath}/`)) {
      response.writeHead(404).end("Not Found");
      return;
    }
    pathname = pathname.slice(basePath.length) || "/";
  }
  if (pathname === "/api/health" || pathname === "/healthz") {
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify({
      ok: true,
      service: "story-studio",
      releaseChannel: "commercial_beta",
      basePath: basePath || "/",
    }));
    return;
  }
  if (process.env.NSF_DESKTOP_TOKEN && request.headers["x-desktop-token"] !== process.env.NSF_DESKTOP_TOKEN) {
    response.writeHead(403).end("Desktop session required");
    return;
  }
  const userId = String(request.headers["x-lifeyoume-user-id"] || "").trim();
  if (requireUserHeader && (!userId || userId.length > 512)) {
    response.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "需要通过 LifeYouMe 登录后访问" }));
    return;
  }
  if (request.method === "POST" && request.headers.origin &&
      request.headers.origin !==
        `${request.headers["x-forwarded-proto"] || "http"}://${request.headers.host}`) {
    response.writeHead(403).end("Origin not allowed");
    return;
  }
  let runtime;
  try {
    runtime = await runtimeFor(userId);
  } catch (error) {
    console.error("Tenant runtime initialization failed", error);
    response.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "工作空间初始化失败" }));
    return;
  }
  await runtimeStorage.run(runtime, async () => {
  if (pathname === "/api/projects" && request.method === "GET") {
    try {
      const projects = (await pipeline.list()).map(({ dir, input, story, ...project }) => project);
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ projects }));
    } catch {
      response.writeHead(500).end('{"error":"无法读取项目列表"}');
    }
    return;
  }
  const retryMatch = pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/retry$/);
  if (retryMatch && request.method === "POST") {
    try {
      const project = await pipeline.retry(retryMatch[1]);
      response.writeHead(202, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id: project.id }));
    } catch (error) {
      response.writeHead(409, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  if (pathname === "/api/plans" && request.method === "POST") {
    try {
      const input = await readJson(request);
      const project = await pipeline.createPlan(input);
      response.writeHead(201, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id: project.id }));
    } catch (error) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  const sampleMatch = pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/sample$/);
  if (sampleMatch && request.method === "POST") {
    try {
      const project = await pipeline.startSample(sampleMatch[1]);
      response.writeHead(202, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id: project.id }));
    } catch (error) {
      response.writeHead(409, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  const realVideoMatch = pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/real-video$/);
  if (realVideoMatch && request.method === "POST") {
    try {
      const options = await readJson(request);
      const project = await pipeline.startRealVideo(realVideoMatch[1], options);
      response.writeHead(202, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id: project.id }));
    } catch (error) {
      response.writeHead(409, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  const seriesProductionMatch = pathname.match(
    /^\/api\/projects\/([0-9a-f-]{36})\/production\/start$/,
  );
  if (seriesProductionMatch && request.method === "POST") {
    try {
      const options = await readJson(request);
      const project = await pipeline.startSeriesProduction(seriesProductionMatch[1], options);
      response.writeHead(202, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        id: project.id,
        productionRun: project.productionRun,
      }));
    } catch (error) {
      response.writeHead(409, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  const productionPreflightMatch = pathname.match(
    /^\/api\/projects\/([0-9a-f-]{36})\/production\/preflight$/,
  );
  if (productionPreflightMatch && request.method === "GET") {
    try {
      const preflight = await pipeline.productionPreflight(productionPreflightMatch[1]);
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(JSON.stringify({ preflight }));
    } catch (error) {
      response.writeHead(409, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  const productionControlMatch = pathname.match(
    /^\/api\/projects\/([0-9a-f-]{36})\/production\/(pause|stop)$/,
  );
  if (productionControlMatch && request.method === "POST") {
    try {
      const project = await pipeline.controlSeriesProduction(
        productionControlMatch[1], productionControlMatch[2],
      );
      response.writeHead(202, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ id: project.id, productionRun: project.productionRun }));
    } catch (error) {
      response.writeHead(409, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  const episodeGenerateMatch = pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/episodes\/(\d+)\/generate$/);
  if (episodeGenerateMatch && request.method === "POST") {
    try {
      const project = await pipeline.startEpisode(episodeGenerateMatch[1], Number(episodeGenerateMatch[2]));
      response.writeHead(202, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id: project.id, episodeNumber: Number(episodeGenerateMatch[2]) }));
    } catch (error) {
      response.writeHead(409, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  const episodeContinuityMatch = pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/episodes\/(\d+)\/continuity$/);
  if (episodeContinuityMatch && request.method === "POST") {
    try {
      const changes = await readJson(request);
      const project = await pipeline.updateEpisodeContinuity(
        episodeContinuityMatch[1], Number(episodeContinuityMatch[2]), changes,
      );
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        id: project.id,
        continuityLedger: project.continuityLedger,
      }));
    } catch (error) {
      response.writeHead(409, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  const episodeRevalidateMatch = pathname.match(
    /^\/api\/projects\/([0-9a-f-]{36})\/episodes\/(\d+)\/revalidate$/,
  );
  if (episodeRevalidateMatch && request.method === "POST") {
    try {
      const result = await pipeline.revalidateEpisode(
        episodeRevalidateMatch[1], Number(episodeRevalidateMatch[2]),
      );
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        id: result.project.id,
        episode: result.asset,
        qualityReport: result.asset.qualityReport,
      }));
    } catch (error) {
      response.writeHead(409, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  const episodeRepairMatch = pathname.match(
    /^\/api\/projects\/([0-9a-f-]{36})\/episodes\/(\d+)\/repair-media$/,
  );
  if (episodeRepairMatch && request.method === "POST") {
    try {
      const result = await pipeline.repairEpisodeMedia(
        episodeRepairMatch[1], Number(episodeRepairMatch[2]),
      );
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        id: result.project.id,
        episode: result.asset,
        qualityReport: result.asset.qualityReport,
        billableVideoGeneration: false,
      }));
    } catch (error) {
      response.writeHead(409, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  const productionBibleMatch = pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/production-bible$/);
  if (productionBibleMatch && request.method === "POST") {
    try {
      const changes = await readJson(request);
      const project = await pipeline.updateProductionBible(productionBibleMatch[1], changes);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id: project.id, productionBible: project.productionBible }));
    } catch (error) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  const bibleAnalyzeMatch = pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/production-bible\/analyze$/);
  if (bibleAnalyzeMatch && request.method === "POST") {
    try {
      const project = await pipeline.analyzeBible(bibleAnalyzeMatch[1]);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id: project.id, productionBible: project.productionBible }));
    } catch (error) {
      response.writeHead(502, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  const prepareAssetsMatch = pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/production-assets\/prepare$/);
  if (prepareAssetsMatch && request.method === "POST") {
    try {
      const project = await pipeline.prepareProductionAssets(prepareAssetsMatch[1]);
      response.writeHead(202, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        id: project.id,
        accepted: true,
        assetPreparation: project.assetPreparation,
      }));
    } catch (error) {
      response.writeHead(502, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  const applyFormatMatch = pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/format-recommendation\/apply$/);
  if (applyFormatMatch && request.method === "POST") {
    try {
      const project = await pipeline.applyFormatRecommendation(applyFormatMatch[1]);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        id: project.id,
        specification: project.specification,
        seriesPlan: project.seriesPlan,
      }));
    } catch (error) {
      response.writeHead(409, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  const versionsMatch = pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/versions$/);
  if (versionsMatch && request.method === "GET") {
    try {
      const versions = await pipeline.listVersions(versionsMatch[1]);
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(JSON.stringify({ versions }));
    } catch (error) {
      response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  const deliveryMatch = pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/delivery-package$/);
  if (deliveryMatch && request.method === "POST") {
    try {
      const project = await pipeline.createDeliveryPackage(deliveryMatch[1]);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ id: project.id, delivery: project.delivery }));
    } catch (error) {
      response.writeHead(409, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  const restoreVersionMatch = pathname.match(
    /^\/api\/projects\/([0-9a-f-]{36})\/versions\/([0-9a-f-]{36})\/restore$/,
  );
  if (restoreVersionMatch && request.method === "POST") {
    try {
      const project = await pipeline.restoreVersion(restoreVersionMatch[1], restoreVersionMatch[2]);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ id: project.id, restoredVersion: project.restoredVersion }));
    } catch (error) {
      response.writeHead(409, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  const bibleAssetMatch = pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/production-bible\/(character|scene|prop)\/([a-z0-9-]+)\/generate$/);
  if (bibleAssetMatch && request.method === "POST") {
    try {
      const project = await pipeline.generateBibleAsset(bibleAssetMatch[1], bibleAssetMatch[2], bibleAssetMatch[3]);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id: project.id, productionBible: project.productionBible }));
    } catch (error) {
      response.writeHead(502, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  const assembleMatch = pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/assemble$/);
  if (assembleMatch && request.method === "POST") {
    try {
      const project = await pipeline.assembleSeries(assembleMatch[1]);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ id: project.id, assembly: project.assembly }));
    } catch (error) {
      response.writeHead(409, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  const agentMessageMatch = pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/agent\/messages$/);
  if (agentMessageMatch && request.method === "POST") {
    try {
      const input = await readJson(request);
      const session = await hermesAgent.message(agentMessageMatch[1], input.message);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ session }));
    } catch (error) {
      response.writeHead(409, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  const agentSessionMatch = pathname.match(
    /^\/api\/projects\/([0-9a-f-]{36})\/agent\/sessions\/([0-9a-f-]{36})$/,
  );
  if (agentSessionMatch && request.method === "GET") {
    try {
      const session = await hermesAgent.read(agentSessionMatch[1], agentSessionMatch[2]);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ session }));
    } catch {
      response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "Agent 会话不存在" }));
    }
    return;
  }
  const agentDecisionMatch = pathname.match(
    /^\/api\/projects\/([0-9a-f-]{36})\/agent\/sessions\/([0-9a-f-]{36})\/(approve|cancel)$/,
  );
  if (agentDecisionMatch && request.method === "POST") {
    try {
      const input = await readJson(request);
      const session = agentDecisionMatch[3] === "approve"
        ? await hermesAgent.approve(agentDecisionMatch[1], agentDecisionMatch[2], input.approvalToken)
        : await hermesAgent.cancel(agentDecisionMatch[1], agentDecisionMatch[2]);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ session }));
    } catch (error) {
      response.writeHead(409, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  if (pathname === "/api/projects" && request.method === "POST") {
    try {
      let body = "";
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 1_000_000) throw new Error("请求内容超过 1 MB");
      }
      const input = JSON.parse(body || "{}");
      const project = await pipeline.create(input);
      pipeline.enqueue(project);
      response.writeHead(202, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ id: project.id, status: project.status }));
    } catch (error) {
      response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  const projectMatch = pathname.match(/^\/api\/projects\/([0-9a-f-]{36})$/);
  if (projectMatch && request.method === "GET") {
    try {
      const project = await pipeline.read(projectMatch[1]);
      delete project.dir;
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(JSON.stringify(project));
    } catch {
      response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "项目不存在" }));
    }
    return;
  }

  const assetMatch = pathname.match(/^\/api\/projects\/([0-9a-f-]{36})\/assets\/([a-zA-Z0-9._-]+)$/);
  if (assetMatch && (request.method === "GET" || request.method === "HEAD")) {
    const assetPath = pipeline.assetPath(assetMatch[1], assetMatch[2]);
    try {
      const info = await stat(assetPath);
      if (!info.isFile()) throw new Error("Not a file");
      let start = 0;
      let end = info.size - 1;
      const range = request.headers.range;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (match && (match[1] || match[2])) {
          if (!match[1]) start = Math.max(0, info.size - Number(match[2]));
          else {
            start = Number(match[1]);
            if (match[2]) end = Math.min(end, Number(match[2]));
          }
        }
        if (!match || (!match[1] && !match[2]) || start > end || start >= info.size) {
          response.writeHead(416, { "Content-Range": `bytes */${info.size}` }).end();
          return;
        }
      }
      response.writeHead(range ? 206 : 200, {
        "Content-Type": mimeTypes[extname(assetPath)] || "application/octet-stream",
        "Content-Length": end - start + 1,
        "Accept-Ranges": "bytes",
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${info.size}` } : {}),
        "Content-Disposition": `inline; filename="${assetMatch[2]}"`,
        "Cache-Control": "no-store",
      });
      if (request.method === "HEAD") response.end();
      else {
        const stream = createReadStream(assetPath, { start, end });
        stream.on("error", () => response.destroy());
        response.on("close", () => stream.destroy());
        stream.pipe(response);
      }
    } catch {
      response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "产物不存在" }));
    }
    return;
  }

  if (pathname === "/api/models/status") {
    const force = new URL(request.url, "http://localhost").searchParams.get("refresh") === "1";
    const modelConfig = force
      ? await modelHealth.refresh({ force: true })
      : await modelHealth.snapshot();
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify(modelConfig));
    return;
  }

  if (pathname === "/api/status") {
    const modelConfig = await modelHealth.snapshot();
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(
      JSON.stringify({
        service: "novel-series-factory",
        releaseChannel: "commercial_beta",
        models: modelConfig.summary,
        billableGenerationEnabled: modelConfig.billableGenerationEnabled,
      }),
    );
    return;
  }

  // Commercial Beta has one authoritative UI. Keep the legacy prototype
  // unreachable from both the root URL and old bookmarks.
  const route = pathname === "/" || pathname === "/index.html"
    ? "/studio.html"
    : pathname;
  const filePath = normalize(join(publicDir, route));

  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("Not a file");
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not Found");
  }
  });
});

server.listen(port, host, () => {
  const url = `http://${host}:${server.address().port}`;
  console.log(`Novel Series Factory: ${url}`);
  process.parentPort?.postMessage({ type: "ready", url });
});
server.on("error", error => {
  console.error("Server startup failed", error.code);
  process.exit(1);
});

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 12_000_000) throw new Error("请求过大（最多 12 MB）");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function normalizeBasePath(value) {
  const input = String(value || "").trim();
  if (!input || input === "/") return "";
  return `/${input.replace(/^\/+|\/+$/g, "")}`;
}
