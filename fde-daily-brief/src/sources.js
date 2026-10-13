// 公开源采集：每个源独立容错，任一失败不影响其他源。
// 统一 Item 结构：{ id, source, title, url, score, publishedAt?, summary? }
// 去重以 url 为幂等键（在 generate 落库层再做一次保险）。

const FETCH_TIMEOUT_MS = 12000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": "fde-daily-brief/0.1 (+https://github.com/)",
        Accept: "application/json, text/plain, */*",
        ...(options.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function getJSON(url) {
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
}

async function getText(url) {
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

// 限制并发，避免一次打太多请求
async function mapLimit(items, limit, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return out;
}

function decodeEntities(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

// ————— Hacker News —————
async function fetchHackerNews() {
  const ids = await getJSON("https://hacker-news.firebaseio.com/v0/topstories.json");
  const top = ids.slice(0, 40);
  const stories = await mapLimit(top, 8, async (id) => {
    try {
      const s = await getJSON(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      if (!s || s.type !== "story" || !s.title) return null;
      return {
        id: `hn-${id}`,
        source: "Hacker News",
        title: s.title,
        url: s.url || `https://news.ycombinator.com/item?id=${id}`,
        score: s.score || 0,
        publishedAt: s.time ? new Date(s.time * 1000).toISOString() : undefined,
        comments: s.descendants || 0,
      };
    } catch {
      return null;
    }
  });
  return stories.filter(Boolean);
}

// ————— arXiv（近两天提交的 AI/NLP/ML 论文）—————
async function fetchArxiv() {
  const url =
    "https://export.arxiv.org/api/query?" +
    new URLSearchParams({
      search_query: "cat:cs.AI OR cat:cs.CL OR cat:cs.LG OR cat:cs.SE",
      sortBy: "submittedDate",
      sortOrder: "descending",
      maxResults: "25",
    }).toString();
  const xml = await getText(url);
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  return entries.map((entry, i) => {
    const title = decodeEntities((entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "").replace(/\s+/g, " ");
    const id = (entry.match(/<id>([\s\S]*?)<\/id>/) || [])[1]?.trim() || `arxiv-${i}`;
    const summary = decodeEntities((entry.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1] || "").replace(/\s+/g, " ");
    const published = (entry.match(/<published>([\s\S]*?)<\/published>/) || [])[1]?.trim();
    return {
      id: `arxiv-${encodeURIComponent(id)}`,
      source: "arXiv",
      title,
      url: id,
      score: 0,
      publishedAt: published,
      summary: summary.slice(0, 400),
    };
  });
}

// ————— GitHub Trending（按日）—————
async function fetchGitHubTrending() {
  const html = await getText("https://github.com/trending?since=daily");
  const articles = html.match(/<article class="Box-row">[\s\S]*?<\/article>/g) || [];
  return articles.slice(0, 20).map((block, i) => {
    const href = (block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"/) || [])[1] || "";
    const repo = href.replace(/^\//, "").trim();
    const descRaw = (block.match(/<p class="col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/) || [])[1] || "";
    const starsText = (block.match(/(\d[\d,]*)\s*stars today/) || [])[1] || "0";
    const todayStars = Number(starsText.replace(/,/g, "")) || 0;
    return {
      id: `gh-${i}-${repo || "x"}`,
      source: "GitHub Trending",
      title: repo.replace("/", " / "),
      url: repo ? `https://github.com/${repo}` : "https://github.com/trending",
      score: todayStars,
      summary: decodeEntities(descRaw),
    };
  });
}

const SOURCES = [
  ["Hacker News", fetchHackerNews],
  ["arXiv", fetchArxiv],
  ["GitHub Trending", fetchGitHubTrending],
];

// 与 FDE/现场交付相关的关键词，用于相关性排序（不是硬过滤，避免漏新闻）
const RELEVANCE = [
  "agent", "agentic", "llm", "large language", "rag", "retrieval", "deploy",
  "enterprise", "fine-tun", "multimodal", "copilot", "coding", "autonomous",
  "workflow", "inference", "model context", "mcp", "open-source", "open source",
  "eval", "observab", "governance", "vector", "knowledge", "ai ", "artificial intelligence",
  "smart", "automation", "chatbot", "gpt", "claude", "gemini", "qwen", "deepseek",
];

function relevanceScore(item) {
  const hay = `${item.title} ${item.summary || ""}`.toLowerCase();
  let hits = 0;
  for (const kw of RELEVANCE) if (hay.includes(kw)) hits += 1;
  return hits;
}

/**
 * 采集全部来源。
 * @returns {{ items: Array, status: Object<string, {ok:boolean, count:number, error?:string}> }}
 */
export async function collectAll() {
  const results = await Promise.all(
    SOURCES.map(async ([name, fn]) => {
      try {
        const items = await fn();
        return { name, items, ok: true, error: undefined };
      } catch (error) {
        return { name, items: [], ok: false, error: String(error?.message || error).slice(0, 160) };
      }
    })
  );

  const seen = new Set();
  const all = [];
  const status = {};

  for (const r of results) {
    status[r.name] = { ok: r.ok, count: r.items.length, error: r.error };
    for (const item of r.items) {
      const key = item.url.split("#")[0].replace(/\/$/, "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      all.push({ ...item, relevance: relevanceScore(item) });
    }
  }

  // 先按相关性，再按各源自带热度排序
  all.sort((a, b) => b.relevance - a.relevance || b.score - a.score);
  return { items: all, status };
}
