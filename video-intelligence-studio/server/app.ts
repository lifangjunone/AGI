import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import neo4j, { Driver } from "neo4j-driver";
import { analyzeVideo, AnalysisResult, StoryNode, StoryRelation } from "./pipeline.js";

dotenv.config({ path: ".env.local" });

type JobType = "analysis" | "remix" | "fission" | "preroll" | "hooks";
type JobStatus = "queued" | "running" | "completed" | "failed";
type Project = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};
type Asset = {
  id: string;
  projectId: string;
  name: string;
  mimeType: string;
  size: number;
  path: string;
  createdAt: number;
};
type Job = {
  id: string;
  projectId: string;
  assetId: string;
  assetName: string;
  type: JobType;
  title: string;
  status: JobStatus;
  progress: number;
  currentStage: string;
  stages: string[];
  durationMs: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  metadata?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
};

const app = express();
const port = Number(process.env.API_PORT ?? 8787);
const dataDirectory = resolve("data");
const uploadDirectory = join(dataDirectory, "uploads");
const statePath = join(dataDirectory, "state.json");
await mkdir(uploadDirectory, { recursive: true });

const state = await readFile(statePath, "utf8")
  .then((value) => JSON.parse(value) as {
    projects?: Project[];
    assets?: Asset[];
    jobs?: Job[];
    analyses?: Record<string, AnalysisResult>;
  })
  .catch(() => ({}));
const assets = state.assets ?? [];
const jobs = (state.jobs ?? []).map((job) =>
  ["queued", "running"].includes(job.status)
    ? { ...job, status: "failed" as const, error: "服务重启，任务已中止", currentStage: "任务中止" }
    : job);
const analyses = state.analyses ?? {};
const projects = state.projects ?? [];
let projectsMigrated = false;
const knownProjectIds = new Set(projects.map((project) => project.id));
for (const projectId of new Set([
  ...assets.map((asset) => asset.projectId),
  ...jobs.map((job) => job.projectId),
  ...Object.keys(analyses),
])) {
  if (knownProjectIds.has(projectId)) continue;
  const projectAssets = assets.filter((asset) => asset.projectId === projectId);
  const projectJobs = jobs.filter((job) => job.projectId === projectId);
  const latestAsset = projectAssets.slice().sort((a, b) => b.createdAt - a.createdAt)[0];
  const latestNamedJob = projectJobs
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .find((job) => typeof job.metadata?.projectName === "string");
  const inferredName = String(latestNamedJob?.metadata?.projectName ?? "")
    .trim()
    || latestAsset?.name.replace(/\.[^.]+$/, "")
    || "未命名视频项目";
  const timestamps = [
    ...projectAssets.map((asset) => asset.createdAt),
    ...projectJobs.map((job) => job.createdAt),
  ];
  projects.push({
    id: projectId,
    name: inferredName,
    createdAt: timestamps.length > 0 ? Math.min(...timestamps) : Date.now(),
    updatedAt: timestamps.length > 0 ? Math.max(...timestamps) : Date.now(),
  });
  projectsMigrated = true;
}
let persistTimer: NodeJS.Timeout | undefined;

function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void writeFile(statePath, JSON.stringify({ projects, assets, jobs, analyses }, null, 2));
  }, 100);
}
if (projectsMigrated) persist();

function touchProject(projectId: string, updates?: { name?: string; updatedAt?: number }) {
  let project = projects.find((item) => item.id === projectId);
  if (!project) {
    project = {
      id: projectId,
      name: updates?.name?.trim() || "未命名视频项目",
      createdAt: Date.now(),
      updatedAt: updates?.updatedAt ?? Date.now(),
    };
    projects.push(project);
  } else {
    if (updates?.name?.trim()) project.name = updates.name.trim();
    project.updatedAt = updates?.updatedAt ?? Date.now();
  }
  return project;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (_request, file, callback) => {
      callback(null, `${crypto.randomUUID()}${extname(file.originalname).toLowerCase() || ".mp4"}`);
    },
  }),
  limits: { fileSize: 512 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    callback(null, file.mimetype.startsWith("video/"));
  },
});

