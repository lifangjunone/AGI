const { translate: bingTranslate } = require("bing-translate-api");

const WORD_PATTERN = /^[A-Za-z]+(?:['’-][A-Za-z]+)?$/;

const offlineEntries = {
  translate: {
    phonetic: "/trænzˈleɪt/",
    partOfSpeech: "verb",
    meaning: "翻译；转化",
    example: "Can you translate this sentence into Chinese?",
    exampleTranslation: "你能把这个句子翻译成中文吗？",
    root: "trans-（跨越）+ lat（携带）→ 把意思带到另一种语言",
  },
  language: {
    phonetic: "/ˈlæŋɡwɪdʒ/",
    partOfSpeech: "noun",
    meaning: "语言",
    example: "Language connects people across cultures.",
    exampleTranslation: "语言连接着不同文化背景的人们。",
    root: "源自拉丁语 lingua，意为“舌头、语言”",
  },
  learn: {
    phonetic: "/lɜːrn/",
    partOfSpeech: "verb",
    meaning: "学习；获悉",
    example: "We learn faster by using new words.",
    exampleTranslation: "通过使用新单词，我们学得更快。",
    root: "源自古英语 leornian，意为“获得知识”",
  },
};

const affixes = [
  ["un", "un-（不、相反）"],
  ["re", "re-（再次、返回）"],
  ["pre", "pre-（在前）"],
  ["inter", "inter-（在……之间）"],
  ["trans", "trans-（跨越、转移）"],
  ["tion", "-tion（名词后缀，行为或状态）", true],
  ["ment", "-ment（名词后缀，结果或状态）", true],
  ["able", "-able（形容词后缀，能够……的）", true],
  ["less", "-less（形容词后缀，没有……的）", true],
  ["ful", "-ful（形容词后缀，充满……的）", true],
];

function deriveRoot(word) {
  const lower = word.toLowerCase();
  const parts = affixes.filter(([affix, , suffix]) =>
    suffix ? lower.endsWith(affix) : lower.startsWith(affix),
  );
  if (!parts.length) return "基础词；暂未找到可靠的词根拆解";
  return parts.map(([, explanation]) => explanation).join(" + ");
}

async function fetchJson(url, timeoutMs = 6500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "HoverTranslator/0.1" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    // #region debug-point H:translation-provider-failure
    fetch("http://127.0.0.1:7777/event", { method: "POST", body: JSON.stringify({ sessionId: "example-hover-dismiss", runId: "translation-failure-pre-fix", hypothesisId: "H", location: "electron/translation.cjs:fetchJson", msg: "[DEBUG] Translation provider request failed", data: { host: new URL(url).hostname, errorName: error?.name || "", errorMessage: error?.message || String(error) }, ts: Date.now() }) }).catch(() => {});
    // #endregion
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function translateWithMyMemory(text) {
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("langpair", "en|zh-CN");
  url.searchParams.set("q", text);
  const data = await fetchJson(url);
  if (data.responseStatus !== 200) throw new Error(data.responseDetails || "Translation unavailable");
  return String(data.responseData?.translatedText || "").trim();
}

async function translateWithBing(text) {
  const data = await bingTranslate(text, "en", "zh-Hans");
  const translated = String(data?.translation || "").trim();
  if (!translated) throw new Error("Bing returned an empty translation");
  return translated;
}

async function translateText(
  text,
  providers = [
    { name: "bing", run: translateWithBing },
    { name: "mymemory", run: translateWithMyMemory },
  ],
) {
  let lastError;
  for (const provider of providers) {
    try {
      return await provider.run(text);
    } catch (error) {
      lastError = error;
      // #region debug-point J:translation-provider-failover
      fetch("http://127.0.0.1:7777/event", { method: "POST", body: JSON.stringify({ sessionId: "example-hover-dismiss", runId: "translation-failure-post-fix", hypothesisId: "J", location: "electron/translation.cjs:translateText", msg: "[DEBUG] Translation provider failed; trying fallback", data: { provider: provider.name, errorName: error?.name || "", errorMessage: error?.message || String(error) }, ts: Date.now() }) }).catch(() => {});
      // #endregion
    }
  }
  throw lastError || new Error("Translation unavailable");
}

const phonemes = {
  AA: "ɑ", AE: "æ", AH: "ʌ", AO: "ɔ", AW: "aʊ", AY: "aɪ",
  B: "b", CH: "tʃ", D: "d", DH: "ð", EH: "ɛ", ER: "ɝ", EY: "eɪ",
  F: "f", G: "ɡ", HH: "h", IH: "ɪ", IY: "i", JH: "dʒ", K: "k",
  L: "l", M: "m", N: "n", NG: "ŋ", OW: "oʊ", OY: "ɔɪ", P: "p",
  R: "r", S: "s", SH: "ʃ", T: "t", TH: "θ", UH: "ʊ", UW: "u",
  V: "v", W: "w", Y: "j", Z: "z", ZH: "ʒ",
};

function arpabetToIPA(value) {
  if (!value) return "";
  const converted = value
    .trim()
    .split(/\s+/)
    .map((token) => {
      const stress = token.match(/[12]$/) ? "ˈ" : "";
      return `${stress}${phonemes[token.replace(/[012]$/, "")] || token.toLowerCase()}`;
    })
    .join("");
  return converted ? `/${converted}/` : "";
}

const partNames = { n: "noun", v: "verb", adj: "adjective", adv: "adverb", u: "unknown" };

async function lookupDictionary(word) {
  const dictionaryUrl = new URL("https://api.datamuse.com/words");
  dictionaryUrl.searchParams.set("sp", word);
  dictionaryUrl.searchParams.set("md", "dpr");
  dictionaryUrl.searchParams.set("max", "1");
  const exampleUrl = new URL("https://api.tatoeba.org/unstable/sentences");
  exampleUrl.searchParams.set("lang", "eng");
  exampleUrl.searchParams.set("q", word);
  exampleUrl.searchParams.set("sort", "relevance");
  exampleUrl.searchParams.set("limit", "3");

  const [dictionaryData, exampleData] = await Promise.all([
    fetchJson(dictionaryUrl),
    fetchJson(exampleUrl).catch(() => ({ data: [] })),
  ]);
  const entry = dictionaryData[0] || {};
  const definition = entry.defs?.[0] || "";
  const [definitionPart, definitionText] = definition.split(/\t(.+)/s);
  const pronunciation = entry.tags?.find((tag) => tag.startsWith("pron:"))?.slice(5) || "";
  const part = definitionPart || entry.tags?.find((tag) => partNames[tag]) || "u";
  return {
    phonetic: arpabetToIPA(pronunciation),
    partOfSpeech: partNames[part] || part,
    definition: definitionText || "",
    example: exampleData.data?.find((item) =>
      new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(item.text),
    )?.text || "",
  };
}

function createTranslationService() {
  const cache = new Map();

  return async function translate(query) {
    const text = String(query || "").trim().replace(/\s+/g, " ");
    if (!text) throw new Error("没有可翻译的文字");
    if (text.length > 1200) throw new Error("选中文字过长，请缩短后重试");
    const key = text.toLowerCase();
    if (cache.has(key)) return cache.get(key);

    const isWord = WORD_PATTERN.test(text);
    const fallback = offlineEntries[key];
    let translated = fallback?.meaning || "";
    let dictionary = fallback || {};
    let source = fallback ? "offline" : "online";

    const jobs = [
      translated
        ? Promise.resolve(translated)
        : translateText(text).catch(() => ""),
      isWord && !fallback
        ? lookupDictionary(text).catch(() => ({}))
        : Promise.resolve(dictionary),
    ];
    [translated, dictionary] = await Promise.all(jobs);
    if (!translated) {
      // #region debug-point I:no-translation-result
      fetch("http://127.0.0.1:7777/event", { method: "POST", body: JSON.stringify({ sessionId: "example-hover-dismiss", runId: "translation-failure-pre-fix", hypothesisId: "I", location: "electron/translation.cjs:createTranslationService", msg: "[DEBUG] No translation provider returned a result", data: { query: text, isWord, hasDictionaryData: Boolean(dictionary?.definition || dictionary?.phonetic) }, ts: Date.now() }) }).catch(() => {});
      // #endregion
      throw new Error("当前无法连接翻译服务");
    }

    const example = dictionary.example || (isWord ? `I want to learn how to use “${text}” naturally.` : "");
    const exampleTranslation =
      dictionary.exampleTranslation ||
      (example ? await translateText(example).catch(() => "") : "");
    const result = {
      query: text,
      translation: translated,
      isWord,
      phonetic: dictionary.phonetic || "",
      partOfSpeech: dictionary.partOfSpeech || (isWord ? "word" : "sentence"),
      definition: dictionary.definition || "",
      example,
      exampleTranslation,
      root: isWord ? dictionary.root || deriveRoot(text) : "",
      source,
    };
    // #region debug-point A:example-result-shape
    fetch("http://127.0.0.1:7777/event", { method: "POST", body: JSON.stringify({ sessionId: "example-hover-dismiss", runId: "post-fix-3", hypothesisId: "A", location: "electron/translation.cjs:createTranslationService", msg: "[DEBUG] Translation result example fields", data: { query: text, hasExample: Boolean(result.example), hasExampleTranslation: Boolean(result.exampleTranslation), source }, ts: Date.now() }) }).catch(() => {});
    // #endregion
    cache.set(key, result);
    return result;
  };
}

module.exports = { createTranslationService, deriveRoot, translateText };
