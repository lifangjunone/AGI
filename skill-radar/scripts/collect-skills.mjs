import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, "public/data/skills.json");
const HISTORY = resolve(ROOT, "data/history.json");
const MAX_SKILLS = Number(process.env.SKILL_RADAR_LIMIT || 180);
const USER_AGENT = "SkillRadar/1.0 (+https://lifeyoume.icu/skills/)";
const CURATED_SKILLS = [
  {
    id: "lifeyoume/product-ui-director",
    name: "Product UI Director",
    slug: "product-ui-director",
    source: "LifeYouMe Studio",
    url: "https://github.com/lifangjunone/AGI/tree/main/skill-radar/skills/product-ui-director",
    repositoryUrl: "https://github.com/lifangjunone/AGI",
    installCommand: "npx skills add https://github.com/lifangjunone/AGI/tree/main/skill-radar/skills/product-ui-director",
    category: "design",
    description: "从产品叙事、三方向高保真原型，到真实实现与截图验收的产品 UI 设计总导演。",
    installs: 0,
    weeklyInstalls: [],
    weeklyLatest: 0,
    trend: 0,
    official: false,
    score: 0,
    agents: ["Codex", "Claude Code", "Cursor"],
    curatorOriginal: true,
    authorLabel: "主理人原创",
  },
];

export const categories = [
  {
    id: "development",
    name: "开发与代码",
    terms: ["code", "coding", "developer", "frontend", "backend", "react", "typescript", "python", "debug", "test", "nx", "firebase", "git", "api", "performance"],
  },
  {
    id: "design",
    name: "设计与体验",
    terms: ["design", "ui", "ux", "interface", "animation", "motion", "css", "tailwind", "three", "lottie", "typeset", "accessibility", "canvas"],
  },
  {
    id: "research",
    name: "研究与知识",
    terms: ["research", "search", "knowledge", "document", "pdf", "spreadsheet", "slides", "obsidian", "notebook", "crawl", "scrape"],
  },
  {
    id: "marketing",
    name: "营销与增长",
    terms: ["marketing", "seo", "content", "social", "launch", "pricing", "signup", "onboarding", "referral", "prospect", "email", "sms", "sales", "copywriting"],
  },
  {
    id: "business",
    name: "商业与办公",
    terms: ["stripe", "commerce", "calendar", "gmail", "drive", "slack", "chief-of-staff", "finance", "legal", "project", "product", "plan"],
  },
  {
    id: "media",
    name: "图像与视频",
    terms: ["video", "image", "gif", "remotion", "caption", "audio", "media", "heygen", "frame"],
  },
  {
    id: "agent",
    name: "Agent 工程",
    terms: ["agent", "mcp", "claude", "codex", "prompt", "skill", "tool", "browser", "sandbox", "memory", "context"],
  },
  { id: "productivity", name: "通用与效率", terms: [] },
];

const decode = (value = "") =>
  value
    .replaceAll("\\u0026", "&")
    .replaceAll("\\/", "/")
    .replaceAll('\\"', '"')
    .replaceAll("\\\\", "\\");

export function classify(text) {
  const haystack = text.toLowerCase();
  let best = categories.at(-1);
  let bestScore = 0;
  for (const category of categories.slice(0, -1)) {
    const score = category.terms.reduce(
      (total, term) => total + (haystack.includes(term) ? (term.length > 5 ? 2 : 1) : 0),
      0,
    );
    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }
  return best.id;
}

export function parseSkillsPage(html) {
  const normalized = html.replaceAll('\\"', '"');
  const pattern =
    /{"source":"([^"]+)","skillId":"([^"]+)","name":"([^"]+)","installs":(\d+),"weeklyInstalls":\[(.*?)\](?:,"isOfficial":(true|false))?}/g;
  const found = new Map();
  for (const match of normalized.matchAll(pattern)) {
    const source = decode(match[1]);
    const skillId = decode(match[2]);
    const key = `${source}/${skillId}`;
    if (found.has(key)) continue;
    const weekly = match[5].split(",").map((item) => Number(item) || 0);
    found.set(key, {
      source,
      skillId,
      name: decode(match[3]),
      installs: Number(match[4]),
      weeklyInstalls: weekly,
      official: match[6] === "true",
    });
  }
  return [...found.values()];
}

function trendFor(weekly) {
  const recent = weekly.slice(-2).reduce((sum, value) => sum + value, 0);
  const previous = weekly.slice(-4, -2).reduce((sum, value) => sum + value, 0);
  if (!previous) return recent ? 100 : 0;
  return Math.round(((recent - previous) / previous) * 100);
}

function scoreFor(skill) {
  const installs = Math.min(62, Math.log10(Math.max(skill.installs, 1)) * 11);
  const recent = skill.weeklyInstalls.at(-1) || 0;
  const momentum = Math.min(24, Math.log10(Math.max(recent, 1)) * 6);
  const official = skill.official ? 10 : 0;
  return Math.round((installs + momentum + official) * 10) / 10;
}

