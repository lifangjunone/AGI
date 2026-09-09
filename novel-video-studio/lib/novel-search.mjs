import { loadSourceRegistry } from "./source-registry.mjs";
import { findRecommendation } from "./recommendations.mjs";

const REQUEST_TIMEOUT_MS = 15000;

function normalize(value) {
  return String(value || "").toLocaleLowerCase().replace(/[\s·:：\-—_《》"'“”‘’]/g, "");
}

export function titleScore(query, candidate) {
  const left = normalize(query);
  const right = normalize(candidate);
  if (!left || !right) return 0;
  if (left === right) return 100;
  if (right.includes(left) || left.includes(right)) return 80;
  const overlap = [...new Set(left)].filter((character) => right.includes(character)).length;
  return Math.round((overlap / Math.max(left.length, right.length)) * 60);
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchResponse(url, options = {}, timeout = REQUEST_TIMEOUT_MS) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeout),
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) NovelVideoStudio/0.2",
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

async function fetchJson(url, options = {}, timeout) {
  return (await fetchResponse(url, options, timeout)).json();
}

async function fetchText(url, options = {}, timeout) {
  return (await fetchResponse(url, options, timeout)).text();
}

async function executeSearch({ id, provider, kind, queryUrl, enabled = true }, search) {
  const startedAt = Date.now();
  if (!enabled) {
    return {
      candidates: [],
      run: { id, provider, kind, queryUrl, status: "skipped", candidateCount: 0, durationMs: 0, error: "未启用" }
    };
  }
  try {
    const candidates = await search();
    return {
      candidates,
      run: {
        id,
        provider,
        kind,
        queryUrl,
        status: "completed",
        candidateCount: candidates.length,
        durationMs: Date.now() - startedAt,
        error: null
      }
    };
  } catch (error) {
    return {
      candidates: [],
      run: {
        id,
        provider,
        kind,
        queryUrl,
        status: "failed",
        candidateCount: 0,
        durationMs: Date.now() - startedAt,
        error: error.message
      }
    };
  }
}

function isSourceDomain(url, domains) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function parse360Results(html, title, source) {
  const candidates = [];
  for (const match of html.matchAll(/<li[^>]*class=["'][^"']*\bres-list\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)) {
    const block = match[1];
    const urlMatch = block.match(/data-mdurl=["']([^"']+)["']/i);
    const headingMatch = block.match(/<h3[^>]*class=["'][^"']*\bres-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i);
    if (!urlMatch || !headingMatch) continue;
    const sourceUrl = decodeHtml(urlMatch[1]);
    if (source?.domains && !isSourceDomain(sourceUrl, source.domains)) continue;
    const candidateTitle = decodeHtml(headingMatch[1]);
    const score = titleScore(title, candidateTitle);
    if (score < 35) continue;
    const blockText = decodeHtml(block);
    const authorMatch = blockText.match(/作者[:：]\s*([^\s，,]{1,30})/);
    candidates.push({
      id: `cn-${source?.id || "web"}-${candidates.length}-${Buffer.from(sourceUrl).toString("base64url").slice(0, 10)}`,
      title: candidateTitle.slice(0, 120),
      authors: authorMatch?.[1] || "待核验",
      source: source?.name || new URL(sourceUrl).hostname,
      sourceId: source?.id || "cn-web",
      rights: source?.rights || "rights-review-required",
      score,
      contentUrl: null,
      sourceUrl,
      description: blockText.slice(0, 320)
    });
    if (candidates.length >= (source ? 4 : 10)) break;
  }
  return candidates;
}

function domesticSearchUrl(title, domain) {
  const query = domain ? `site:${domain} "${title}" 小说` : `"${title}" 小说 作者`;
  return `https://www.so.com/s?q=${encodeURIComponent(query)}`;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function searchConfiguredSource(title, source) {
  const queryUrl = domesticSearchUrl(title, source.domains[0]);
  const knownCandidates = (source.knownBooks || [])
    .filter((book) => titleScore(title, book.title) >= 80)
    .map((book) => ({
      id: `catalog-${source.id}-${normalize(book.title)}`,
      title: book.title,
      authors: book.authors,
      source: source.name,
      sourceId: source.id,
      rights: source.rights,
      score: 100,
      contentUrl: null,
      sourceUrl: book.url,
      description: book.description || ""
    }));
  const result = await executeSearch({
    id: `source-${source.id}`,
    provider: source.name,
    kind: "domestic-site",
    queryUrl,
    enabled: source.enabled
  }, async () => {
    const html = await fetchText(queryUrl, {}, 12000);
    return [...knownCandidates, ...parse360Results(html, title, source)];
  });
  if (result.run.status === "failed" && knownCandidates.length) {
    result.candidates = knownCandidates;
    result.run.status = "degraded";
    result.run.candidateCount = knownCandidates.length;
    result.run.error = `在线检索失败，使用已配置精确候选：${result.run.error}`;
  }
  return result;
}

async function searchDomesticWeb(title, enabled) {
  const queryUrl = domesticSearchUrl(title);
  return executeSearch({
    id: "cn-web-360",
    provider: "360 搜索（国内全网）",
    kind: "domestic-web",
    queryUrl,
    enabled
  }, async () => parse360Results(await fetchText(queryUrl, {}, 12000), title));
}

async function searchGutendex(title) {
  const queryUrl = `https://gutendex.com/books/?search=${encodeURIComponent(title)}`;
  return executeSearch({
    id: "gutendex",
    provider: "Project Gutenberg",
    kind: "public-domain",
    queryUrl
  }, async () => {
    const payload = await fetchJson(queryUrl);
    return payload.results.slice(0, 6).map((book) => ({
      id: `gutenberg-${book.id}`,
      title: book.title,
      authors: book.authors.map((author) => author.name).join("、") || "未知",
      source: "Project Gutenberg",
      sourceId: "gutenberg",
      rights: "public-domain",
      score: titleScore(title, book.title),
      contentUrl: book.formats["text/plain; charset=utf-8"] || book.formats["text/plain; charset=us-ascii"] || null,
      sourceUrl: `https://www.gutenberg.org/ebooks/${book.id}`,
      languages: book.languages
    }));
  });
}

async function searchOpenLibrary(title) {
  const queryUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=6&fields=key,title,author_name,first_publish_year,public_scan_b`;
  return executeSearch({
    id: "open-library",
    provider: "Open Library",
    kind: "catalog",
    queryUrl
  }, async () => {
    const payload = await fetchJson(queryUrl);
    return payload.docs.map((book) => ({
      id: `openlibrary-${String(book.key || "").split("/").pop()}`,
      title: book.title,
      authors: (book.author_name || []).join("、") || "未知",
      source: "Open Library",
      sourceId: "open-library",
      rights: book.public_scan_b ? "public-domain-candidate" : "metadata-only",
      score: titleScore(title, book.title),
      contentUrl: null,
      sourceUrl: `https://openlibrary.org${book.key}`,
      year: book.first_publish_year || null
    }));
  });
}

async function searchGoogleBooks(title) {
  const queryUrl = `https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(title)}&maxResults=6`;
  return executeSearch({
    id: "google-books",
    provider: "Google Books",
    kind: "catalog",
    queryUrl
  }, async () => {
    const payload = await fetchJson(queryUrl);
    return (payload.items || []).map((item) => ({
      id: `google-${item.id}`,
      title: item.volumeInfo?.title || title,
      authors: (item.volumeInfo?.authors || []).join("、") || "未知",
      source: "Google Books",
      sourceId: "google-books",
      rights: item.accessInfo?.publicDomain ? "public-domain" : "metadata-only",
      score: titleScore(title, item.volumeInfo?.title),
      contentUrl: null,
      sourceUrl: item.volumeInfo?.infoLink || null,
      description: item.volumeInfo?.description || ""
    }));
  });
}

async function searchBrave(title, apiKey) {
  const queryUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(`"${title}" 小说 作者`)}`;
  return executeSearch({
    id: "brave",
    provider: "Brave Search",
    kind: "global-web",
    queryUrl,
    enabled: Boolean(apiKey)
  }, async () => {
    const payload = await fetchJson(queryUrl, {
      headers: { "X-Subscription-Token": apiKey, Accept: "application/json" }
    });
    return (payload.web?.results || []).slice(0, 8).map((result, index) => ({
      id: `web-${index}`,
      title: result.title,
      authors: "待核验",
      source: new URL(result.url).hostname,
      sourceId: "brave",
      rights: "rights-review-required",
      score: titleScore(title, result.title),
      contentUrl: null,
      sourceUrl: result.url,
      description: result.description || ""
    }));
  });
}

const BUILTIN_CLASSICS = [
  ["西游记", "吴承恩", "明代神魔小说，讲述唐僧师徒西行取经及降妖除魔的旅程。", [], "https://zh.wikisource.org/wiki/西遊記"],
  ["三国演义", "罗贯中", "东汉末年至西晋初年的群雄征战、政治联盟与英雄命运。", [], "https://zh.wikisource.org/wiki/三國演義"],
  ["水浒传", "施耐庵", "梁山好汉聚义、抗争与招安的群像叙事。", [], "https://zh.wikisource.org/wiki/水滸傳"],
  ["红楼梦", "曹雪芹", "贾府兴衰与宝黛爱情交织的家族史诗。", [], "https://zh.wikisource.org/wiki/紅樓夢"],
  ["Alice's Adventures in Wonderland", "Lewis Carroll", "Alice follows a White Rabbit into Wonderland and encounters its strange inhabitants.", ["Alice in Wonderland", "爱丽丝梦游仙境"], "https://www.gutenberg.org/ebooks/11"],
  ["Pride and Prejudice", "Jane Austen", "Elizabeth Bennet navigates family expectations, social class, and her changing judgment of Mr Darcy.", ["傲慢与偏见"], "https://www.gutenberg.org/ebooks/1342"],
  ["Moby-Dick", "Herman Melville", "Ishmael joins Captain Ahab's obsessive pursuit of the white whale.", ["Moby Dick", "白鲸"], "https://www.gutenberg.org/ebooks/2701"],
  ["Frankenstein", "Mary Shelley", "Victor Frankenstein creates life and confronts the consequences of abandoning his creation.", ["弗兰肯斯坦"], "https://www.gutenberg.org/ebooks/84"]
];

async function builtinClassic(title) {
  const recommendation = await findRecommendation(title);
  if (recommendation) {
    return {
      candidates: [{
        id: `recommendation-${recommendation.id}`,
        title: recommendation.title,
        authors: recommendation.author,
        source: recommendation.source,
        sourceId: "public-domain-recommendations",
        rights: "public-domain",
        score: 100,
        contentUrl: recommendation.contentUrl,
        sourceUrl: recommendation.sourceUrl,
        description: recommendation.summary
      }],
      run: {
        id: "public-domain-recommendations",
        provider: "公版热门推荐",
        kind: "curated-catalog",
        queryUrl: recommendation.sourceUrl,
        status: "completed",
        candidateCount: 1,
        durationMs: 0,
        error: null
      }
    };
  }
  const classic = BUILTIN_CLASSICS.find(([name, , , aliases]) =>
    [name, ...aliases].some((candidate) => titleScore(title, candidate) >= 80)
  );
  if (!classic) return { candidates: [], run: null };
  return {
    candidates: [{
      id: `classic-${normalize(classic[0])}`,
      title: classic[0],
      authors: classic[1],
      source: "公版名著目录",
      sourceId: "builtin-classics",
      rights: "public-domain",
      score: 100,
      contentUrl: null,
      sourceUrl: classic[4],
      description: classic[2]
    }],
    run: {
      id: "builtin-classics",
      provider: "公版名著目录",
      kind: "local-catalog",
      queryUrl: classic[4],
      status: "completed",
      candidateCount: 1,
      durationMs: 0,
      error: null
    }
  };
}

export async function searchNovel(title, options = {}) {
  const configuredSources = await loadSourceRegistry(options);
  const [baseResults, configuredResults] = await Promise.all([
    Promise.all([
    searchDomesticWeb(title, options.domesticWebSearch !== false),
    searchGutendex(title),
    searchOpenLibrary(title),
    searchGoogleBooks(title),
    searchBrave(title, options.braveApiKey)
    ]),
    mapWithConcurrency(
      configuredSources.filter((source) => !["gutenberg", "open-library"].includes(source.id)),
      6,
      (source) => searchConfiguredSource(title, source)
    )
  ]);
  const settled = [...baseResults, ...configuredResults];
  const classic = await builtinClassic(title);
  if (classic.run) settled.push(classic);
  const candidates = settled.flatMap((result) => result.candidates)
    .sort((a, b) => b.score - a.score)
    .filter((item, index, all) =>
      item.sourceUrl
      && index === all.findIndex((candidate) => candidate.sourceUrl === item.sourceUrl)
    );
  return {
    candidates,
    searches: settled.map((result) => result.run).filter(Boolean),
    configuredSources: configuredSources.map(({ id, name, domains, rights, enabled }) => ({
      id, name, domains, rights, enabled
    }))
  };
}

export async function loadAuthorizedText(candidate) {
  if (!candidate?.contentUrl || candidate.rights !== "public-domain") return "";
  const response = await fetchResponse(candidate.contentUrl);
  return (await response.text()).slice(0, 800_000);
}
