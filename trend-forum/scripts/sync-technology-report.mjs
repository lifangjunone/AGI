import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const defaultReportDir = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "Technology Exploration Agent",
  "reports",
);

const reportDir = process.env.TREND_FORUM_REPORT_DIR
  ? expandHome(process.env.TREND_FORUM_REPORT_DIR)
  : defaultReportDir;

const outputPath = path.join(projectRoot, "public", "data", "trends.json");

function expandHome(value) {
  if (!value.startsWith("~/")) return value;
  return path.join(os.homedir(), value.slice(2));
}

function readLatestReport() {
  if (!fs.existsSync(reportDir)) {
    throw new Error(`Technology Exploration 报告目录不存在：${reportDir}`);
  }

  const files = fs
    .readdirSync(reportDir)
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort();

  if (!files.length) {
    throw new Error(`Technology Exploration 报告目录里没有日报 JSON：${reportDir}`);
  }

  const latest = files.at(-1);
  const latestPath = path.join(reportDir, latest);
  const report = JSON.parse(fs.readFileSync(latestPath, "utf8"));

  return { report, latestPath, reportDate: latest.replace(/\.json$/, "") };
}

function normalizeItem(item, fallbackSource = "未知来源") {
  const title = String(item?.title || "未命名热点").trim();
  const source = String(item?.source || fallbackSource).trim();
  const score = Number.isFinite(Number(item?.score)) ? Number(item.score) : 0;
  const engagement = Number.isFinite(Number(item?.engagement)) ? Number(item.engagement) : 0;

  return {
    id: stableId(`${source}:${title}:${item?.url || ""}`),
    title,
    url: item?.url || "",
    source,
    summary: String(item?.summary || "").trim(),
    publishedAt: item?.published_at || item?.publishedAt || null,
    engagement,
    score: Math.round(score * 10) / 10,
    evidence: item?.evidence || "",
    topics: Array.isArray(item?.topic_ids) ? item.topic_ids : [],
  };
}

function normalizeSignal(signal) {
  return {
    id: stableId(`${signal?.title || ""}:${signal?.url || ""}`),
    title: signal?.title || "未命名趋势信号",
    url: signal?.url || "",
    summary: signal?.summary || signal?.takeaway || "",
    takeaway: signal?.takeaway || signal?.summary || "",
    category: signal?.category || "trend",
    score: Number.isFinite(Number(signal?.score)) ? Math.round(Number(signal.score) * 10) / 10 : 0,
    sourceCount: signal?.source_count || signal?.sources?.length || 0,
    sources: Array.isArray(signal?.sources) ? signal.sources : [],
    knowledgePoints: Array.isArray(signal?.knowledge_points) ? signal.knowledge_points : [],
    scenario: signal?.scenario || "",
    nextStep: signal?.next_step || "",
    evidence: Array.isArray(signal?.evidence)
      ? signal.evidence.slice(0, 5).map((item) => normalizeItem(item))
      : [],
  };
}

function normalizeBoard(board) {
  return {
    key: board?.key || stableId(board?.label || "board"),
    label: board?.label || "榜单",
    category: board?.category || "general",
    items: Array.isArray(board?.items) ? board.items.slice(0, 10).map((item) => normalizeItem(item, board?.label)) : [],
  };
}

function stableId(input) {
  let hash = 0;
  const text = String(input);
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function buildPayload(report, latestPath, reportDate) {
  const items = Array.isArray(report.items) ? report.items.map((item) => normalizeItem(item)) : [];
  const signals = Array.isArray(report.signals) ? report.signals.map((signal) => normalizeSignal(signal)) : [];
  const boards = Array.isArray(report.news_boards) ? report.news_boards.map((board) => normalizeBoard(board)) : [];
  const sourceTop10 = Array.isArray(report.source_top10)
    ? report.source_top10.map((board) => normalizeBoard({ ...board, category: "source" }))
    : [];

  return {
    generatedAt: new Date().toISOString(),
    sourceReport: {
      date: reportDate,
      path: latestPath,
      generatedAt: report.generated_at || null,
      analysisModel: report.analysis_model || "unknown",
    },
    researchContext: report.research_context || {},
    qualityStats: report.quality_stats || {},
    sourceStatus: report.source_status || [],
    contentPortals: report.content_portals || [],
    highlights: items.slice(0, 10),
    signals,
    boards,
    sourceTop10,
  };
}

try {
  const { report, latestPath, reportDate } = readLatestReport();
  const payload = buildPayload(report, latestPath, reportDate);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`已同步 Technology Exploration 最新热点报告：${latestPath}`);
  console.log(`已写入：${outputPath}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