let driver: Driver | null = null;
async function connectNeo4j() {
  if (driver) return driver;
  driver = neo4j.driver(
    process.env.NEO4J_URI ?? "bolt://127.0.0.1:7687",
    neo4j.auth.basic(
      process.env.NEO4J_USER ?? "neo4j",
      process.env.NEO4J_PASSWORD ?? "narrative-lens-local",
    ),
    { disableLosslessIntegers: true },
  );
  try {
    await driver.verifyConnectivity();
    const session = driver.session();
    try {
      await session.run(
        "CREATE CONSTRAINT ontology_node_identity IF NOT EXISTS FOR (n:OntologyNode) REQUIRE (n.projectId, n.id) IS UNIQUE",
      );
    } finally {
      await session.close();
    }
    return driver;
  } catch (error) {
    await driver.close().catch(() => undefined);
    driver = null;
    throw error;
  }
}

async function writeStoryGraph(
  projectId: string,
  assetId: string,
  nodes: StoryNode[],
  relations: StoryRelation[],
) {
  const activeDriver = await connectNeo4j();
  const session = activeDriver.session();
  try {
    await session.executeWrite(async (tx) => {
      await tx.run("MATCH (n:OntologyNode {projectId: $projectId}) DETACH DELETE n", { projectId });
      await tx.run("MATCH (n:StoryNode {projectId: $projectId}) DETACH DELETE n", { projectId });
      await tx.run(
        `UNWIND $nodes AS node
         CREATE (n:OntologyNode {
           projectId: $projectId, assetId: $assetId, id: node.id, kind: node.kind,
           label: node.label, description: node.description, timecode: node.timecode,
           start: node.start, end: node.end, score: node.score, aliases: node.aliases,
           evidenceIds: node.evidenceIds, communityId: node.communityId, status: node.status,
           schemaVersion: "video-ontology-v2"
         })`,
        { projectId, assetId, nodes },
      );
      await tx.run(
        `UNWIND $relations AS relation
         MATCH (source:OntologyNode {projectId: $projectId, id: relation.source})
         MATCH (target:OntologyNode {projectId: $projectId, id: relation.target})
         CREATE (source)-[:RELATES {
           projectId: $projectId, assetId: $assetId, id: relation.id,
           kind: relation.kind, label: relation.label, description: relation.description,
           weight: relation.weight, evidenceIds: relation.evidenceIds
         }]->(target)`,
        { projectId, assetId, relations },
      );
    });
  } finally {
    await session.close();
  }
}

async function readStoryGraph(projectId: string) {
  const session = (await connectNeo4j()).session();
  try {
    const nodeResult = await session.run(
      "MATCH (n:OntologyNode {projectId: $projectId}) RETURN properties(n) AS node ORDER BY n.id",
      { projectId },
    );
    const relationResult = await session.run(
      `MATCH (source:OntologyNode {projectId: $projectId})-[r:RELATES]->(target:OntologyNode {projectId: $projectId})
       RETURN properties(r) AS relation, source.id AS source, target.id AS target ORDER BY r.id`,
      { projectId },
    );
    return {
      nodes: nodeResult.records.map((record) => record.get("node")),
      relations: relationResult.records.map((record) => ({
        ...record.get("relation"),
        source: record.get("source"),
        target: record.get("target"),
      })),
    };
  } finally {
    await session.close();
  }
}

const jobConfig: Record<JobType, { durationMs: number; stages: string[] }> = {
  analysis: {
    durationMs: 300_000,
    stages: ["等待调度", "提取音轨", "ASR 识别", "MM 视频理解", "写入知识图谱"],
  },
  remix: { durationMs: 0, stages: ["尚未接入真实生成服务"] },
  fission: { durationMs: 0, stages: ["尚未接入真实生成服务"] },
  preroll: { durationMs: 0, stages: ["尚未接入真实生成服务"] },
  hooks: { durationMs: 0, stages: ["尚未接入真实生成服务"] },
};

