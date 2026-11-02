import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const trendsPath = path.join(projectRoot, "public", "data", "trends.json");
const insightsPath = path.join(projectRoot, "public", "data", "insights.json");
const postsPath = path.join(projectRoot, "public", "data", "posts.json");

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function formatDate(date = new Date()) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replace(/\//g, "-");
}

function buildPost(trends, insights) {
  const date = formatDate();
  const currentIds = new Set(insights.currentItemIds || []);
  const selected = (insights.items || [])
    .filter((item) => !currentIds.size || currentIds.has(item.id))
    .slice(0, 8);
  const topSignals = trends.signals?.slice(0, 5) || [];
  const topHighlights = trends.highlights?.slice(0, 8) || [];
  const hasInsights = selected.length > 0;
  const title = hasInsights
    ? `${date} 深度精选：今天真正值得关注的技术与新闻`
    : `${date} 每日热点：技术、新闻与社区讨论精选`;

  const insightSections = selected.flatMap((item, index) => [
    `### ${index + 1}. ${item.title}`,
    item.summary || item.reason || "暂无摘要。",
    item.reason ? `**为什么值得看：** ${item.reason}` : "",
    `来源：${item.platform || "扩展来源"} · Horizon 推荐分 ${item.score ?? "—"}`,
    "",
  ]).filter(Boolean);

  const sections = hasInsights ? [
    "本期由 Technology Exploration 汇集平台热点，再经 Horizon 评分、跨来源去重与背景增强。平台热度代表讨论规模，Horizon 推荐分代表内容价值，两者不会混为一谈。",
    insights.status === "stale"
      ? `> 本期增强内容沿用上一次成功结果（${insights.generatedAt || "时间未知"}），原始榜单仍为最新。`
      : "",
    "",
    "## 本期深度精选",
    ...insightSections,
    "## 今日关键信号",
    ...topSignals.slice(0, 3).map((signal, index) =>
      `${index + 1}. ${signal.title} —— ${signal.takeaway || signal.summary || "暂无摘要"}`),
  ].filter(Boolean) : [
    "今天的热点由 Technology Exploration 项目的最新日报生成；Horizon 暂无可发布精选，因此使用原始榜单生成本期内容。",
    "",
    "## 今日关键信号",
    ...topSignals.map((signal, index) => {
      const sources = signal.sources?.length ? ` 来源：${signal.sources.join("、")}` : "";
      return `${index + 1}. ${signal.title} —— ${signal.takeaway || signal.summary || "暂无摘要"}${sources}`;
    }),
    "",
    "## 热门内容 Top 8",
    ...topHighlights.map((item, index) => {
      const score = item.score ? ` · 热度 ${item.score}` : "";
      return `${index + 1}. ${item.title}（${item.source}${score}）`;
    }),
  ];

  return {
    id: `daily-${date}`,
    title,
    slug: `daily-${date}`,
    author: "Trend Forum 编辑部",
    category: "每日热点",
    tags: hasInsights
      ? ["Horizon", "深度精选", "技术", "新闻", "自动发布"]
      : ["热点", "技术", "新闻", "自动发布"],
    status: "published",
    publishedAt: new Date().toISOString(),
    sourceReport: trends.sourceReport,
    excerpt: selected[0]?.summary
      || topSignals[0]?.takeaway
      || topHighlights[0]?.summary
      || "每日热点精选与技术趋势导读。",
    body: sections.join("\n"),
    relatedItems: hasInsights
      ? selected.map((item) => item.id)
      : topHighlights.map((item) => item.id),
    horizonEditionId: insights.currentEditionId || null,
    horizonStatus: insights.status || "stale",
  };
}

if (!fs.existsSync(trendsPath)) {
  console.error(`缺少热点数据：${trendsPath}。请先运行 npm run sync:trends。`);
  process.exit(1);
}

const trends = readJson(trendsPath, {});
const insights = readJson(insightsPath, {
  currentEditionId: null,
  currentItemIds: [],
  generatedAt: null,
  status: "stale",
  items: [],
});
const posts = readJson(postsPath, []);
const nextPost = buildPost(trends, insights);
const withoutSameDay = posts.filter((post) => post.id !== nextPost.id);

fs.writeFileSync(postsPath, `${JSON.stringify([nextPost, ...withoutSameDay], null, 2)}\n`);
console.log(`已生成/更新每日自动发布文章：${nextPost.title}`);
