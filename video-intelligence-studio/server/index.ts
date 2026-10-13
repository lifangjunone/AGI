/*
 * Legacy prototype retained only for history. The executable server is app.ts.
 *
import dotenv from "dotenv";
import express from "express";
import neo4j, { Driver } from "neo4j-driver";

dotenv.config({ path: ".env.local" });

type JobType = "analysis" | "remix" | "fission" | "preroll" | "hooks";
type JobStatus = "queued" | "running" | "completed" | "failed";

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

type StoryNode = {
  id: string;
  kind: "Person" | "Event" | "Object";
  label: string;
  description: string;
  timecode: string;
  score: number;
  x: number;
  y: number;
};

type StoryRelation = {
  id: string;
  source: string;
  target: string;
  kind: string;
  label: string;
};

const app = express();
const port = Number(process.env.API_PORT ?? 8787);
const jobs: Job[] = [];

const jobConfig: Record<JobType, { durationMs: number; stages: string[] }> = {
  analysis: {
    durationMs: 14_000,
    stages: ["提取音轨与镜头", "识别人声与实体", "构建情节关系", "写入知识图谱"],
  },
  remix: {
    durationMs: 10_000,
    stages: ["读取证据片段", "重排叙事节奏", "生成粗剪时间线", "质量检查"],
  },
  fission: {
    durationMs: 12_000,
    stages: ["展开变量矩阵", "生成视频变体", "去重与评分", "整理实验分组"],
  },
  preroll: {
    durationMs: 11_000,
    stages: ["提取正片入口", "生成前贴脚本", "生成分镜画面", "连续性检查"],
  },
  hooks: {
    durationMs: 7_000,
    stages: ["分析目标受众", "生成钩子候选", "事实一致性检查", "留存势能评分"],
  },
};

const storyNodes: StoryNode[] = [
  { id: "lin-xia", kind: "Person", label: "林夏", description: "离家十年的妹妹，被家人误解为拿走救命钱。", timecode: "00:02", score: 96, x: 15, y: 30 },
  { id: "lin-chuan", kind: "Person", label: "林川", description: "哥哥，在保护家庭与指控妹妹之间摇摆。", timecode: "00:17", score: 92, x: 15, y: 70 },
  { id: "father", kind: "Person", label: "父亲", description: "真相持有者，通过旧录音完成迟到的解释。", timecode: "00:37", score: 89, x: 15, y: 50 },
  { id: "return", kind: "Event", label: "雨夜重逢", description: "林夏在葬礼前夜回到车站。", timecode: "00:02–00:13", score: 86, x: 45, y: 18 },
  { id: "accusation", kind: "Event", label: "身份误判", description: "家人公开指控林夏拿走父亲的钱。", timecode: "00:17–00:31", score: 93, x: 45, y: 42 },
  { id: "reveal", kind: "Event", label: "录音反转", description: "父亲原声揭示林夏一直在替家庭还债。", timecode: "00:37–00:52", score: 97, x: 72, y: 42 },
  { id: "reconcile", kind: "Event", label: "沉默和解", description: "哥哥在列车进站前交出未寄出的信。", timecode: "00:57–01:12", score: 82, x: 72, y: 74 },
  { id: "envelope", kind: "Object", label: "红色信封", description: "贯穿冲突和和解的关键叙事道具。", timecode: "00:02", score: 88, x: 45, y: 78 },
  { id: "recorder", kind: "Object", label: "旧录音机", description: "保存父亲证词并触发核心反转。", timecode: "00:29", score: 95, x: 72, y: 16 },
];

const storyRelations: StoryRelation[] = [
  { id: "r1", source: "lin-xia", target: "lin-chuan", kind: "SIBLING_OF", label: "兄妹 · 误解" },
  { id: "r2", source: "father", target: "lin-xia", kind: "PROTECTS", label: "替她澄清" },
  { id: "r3", source: "lin-xia", target: "return", kind: "PARTICIPATES_IN", label: "归来" },
  { id: "r4", source: "lin-chuan", target: "accusation", kind: "TRIGGERS", label: "发起指控" },
  { id: "r5", source: "return", target: "accusation", kind: "LEADS_TO", label: "冲突升级" },
  { id: "r6", source: "accusation", target: "reveal", kind: "LEADS_TO", label: "证据出现" },
  { id: "r7", source: "recorder", target: "reveal", kind: "REVEALS", label: "播放真相" },
  { id: "r8", source: "reveal", target: "reconcile", kind: "RESOLVES", label: "解除误解" },
  { id: "r9", source: "envelope", target: "reconcile", kind: "SYMBOLIZES", label: "完成交接" },
  { id: "r10", source: "father", target: "recorder", kind: "RECORDED", label: "留下证词" },
];

let driver: Driver | null = null;
let neo4jReady = false;

async function connectNeo4j() {
  if (neo4jReady && driver) return driver;
  if (driver) await driver.close().catch(() => undefined);

  const uri = process.env.NEO4J_URI ?? "bolt://127.0.0.1:7687";
  const user = process.env.NEO4J_USER ?? "neo4j";
  const password = process.env.NEO4J_PASSWORD ?? "narrative-lens-local";
  driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    disableLosslessIntegers: true,
  });

  try {
    await driver.verifyConnectivity();
    const session = driver.session();
    try {
      await session.run(
        "CREATE CONSTRAINT story_node_identity IF NOT EXISTS FOR (n:StoryNode) REQUIRE (n.projectId, n.id) IS UNIQUE",
      );
    } finally {
      await session.close();
    }
    neo4jReady = true;
    return driver;
  } catch (error) {
    neo4jReady = false;
    await driver.close().catch(() => undefined);
    driver = null;
    throw error;
  }
}

async function writeStoryGraph(projectId: string) {
  const activeDriver = await connectNeo4j();
  const session = activeDriver.session();
  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        "MATCH (n:StoryNode {projectId: $projectId}) DETACH DELETE n",
        { projectId },
      );
      await tx.run(
        `UNWIND $nodes AS node
         CREATE (n:StoryNode {
           projectId: $projectId,
           id: node.id,
           kind: node.kind,
           label: node.label,
           description: node.description,
           timecode: node.timecode,
           score: node.score,
           x: node.x,
           y: node.y
         })`,
        { projectId, nodes: storyNodes },
      );
      await tx.run(
        `UNWIND $relations AS relation
         MATCH (source:StoryNode {projectId: $projectId, id: relation.source})
         MATCH (target:StoryNode {projectId: $projectId, id: relation.target})
         CREATE (source)-[:RELATES {
           projectId: $projectId,
           id: relation.id,
           kind: relation.kind,
           label: relation.label
         }]->(target)`,
        { projectId, relations: storyRelations },
      );
    });
  } finally {
    await session.close();
  }
}

async function readStoryGraph(projectId: string) {
  const activeDriver = await connectNeo4j();
  const session = activeDriver.session();
  try {
    const nodeResult = await session.run(
      "MATCH (n:StoryNode {projectId: $projectId}) RETURN properties(n) AS node ORDER BY n.id",
      { projectId },
    );
    const relationResult = await session.run(
      `MATCH (source:StoryNode {projectId: $projectId})-[r:RELATES]->(target:StoryNode {projectId: $projectId})
       RETURN properties(r) AS relation, source.id AS source, target.id AS target
       ORDER BY r.id`,
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

function serializeJob(job: Job) {
  const now = Date.now();
  const elapsedMs = job.startedAt
    ? (job.completedAt ?? now) - job.startedAt
    : now - job.createdAt;
  const etaMs = job.status === "queued"
    ? job.durationMs
    : Math.max(0, job.durationMs - elapsedMs);
  return {
    ...job,
    elapsedSeconds: Math.max(0, Math.round(elapsedMs / 1000)),
    etaSeconds: Math.max(0, Math.ceil(etaMs / 1000)),
  };
}

function buildJobResult(job: Job): Record<string, unknown> {
  const input = job.assetName || "当前视频";
  if (job.type === "analysis") {
    return {
      kind: "analysis",
      title: `${input} · 视频理解报告`,
      summary: "完成画面、对白、人物、事件与因果关系对齐，并写入 Neo4j。",
      metrics: [
        ["高光片段", "4"],
        ["人物实体", "3"],
        ["故事事件", "4"],
        ["图谱关系", "10"],
      ],
      sections: ["故事摘要", "人物关系图谱", "情节因果图谱", "音频证据"],
    };
  }
  if (job.type === "remix") {
    return {
      kind: "remix",
      title: `${input} · 可编辑粗剪`,
      summary: `已按“${String(job.metadata?.strategy ?? "冲突加速版")}”重组，所有片段保留原始时间码。`,
      metrics: [["成片时长", String(job.metadata?.duration ?? "00:36")], ["片段数", "8"], ["证据覆盖", "100%"]],
      outputs: ["粗剪时间线 v1", "字幕轨道", "EDL 剪辑清单"],
    };
  }
  if (job.type === "fission") {
    const count = Number(job.metadata?.count ?? 12);
    return {
      kind: "fission",
      title: `${input} · ${count} 个裂变版本`,
      summary: "变体已按单一变量原则生成并完成去重，可进入实验分组。",
      metrics: [["生成版本", String(count)], ["通过质检", String(Math.max(1, count - 1))], ["最高留存势能", "92"]],
      outputs: ["A 组 · 钩子变量", "B 组 · 首镜变量", "C 组 · 字幕变量"],
    };
  }
  if (job.type === "preroll") {
    return {
      kind: "preroll",
      title: `${input} · ${String(job.metadata?.duration ?? "8s")} 前贴`,
      summary: "前贴已生成，并通过人物、道具、场景与正片入口的连续性检查。",
      metrics: [["时长", String(job.metadata?.duration ?? "8s")], ["分镜", "3"], ["连续性", "通过"]],
      outputs: ["口播脚本", "AI 分镜板", "正片衔接点"],
    };
  }
  return {
    kind: "hooks",
    title: `${input} · 黄金钩子候选`,
    summary: `面向“${String(job.metadata?.audience ?? "目标受众")}”生成并完成事实一致性检查。`,
    metrics: [["候选数", "3"], ["最高留存势能", "95"], ["事实护栏", "通过"]],
    outputs: ["信息差钩子", "关系反转钩子", "倒计时钩子"],
  };
}

async function finishJob(job: Job) {
  job.status = "completed";
  job.progress = 100;
  job.currentStage = "处理完成";
  job.completedAt = Date.now();
  job.result = buildJobResult(job);

  if (job.type === "analysis") {
    try {
      await writeStoryGraph(job.projectId);
    } catch (error) {
      job.status = "failed";
      job.currentStage = "知识图谱写入失败";
      job.error = error instanceof Error ? error.message : "Neo4j write failed";
    }
  }
}

setInterval(() => {
  let running = jobs.find((job) => job.status === "running");
  if (!running) {
    running = jobs
      .filter((job) => job.status === "queued")
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    if (running) {
      running.status = "running";
      running.startedAt = Date.now();
      running.currentStage = running.stages[0];
    }
  }

  if (!running?.startedAt) return;
  const elapsed = Date.now() - running.startedAt;
  const ratio = Math.min(1, elapsed / running.durationMs);
  running.progress = Math.min(99, Math.max(1, Math.round(ratio * 100)));
  const stageIndex = Math.min(
    running.stages.length - 1,
    Math.floor(ratio * running.stages.length),
  );
  running.currentStage = running.stages[stageIndex];
  if (ratio >= 1) void finishJob(running);
}, 500);

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", async (_request, response) => {
  try {
    await connectNeo4j();
    response.json({ ok: true, neo4j: "connected", queue: "ready" });
  } catch {
    response.status(503).json({ ok: false, neo4j: "disconnected", queue: "ready" });
  }
});

app.get("/api/jobs", (request, response) => {
  const projectId = typeof request.query.projectId === "string"
    ? request.query.projectId
    : "";
  response.json(
    jobs
      .filter((job) => !projectId || job.projectId === projectId)
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(serializeJob),
  );
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

  const config = jobConfig[type];
  const job: Job = {
    id: crypto.randomUUID(),
    projectId: String(request.body.projectId ?? "demo-project"),
    assetId: String(request.body.assetId ?? "demo-asset"),
    assetName: String(request.body.assetName ?? "未命名视频"),
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
  response.status(202).json(serializeJob(job));
});

app.delete("/api/jobs/completed", (request, response) => {
  const projectId = typeof request.query.projectId === "string"
    ? request.query.projectId
    : "";
  const removable = jobs.filter(
    (job) =>
      ["completed", "failed"].includes(job.status)
      && (!projectId || job.projectId === projectId),
  );
  for (const job of removable) {
    const index = jobs.indexOf(job);
    jobs.splice(index, 1);
  }
  response.status(204).end();
});

app.get("/api/graph/:projectId", async (request, response) => {
  try {
    const graph = await readStoryGraph(request.params.projectId);
    response.json({ ...graph, source: "neo4j" });
  } catch (error) {
    response.status(503).json({
      error: "Neo4j is not available",
      detail: error instanceof Error ? error.message : "Unknown Neo4j error",
    });
  }
});

const server = app.listen(port, "127.0.0.1", () => {
  console.log(`Narrative Lens API: http://127.0.0.1:${port}`);
});

void connectNeo4j()
  .then(() => writeStoryGraph("demo-project"))
  .then(() => console.log("Neo4j connected and demo graph seeded"))
  .catch(() => console.warn("Neo4j is not ready; graph endpoints will retry"));

async function shutdown() {
  server.close();
  if (driver) await driver.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
*/

await import("./app.js");
