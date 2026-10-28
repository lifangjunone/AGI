import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const trendsPath = path.join(projectRoot, "public", "data", "trends.json");
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

function buildPost(trends) {
  const date = formatDate();
  const topSignals = trends.signals?.slice(0, 5) || [];
  const topHighlights = trends.highlights?.slice(0, 8) || [];
  const title = `${date} 每日热点：技术、新闻与社区讨论精选`;

  const sections = [
    "今天的热点由 Technology Exploration 项目的最新日报生成，覆盖知乎、微博、小红书、X、V2EX、GitHub、Hacker News、Bilibili 等来源。",
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
    "",
    "## 编辑建议",
    "适合把这些热点拆成 3 类内容：即时快讯、深度解读、技术趋势观察。后续可以接入登录、评论、点赞、收藏和人工审核流程。",
  ];

  return {
    id: `daily-${date}`,
    title,
    slug: `daily-${date}`,
    author: "Trend Forum 编辑部",
    category: "每日热点",
    tags: ["热点", "技术", "新闻", "自动发布"],
    status: "published",
    publishedAt: new Date().toISOString(),
    sourceReport: trends.sourceReport,
    excerpt: topSignals[0]?.takeaway || topHighlights[0]?.summary || "每日热点精选与技术趋势导读。",
    body: sections.join("\n"),
    relatedItems: topHighlights.map((item) => item.id),
  };
}

if (!fs.existsSync(trendsPath)) {
  console.error(`缺少热点数据：${trendsPath}。请先运行 npm run sync:trends。`);
  process.exit(1);
}

const trends = readJson(trendsPath, {});
const posts = readJson(postsPath, []);
const nextPost = buildPost(trends);
const withoutSameDay = posts.filter((post) => post.id !== nextPost.id);

fs.writeFileSync(postsPath, `${JSON.stringify([nextPost, ...withoutSameDay], null, 2)}\n`);
console.log(`已生成/更新每日自动发布文章：${nextPost.title}`);
