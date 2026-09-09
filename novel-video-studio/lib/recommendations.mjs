import { readFile } from "node:fs/promises";

const DEFAULT_FILE = new URL("../config/public-domain-recommendations.json", import.meta.url);
const TRUSTED_HOSTS = new Set([
  "zh.wikisource.org",
  "www.gutenberg.org",
  "gutenberg.org",
  "standardebooks.org"
]);

function trustedUrl(value, required = true) {
  if (!value && !required) return null;
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:" || !TRUSTED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error(`推荐作品包含未受信任来源：${url.hostname || value}`);
  }
  return url.href;
}

export function sanitizeRecommendations(payload) {
  const ids = new Set();
  const items = (payload?.items || []).map((item, index) => {
    const id = String(item?.id || "").trim();
    const title = String(item?.title || "").trim();
    const author = String(item?.author || "").trim();
    if (!id || !title || !author || ids.has(id)) throw new Error(`第 ${index + 1} 个推荐作品无效`);
    ids.add(id);
    return {
      id,
      rank: Number(item.rank || index + 1),
      title: title.slice(0, 120),
      author: author.slice(0, 80),
      language: item.language === "英文" ? "英文" : "中文",
      genre: String(item.genre || "经典文学").slice(0, 40),
      year: String(item.year || "年代待考").slice(0, 20),
      source: String(item.source || "").slice(0, 80),
      sourceUrl: trustedUrl(item.sourceUrl),
      contentUrl: trustedUrl(item.contentUrl, false),
      rightsEvidenceUrl: trustedUrl(item.rightsEvidenceUrl),
      formats: [...new Set((item.formats || []).map(String))].slice(0, 6),
      summary: String(item.summary || "").slice(0, 360),
      popularReason: String(item.popularReason || "").slice(0, 240),
      tags: [...new Set((item.tags || []).map(String))].slice(0, 6),
      popularityScore: Math.max(0, Math.min(100, Number(item.popularityScore || 0))),
      rights: "public-domain",
      requiresAuthorization: false,
      verifiedAt: String(payload.verifiedAt || "")
    };
  });
  return {
    verifiedAt: String(payload?.verifiedAt || ""),
    popularityBasis: String(payload?.popularityBasis || ""),
    items: items.sort((left, right) => left.rank - right.rank)
  };
}

export async function loadRecommendations(file = DEFAULT_FILE) {
  return sanitizeRecommendations(JSON.parse(await readFile(file, "utf8")));
}

export async function findRecommendation(title) {
  const normalized = String(title || "").toLocaleLowerCase().replace(/[\s·:：\-—_《》"'“”‘’]/g, "");
  const { items } = await loadRecommendations();
  return items.find((item) =>
    item.title.toLocaleLowerCase().replace(/[\s·:：\-—_《》"'“”‘’]/g, "") === normalized
  ) || null;
}