function titleFor(name) {
  return name
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => (part.length <= 3 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)))
    .join(" ");
}

function descriptionFor(skill, categoryName) {
  const sourceName = skill.source.includes("/") ? skill.source.split("/")[0] : skill.source;
  return `来自 ${sourceName} 的 ${categoryName} Skill，近一周安装 ${new Intl.NumberFormat("zh-CN").format(skill.weeklyInstalls.at(-1) || 0)} 次。`;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.next`;
  await writeFile(temporary, content);
  await rename(temporary, path);
}

async function loadPrevious() {
  try {
    return JSON.parse(await readFile(HISTORY, "utf8"));
  } catch {
    return { snapshots: [] };
  }
}

async function main() {
  const collectedAt = new Date().toISOString();
  let sourceStatus = "live";
  let rawSkills = [];
  try {
    rawSkills = parseSkillsPage(await fetchText("https://skills.sh"));
    if (rawSkills.length < 20) throw new Error(`only parsed ${rawSkills.length} skills`);
  } catch (error) {
    sourceStatus = "cached";
    const existing = JSON.parse(await readFile(OUTPUT, "utf8"));
    rawSkills = existing.skills;
    console.warn(`skills.sh collection failed, preserving cached data: ${error.message}`);
  }

  const rankedSkills = rawSkills
    .map((skill) => {
      if (skill.category && skill.score) return skill;
      const category = classify(`${skill.source} ${skill.skillId} ${skill.name}`);
      const categoryName = categories.find((item) => item.id === category)?.name || "通用与效率";
      const trend = trendFor(skill.weeklyInstalls);
      return {
        id: `${skill.source}/${skill.skillId}`.replaceAll(/[^a-zA-Z0-9/_-]/g, ""),
        name: titleFor(skill.name),
        slug: skill.skillId,
        source: skill.source,
        url: skill.source.includes("/")
          ? `https://skills.sh/${skill.source}/${skill.skillId}`
          : "https://skills.sh",
        repositoryUrl: skill.source.includes("/") ? `https://github.com/${skill.source}` : "",
        installCommand: `npx skills add ${skill.source} --skill ${skill.skillId}`,
        category,
        description: descriptionFor(skill, categoryName),
        installs: skill.installs,
        weeklyInstalls: skill.weeklyInstalls,
        weeklyLatest: skill.weeklyInstalls.at(-1) || 0,
        trend,
        official: Boolean(skill.official),
        score: scoreFor(skill),
        agents: ["Codex", "Claude Code", "Cursor"],
      };
    })
    .sort((a, b) => b.score - a.score || b.installs - a.installs)
    .slice(0, MAX_SKILLS)
    .map((skill, index) => ({ ...skill, rank: index + 1 }));
  const normalized = [
    ...CURATED_SKILLS.map((skill) => ({ ...skill, rank: null })),
    ...rankedSkills,
  ];

  const categoryCounts = Object.fromEntries(
    categories.map((category) => [
      category.id,
      normalized.filter((skill) => skill.category === category.id).length,
    ]),
  );
  const payload = {
    schemaVersion: 1,
    collectedAt,
    timezone: "Asia/Shanghai",
    sourceStatus,
    methodology: {
      summary: "公开榜单综合安装规模、最近一周安装量与官方标识排序；“主理人原创”为独立策展条目，不参与公开热度排名。",
      sources: [
        { name: "skills.sh", url: "https://skills.sh", fields: ["安装量", "8 周趋势", "官方标识"] },
      ],
    },
    stats: {
      skills: normalized.length,
      sources: new Set(rankedSkills.map((skill) => skill.source)).size,
      official: rankedSkills.filter((skill) => skill.official).length,
      curatorOriginals: normalized.filter((skill) => skill.curatorOriginal).length,
      categories: categories.length,
    },
    categories: categories.map(({ id, name }) => ({ id, name, count: categoryCounts[id] })),
    skills: normalized,
  };
  await atomicWrite(OUTPUT, `${JSON.stringify(payload, null, 2)}\n`);

  const history = await loadPrevious();
  history.snapshots = [
    ...(history.snapshots || []).filter((item) => item.date !== collectedAt.slice(0, 10)),
    {
      date: collectedAt.slice(0, 10),
      collectedAt,
      total: normalized.length,
      leaders: rankedSkills.slice(0, 20).map(({ id, installs, weeklyLatest, score }) => ({
        id,
        installs,
        weeklyLatest,
        score,
      })),
    },
  ].slice(-90);
  await atomicWrite(HISTORY, `${JSON.stringify(history, null, 2)}\n`);
  console.log(`Collected ${normalized.length} skills from ${payload.stats.sources} sources.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