function serializeJob(job: Job) {
  const now = Date.now();
  const elapsedMs = job.startedAt ? (job.completedAt ?? now) - job.startedAt : now - job.createdAt;
  return {
    ...job,
    elapsedSeconds: Math.max(0, Math.round(elapsedMs / 1000)),
    etaSeconds: job.status === "completed" ? 0 : undefined,
  };
}

let workerBusy = false;
async function runNextJob() {
  if (workerBusy) return;
  const job = jobs
    .filter((item) => item.status === "queued")
    .sort((a, b) => a.createdAt - b.createdAt)[0];
  if (!job) return;
  workerBusy = true;
  job.status = "running";
  job.startedAt = Date.now();
  job.currentStage = "启动真实分析";
  job.progress = 2;
  persist();

  try {
    if (job.type !== "analysis") {
      throw new Error("该功能尚未接入真实生成服务，已拒绝生成模拟结果");
    }
    const asset = assets.find((item) => item.id === job.assetId && item.projectId === job.projectId);
    if (!asset) throw new Error("找不到任务绑定的视频资产，请重新上传");
    const result = await analyzeVideo(asset.path, asset.name, (progress, stage) => {
      job.progress = progress;
      job.currentStage = stage;
      persist();
    });
    job.progress = 94;
    job.currentStage = "写入 Neo4j 知识图谱";
    await writeStoryGraph(job.projectId, job.assetId, result.nodes, result.relations);
    analyses[job.projectId] = result;
    touchProject(job.projectId);
    job.result = result;
    job.status = "completed";
    job.progress = 100;
    job.currentStage = "真实分析完成";
    job.completedAt = Date.now();
  } catch (error) {
    job.status = "failed";
    job.currentStage = "真实分析失败";
    job.error = error instanceof Error ? error.message : "未知分析错误";
    job.completedAt = Date.now();
  } finally {
    persist();
    workerBusy = false;
    setTimeout(() => void runNextJob(), 0);
  }
}

app.use(express.json({ limit: "2mb" }));

app.get("/api/health", async (_request, response) => {
  try {
    await connectNeo4j();
    response.json({ ok: true, neo4j: "connected", pipeline: "asr+multimodal" });
  } catch {
    response.status(503).json({ ok: false, neo4j: "disconnected", pipeline: "asr+multimodal" });
  }
});

