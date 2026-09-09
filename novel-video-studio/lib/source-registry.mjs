import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const RIGHTS = new Set(["metadata-only", "rights-review-required", "public-domain-candidate"]);
const DOWNLOAD_FORMATS = new Set(["EPUB", "TXT", "PDF", "HTML"]);
export const BLOCKED_SOURCE_DOMAINS = Object.freeze([
  "cn-qidianzww.com.cn",
  "hetushu.com",
  "www.hetushu.com"
]);

function normalizeDomain(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^\.+|\.+$/g, "");
}

function safeId(value, fallback) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function compactText(value, limit = 240) {
  return String(value || "").trim().slice(0, limit);
}

function officialUrl(value, domains) {
  try {
    const url = new URL(String(value || `https://${domains[0]}/`));
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    if (!domains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) throw new Error();
    return url.href;
  } catch {
    return `https://${domains[0]}/`;
  }
}

function sanitizeBook(book, domains) {
  const title = String(book?.title || "").trim().slice(0, 100);
  const authors = String(book?.authors || "待核验").trim().slice(0, 100);
  const description = String(book?.description || "").trim().slice(0, 500);
  let url;
  try {
    url = new URL(String(book?.url || ""));
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !domains.some((domain) =>
    url.hostname === domain || url.hostname.endsWith(`.${domain}`)
  )) return null;
  if (!title) return null;
  return { title, authors, url: url.href, description };
}

export function sanitizeSources(input) {
  if (!Array.isArray(input)) throw new Error("sources 必须是数组");
  return input.slice(0, 30).map((source, index) => {
    const domains = [...new Set((source?.domains || [source?.domain])
      .map(normalizeDomain)
      .filter((domain) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain))
    )].slice(0, 5);
    const name = String(source?.name || "").trim().slice(0, 40);
    if (!name || domains.length === 0) throw new Error(`第 ${index + 1} 个来源缺少有效名称或域名`);
    if (domains.some((domain) => BLOCKED_SOURCE_DOMAINS.includes(domain))) {
      throw new Error(`域名 ${domains.find((domain) => BLOCKED_SOURCE_DOMAINS.includes(domain))} 已列入安全与版权拒绝名单`);
    }
    const id = safeId(source?.id, `source-${index + 1}`);
    const rights = RIGHTS.has(source?.rights) ? source.rights : "rights-review-required";
    return {
      id,
      name,
      domains,
      rights,
      enabled: source?.enabled !== false,
      category: compactText(source?.category, 40) || "其他",
      officialUrl: officialUrl(source?.officialUrl, domains),
      freeMode: compactText(source?.freeMode, 60) || "以站点当前页面为准",
      topics: (source?.topics || []).map((item) => compactText(item, 30)).filter(Boolean).slice(0, 12),
      registration: compactText(source?.registration, 40) || "可选",
      webReading: source?.webReading !== false,
      downloads: [...new Set((source?.downloads || []).map((item) => String(item).toUpperCase()).filter((item) => DOWNLOAD_FORMATS.has(item)))],
      ads: compactText(source?.ads, 60) || "未核验",
      copyrightNote: compactText(source?.copyrightNote, 500),
      safetyNote: compactText(source?.safetyNote, 300),
      automation: compactText(source?.automation, 60) || "discovery-only",
      availability: {
        checkedAt: compactText(source?.availability?.checkedAt, 20),
        status: compactText(source?.availability?.status, 30) || "unknown",
        httpStatus: Number(source?.availability?.httpStatus || 0) || null,
        note: compactText(source?.availability?.note, 160)
      },
      knownBooks: (source?.knownBooks || [])
        .map((book) => sanitizeBook(book, domains))
        .filter(Boolean)
        .slice(0, 100)
    };
  });
}

async function readRegistry(file) {
  const payload = JSON.parse(await readFile(file, "utf8"));
  return sanitizeSources(payload.sources);
}

export async function loadSourceRegistry({ sourceConfigFile, defaultSourceConfigFile }) {
  if (sourceConfigFile) {
    try {
      return await readRegistry(sourceConfigFile);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (defaultSourceConfigFile) return readRegistry(defaultSourceConfigFile);
  return [];
}

export async function saveSourceRegistry({ sourceConfigFile }, sources) {
  const sanitized = sanitizeSources(sources);
  await mkdir(path.dirname(sourceConfigFile), { recursive: true });
  const temporary = `${sourceConfigFile}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ version: 1, sources: sanitized }, null, 2)}\n`, "utf8");
  await rename(temporary, sourceConfigFile);
  return sanitized;
}
