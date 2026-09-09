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

async function fetchJson(url, options = {}, timeout = REQUEST_TIMEOUT_MS) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeout),
    headers: { "User-Agent": "NovelVideoStudio/0.1", ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error(`检索服务返回 ${response.status}`);
  return response.json();
}

async function searchGutendex(title, timeout) {
  const payload = await fetchJson(`https://gutendex.com/books/?search=${encodeURIComponent(title)}`, {}, timeout);
  return payload.results.slice(0, 6).map((book) => ({
    id: `gutenberg-${book.id}`,
    title: book.title,
    authors: book.authors.map((author) => author.name).join("、") || "未知",
    source: "Project Gutenberg",
    rights: "public-domain",
    score: titleScore(title, book.title),
    contentUrl: book.formats["text/plain; charset=utf-8"] || book.formats["text/plain; charset=us-ascii"] || null,
    sourceUrl: `https://www.gutenberg.org/ebooks/${book.id}`,
    languages: book.languages
  }));
}

async function searchOpenLibrary(title, timeout) {
  const payload = await fetchJson(
    `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=6&fields=key,title,author_name,first_publish_year,public_scan_b`,
    {},
    timeout
  );
  return payload.docs.map((book) => ({
    id: `openlibrary-${String(book.key || "").split("/").pop()}`,
    title: book.title,
    authors: (book.author_name || []).join("、") || "未知",
    source: "Open Library",
    rights: book.public_scan_b ? "public-domain-candidate" : "metadata-only",
    score: titleScore(title, book.title),
    contentUrl: null,
    sourceUrl: `https://openlibrary.org${book.key}`,
    year: book.first_publish_year || null
  }));
}

async function searchGoogleBooks(title, timeout) {
  const payload = await fetchJson(
    `https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(title)}&maxResults=6`,
    {},
    timeout
  );
  return (payload.items || []).map((item) => ({
    id: `google-${item.id}`,
    title: item.volumeInfo?.title || title,
    authors: (item.volumeInfo?.authors || []).join("、") || "未知",
    source: "Google Books",
    rights: item.accessInfo?.publicDomain ? "public-domain" : "metadata-only",
    score: titleScore(title, item.volumeInfo?.title),
    contentUrl: null,
    sourceUrl: item.volumeInfo?.infoLink || null,
    description: item.volumeInfo?.description || ""
  }));
}

async function searchBrave(title, apiKey) {
  if (!apiKey) return [];
  const payload = await fetchJson(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(`"${title}" 小说 正文`)}`,
    { headers: { "X-Subscription-Token": apiKey, Accept: "application/json" } }
  );
  return (payload.web?.results || []).slice(0, 8).map((result, index) => ({
    id: `web-${index}`,
    title: result.title,
    authors: "待核验",
    source: new URL(result.url).hostname,
    rights: "rights-review-required",
    score: titleScore(title, result.title),
    contentUrl: null,
    sourceUrl: result.url,
    description: result.description || ""
  }));
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

export async function searchNovel(title, { braveApiKey = "" } = {}) {
  const settled = await Promise.allSettled([
    searchGutendex(title),
    searchOpenLibrary(title),
    searchGoogleBooks(title),
    searchBrave(title, braveApiKey)
  ]);
  const results = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (results.length === 0) {
    const retries = await Promise.allSettled([
      searchGutendex(title, 30000),
      searchOpenLibrary(title, 30000),
      searchGoogleBooks(title, 30000)
    ]);
    results.push(...retries.flatMap((result) => result.status === "fulfilled" ? result.value : []));
  }
  const classic = BUILTIN_CLASSICS.find(([name, , , aliases]) =>
    [name, ...aliases].some((candidate) => titleScore(title, candidate) >= 80)
  );
  if (classic) {
    results.push({
      id: `classic-${normalize(classic[0])}`,
      title: classic[0],
      authors: classic[1],
      source: "公版名著目录",
      rights: "public-domain",
      score: 100,
      contentUrl: null,
      sourceUrl: classic[4],
      description: classic[2]
    });
  }
  return results.sort((a, b) => b.score - a.score).filter(
    (item, index, all) => index === all.findIndex((candidate) => candidate.sourceUrl === item.sourceUrl && candidate.title === item.title)
  );
}

export async function loadAuthorizedText(candidate) {
  if (!candidate?.contentUrl || candidate.rights !== "public-domain") return "";
  const response = await fetch(candidate.contentUrl, {
    signal: AbortSignal.timeout(15000),
    headers: { "User-Agent": "NovelVideoStudio/0.1" }
  });
  if (!response.ok) throw new Error(`正文下载失败: ${response.status}`);
  return (await response.text()).slice(0, 800_000);
}