app.get("/api/projects", (_request, response) => {
  response.json(projects
    .map((project) => {
      const latestAsset = assets
        .filter((asset) => asset.projectId === project.id)
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      const projectJobs = jobs.filter((job) => job.projectId === project.id);
      const activeJob = projectJobs.find((job) => ["queued", "running"].includes(job.status));
      return {
        ...project,
        assetId: latestAsset?.id ?? "",
        assetName: latestAsset?.name ?? "",
        hasAnalysis: Boolean(analyses[project.id]),
        activeJobStatus: activeJob?.status ?? "",
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt));
});

app.post("/api/projects", (request, response) => {
  const id = String(request.body.id ?? crypto.randomUUID()).trim();
  const name = String(request.body.name ?? "").trim();
  if (!id || !name) {
    response.status(400).json({ error: "项目名称不能为空" });
    return;
  }
  const existing = projects.find((project) => project.id === id);
  if (existing && existing.name === name) {
    response.json(existing);
    return;
  }
  const project = touchProject(id, { name });
  persist();
  response.status(existing ? 200 : 201).json(project);
});

app.post("/api/assets", upload.single("video"), (request, response) => {
  if (!request.file) {
    response.status(400).json({ error: "请选择有效视频文件" });
    return;
  }
  const projectId = String(request.body.projectId ?? "").trim();
  if (!projectId) {
    response.status(400).json({ error: "缺少 projectId" });
    return;
  }
  const asset: Asset = {
    id: crypto.randomUUID(),
    projectId,
    name: request.file.originalname,
    mimeType: request.file.mimetype,
    size: request.file.size,
    path: request.file.path,
    createdAt: Date.now(),
  };
  assets.push(asset);
  touchProject(projectId);
  delete analyses[projectId];
  persist();
  response.status(201).json({
    id: asset.id,
    projectId,
    name: asset.name,
    mimeType: asset.mimeType,
    size: asset.size,
    url: `/api/assets/${asset.id}/content`,
  });
});

app.get("/api/assets/:id/content", (request, response) => {
  const asset = assets.find((item) => item.id === request.params.id);
  if (!asset) {
    response.status(404).json({ error: "Asset not found" });
    return;
  }
  response.type(asset.mimeType).sendFile(asset.path);
});

app.get("/api/analysis/:projectId", (request, response) => {
  const result = analyses[request.params.projectId];
  if (!result) {
    response.status(404).json({ error: "当前项目还没有真实分析结果" });
    return;
  }
  response.json(result);
});

app.get("/api/jobs", (request, response) => {
  const projectId = typeof request.query.projectId === "string" ? request.query.projectId : "";
  response.json(jobs
    .filter((job) => !projectId || job.projectId === projectId)
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(serializeJob));
});

app.get("/api/jobs/:id", (request, response) => {
  const job = jobs.find((item) => item.id === request.params.id);
  if (!job) {
    response.status(404).json({ error: "Job not found" });
    return;
  }
  response.json(serializeJob(job));
});

app.post("/api/jobs", (request, response) => {
  const type = request.body.type as JobType;
  if (!Object.hasOwn(jobConfig, type)) {
    response.status(400).json({ error: "Unsupported job type" });
    return;
  }
  const projectId = String(request.body.projectId ?? "");
  const assetId = String(request.body.assetId ?? "");
  const asset = assets.find((item) => item.id === assetId && item.projectId === projectId);
  if (!asset) {
    response.status(400).json({ error: "任务必须绑定已上传的视频资产" });
    return;
  }
  const config = jobConfig[type];
  const job: Job = {
    id: crypto.randomUUID(),
    projectId,
    assetId,
    assetName: asset.name,
    type,
    title: String(request.body.title ?? "未命名任务"),
    status: "queued",
    progress: 0,
    currentStage: "等待调度",
    stages: config.stages,
    durationMs: config.durationMs,
    createdAt: Date.now(),
    metadata: request.body.metadata,
  };
  jobs.push(job);
  persist();
  void runNextJob();
  response.status(202).json(serializeJob(job));
});

app.delete("/api/jobs/completed", (request, response) => {
  const projectId = typeof request.query.projectId === "string" ? request.query.projectId : "";
  for (let index = jobs.length - 1; index >= 0; index -= 1) {
    if (["completed", "failed"].includes(jobs[index].status)
      && (!projectId || jobs[index].projectId === projectId)) {
      jobs.splice(index, 1);
    }
  }
  persist();
  response.status(204).end();
});

app.get("/api/graph/:projectId", async (request, response) => {
  try {
    const graph = await readStoryGraph(request.params.projectId);
    const analysis = analyses[request.params.projectId];
    response.json({
      ...graph,
      communities: analysis?.communities ?? [],
      textUnits: analysis?.textUnits ?? [],
      schemaVersion: analysis?.schemaVersion ?? "video-ontology-v2",
      source: "neo4j",
    });
  } catch (error) {
    response.status(503).json({
      error: "Neo4j is not available",
      detail: error instanceof Error ? error.message : "Unknown Neo4j error",
    });
  }
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof multer.MulterError) {
    response.status(400).json({
      error: error.code === "LIMIT_FILE_SIZE" ? "视频不能超过 512 MB" : error.message,
    });
    return;
  }
  response.status(500).json({
    error: error instanceof Error ? error.message : "服务器处理失败",
  });
});

const server = app.listen(port, "127.0.0.1", () => {
  console.log(`Narrative Lens API: http://127.0.0.1:${port}`);
});
void connectNeo4j()
  .then(() => console.log("Neo4j connected"))
  .catch(() => console.warn("Neo4j is not ready; graph endpoints will retry"));
void runNextJob();

async function shutdown() {
  clearTimeout(persistTimer);
  await writeFile(statePath, JSON.stringify({ assets, jobs, analyses }, null, 2));
  server.close();
  if (driver) await driver.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
