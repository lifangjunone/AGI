import { mkdir, readFile, writeFile, readdir, rename, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import WebSocket from "ws";

const MAX_NOVEL_CHARACTERS = 1_000_000;
const MAX_WEB_SOURCE_CHARACTERS = 1_000_000;
const MAX_EPISODES = 2_000;
const SOURCE_PREVIEW_CHARACTERS = 320;

function safeText(value, maxLength = 4000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function parseJsonContent(content) {
  const text = String(content || "").trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("语言模型没有返回有效 JSON");
  }
}

function slugId(prefix, index) {
  return `${prefix}-${index + 1}`;
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function htmlToText(html) {
  return decodeEntities(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(p|br|div|section|article|h[1-6]|li)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n"))
    .trim();
}

function isPrivateIp(address) {
  const family = isIP(address);
  if (family === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 169 && b === 254) || a === 0;
  }
  if (family === 6) return address === "::1" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:");
  return false;
}

async function assertPublicUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("仅支持 HTTP/HTTPS 小说地址");
  if (["localhost", "localhost.localdomain"].includes(url.hostname.toLowerCase())) throw new Error("不读取本机地址");
  const records = await lookup(url.hostname, { all: true, verbatim: true });
  if (!records.length || records.some(record => isPrivateIp(record.address))) throw new Error("为安全起见，不读取内网或本机地址");
  return url;
}

function qidianMobileUrl(url) {
  const match = url.pathname.match(/^\/(?:book|info)\/(\d+)\/?$/) ||
    url.pathname.match(/^\/chapter\/(\d+)\/(\d+)\/?$/);
  if (!match || !/(^|\.)qidian\.com$/i.test(url.hostname)) return null;
  if (match[2]) return new URL(`https://m.qidian.com/chapter/${match[1]}/${match[2]}/`);
  return new URL(`https://m.qidian.com/book/${match[1]}/`);
}

function extractVitePageData(html) {
  const match = String(html).match(/<script[^>]+id=["']vite-plugin-ssr_pageContext["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1])?.pageContext?.pageProps?.pageData || null;
  } catch {
    return null;
  }
}

function normalizeNovelText(value) {
  return String(value || "")
    .replace(/\\[rnt]/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n[ \t\f\v]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseQidianPage(html, finalUrl) {
  const pageData = extractVitePageData(html);
  const bookInfo = pageData?.bookInfo || {};
  const chapterInfo = pageData?.chapterContentInfo || {};
  const firstChapterTitle = textOrNull(chapterInfo.firstChapterT);
  const firstChapterContent = normalizeNovelText(chapterInfo.firstChapterC);
  const intro = normalizeNovelText(bookInfo.desc);
  const title = textOrNull(bookInfo.bookName) || textOrNull(firstChapterTitle);
  const content = [firstChapterTitle ? `《${firstChapterTitle}》` : "", firstChapterContent || intro]
    .filter(Boolean).join("\n\n");
  if ([...content].length < 80) return null;
  return {
    url: finalUrl,
    canonicalUrl: `https://www.qidian.com/book/${bookInfo.bookId || ""}/`,
    provider: "qidian",
    importMethod: "qidian_mobile_ssr",
    title,
    author: textOrNull(bookInfo.authorName),
    description: intro,
    content: normalizeNovelText(content).slice(0, MAX_WEB_SOURCE_CHARACTERS),
    characters: [...content].length,
    truncated: [...content].length > MAX_WEB_SOURCE_CHARACTERS,
    sourceScope: firstChapterContent ? "chapter_sample" : "book_intro",
    chapter: firstChapterTitle ? {
      id: chapterInfo.firstChapterId || null,
      title: firstChapterTitle,
      nextChapterId: chapterInfo.nextChapterId || null,
    } : null,
    book: {
      id: bookInfo.bookId || null,
      name: title,
      category: [bookInfo.chanName, bookInfo.subCateName].filter(Boolean).join(" · "),
      words: bookInfo.showWordsCnt || bookInfo.wordsCnt || null,
      status: bookInfo.bookStatus || bookInfo.actionStatus || null,
      isVip: Boolean(bookInfo.isVip),
      signStatus: bookInfo.signStatus || null,
    },
  };
}

export function fetchSourceFromUrlForTest(rawUrl, html) {
  const originalUrl = new URL(rawUrl);
  const normalizedUrl = qidianMobileUrl(originalUrl) || originalUrl;
  const qidian = parseQidianPage(html, normalizedUrl.href);
  if (qidian) return { ...qidian, requestedUrl: originalUrl.href };
  const extracted = htmlToText(html);
  const content = normalizeNovelText(extracted).slice(0, MAX_WEB_SOURCE_CHARACTERS);
  if ([...content].length < 80) throw new Error("未读取到足够正文，请粘贴章节内容");
  return {
    url: normalizedUrl.href, content, characters: [...content].length,
    truncated: [...extracted].length > MAX_WEB_SOURCE_CHARACTERS,
    sourceScope: [...extracted].length > MAX_WEB_SOURCE_CHARACTERS ? "truncated_sample" : "complete_page",
  };
}

function textOrNull(value) {
  const result = safeText(value, 200);
  return result || null;
}

async function fetchSourceFromUrl(rawUrl) {
  const originalUrl = await assertPublicUrl(rawUrl);
  const url = qidianMobileUrl(originalUrl) || originalUrl;
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "accept": "text/html,text/plain;q=0.9,*/*;q=0.1",
      "user-agent": qidianMobileUrl(originalUrl)
        ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 NovelSeriesFactory/0.1"
        : "NovelSeriesFactory/0.1 (+desktop-authorized-import)",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`小说地址读取失败：HTTP ${response.status}`);
  const type = response.headers.get("content-type") || "";
  if (!/text\/html|text\/plain|application\/xhtml\+xml/i.test(type)) throw new Error("该地址不是可读取的文本页面");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 600_000) throw new Error("页面过大，请粘贴正文或导入章节 TXT");
    chunks.push(value);
  }
  const html = new TextDecoder("utf-8").decode(Buffer.concat(chunks));
  if (/(^|\.)qidian\.com$/i.test(url.hostname)) {
    const qidian = parseQidianPage(html, response.url || url.href);
    if (qidian) return { ...qidian, requestedUrl: originalUrl.href };
    if (/probe\.js|buid\s*=/.test(html)) {
      throw new Error("起点页面需要浏览器验证，无法自动读取；请导入 TXT 或使用浏览器授权后再试");
    }
  }
  const extracted = type.includes("text/plain") ? html : htmlToText(html);
  const text = normalizeNovelText(extracted).slice(0, MAX_WEB_SOURCE_CHARACTERS);
  if ([...text].length < 80) throw new Error("未读取到足够正文，请粘贴章节内容");
  return {
    url: url.href, content: text, characters: [...text].length,
    truncated: [...extracted].length > MAX_WEB_SOURCE_CHARACTERS,
    sourceScope: [...extracted].length > MAX_WEB_SOURCE_CHARACTERS ? "truncated_sample" : "complete_page",
  };
}

function splitSentences(text) {
  const normalized = normalizeNovelText(text);
  const sentences = normalized
    .split(/(?<=[。！？!?；;])/u)
    .map((item) => item.trim())
    .filter(Boolean);
  if (sentences.length >= 3) return sentences;
  const chunks = normalized.match(/.{1,42}/gu) || [];
  return chunks.filter(Boolean);
}

export function wrapSubtitleText(text, width = 18, maxLines = 4) {
  const value = safeText(text, 12000);
  if (!value) return "";
  const latinDominant = (value.match(/[\p{Script=Latin}\p{N}]/gu) || []).length >
    (value.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) || []).length;
  if (!latinDominant) {
    const characters = [...value];
    const rows = [];
    while (characters.length) rows.push(characters.splice(0, width).join(""));
    return rows.slice(0, maxLines).join("\n");
  }

  const tokens = value.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*|[^\s\p{L}\p{N}]/gu) || [];
  const rows = [];
  let row = "";
  for (const token of tokens) {
    const punctuation = /^[^\p{L}\p{N}]+$/u.test(token);
    const separator = row && !punctuation ? " " : "";
    if ([...`${row}${separator}${token}`].length <= width) {
      row += `${separator}${token}`;
      continue;
    }
    if (row) rows.push(row);
    row = "";
    if ([...token].length <= width) {
      row = token;
      continue;
    }
    const characters = [...token];
    while (characters.length > width) rows.push(characters.splice(0, width).join(""));
    row = characters.join("");
  }
  if (row) rows.push(row);
  return rows.slice(0, maxLines).join("\n");
}

function buildStory(input, episodePlan = null) {
  const title = safeText(input.title, 80) || `未命名故事-${new Date().toISOString().slice(0, 10)}`;
  const source = safeText(episodePlan?.summary || input.content || input.premise, 12000);
  if (!source) throw new Error("请填写小说正文或原创剧情描述");

  const sentences = splitSentences(source);
  const fallback = [
    `${title}的主人公在平静生活中发现了一个无法忽视的异常。`,
    "线索把主人公推向更大的冲突，旧秘密开始浮出水面。",
    "当真相近在眼前，主人公必须做出改变命运的选择。",
  ];
  const selected = [0, Math.floor(sentences.length / 2), Math.max(0, sentences.length - 1)]
    .map((index, order) => sentences[index] || fallback[order])
    .map((sentence) => safeText(sentence, 110));

  const scenes = [
    { title: "异象出现", visual: "冷色夜景 · 缓慢推进", narration: selected[0] },
    { title: "线索逼近", visual: "人物剪影 · 光影转场", narration: selected[1] },
    { title: "悬念落点", visual: "高反差特写 · 留白收束", narration: selected[2] },
  ];

  return {
    title,
    logline: safeText(source, 160),
    sourceType: input.sourceType || "manual",
    genre: safeText(input.genre, 40) || "悬疑剧情",
    episode: {
      number: episodePlan?.number || 1,
      title: episodePlan ? `第${episodePlan.number}集 · ${episodePlan.title}` : "第一集 · 命运的裂缝",
      scenes,
      narration: scenes.map((scene) => scene.narration).join(" "),
    },
    bible: {
      premise: safeText(source, 260),
      protagonist: "故事核心人物",
      centralConflict: "主人公必须沿着逐渐显现的线索，在失去重要事物前揭开真相。",
      continuityRules: [
        "事件因果必须按原始剧情顺序推进",
        "人物已知信息不得提前泄露",
        "本集结尾保留明确的追看悬念",
      ],
    },
  };
}

function narrationCacheIdentity(story) {
  const voices = (story.continuitySnapshot?.voices || []).map(item => ({
    characterId: item.characterId,
    speaker: item.speaker,
    direction: item.direction,
    bindingVersion: item.bindingVersion,
  }));
  return {
    schemaVersion: 1,
    hash: createHash("sha256").update(JSON.stringify({
      narration: normalizeNovelText(story.episode.narration),
      voices,
    })).digest("hex"),
    narrationCharacters: [...story.episode.narration].length,
    voices,
  };
}

function buildProductionBible(input, seriesPlan) {
  const source = safeText(input.content || input.premise || seriesPlan?.summary, 12000);
  const surnames = "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于傅皮卞齐康伍余元顾孟黄穆萧尹姚邵汪祁毛禹狄米贝明臧计伏成戴宋茅庞熊纪舒屈项祝董梁杜阮蓝闵季贾路娄江童颜郭梅盛林钟徐邱骆高夏蔡田樊胡凌霍虞万支柯管卢莫房裘缪干解应宗丁宣邓郁单杭洪包左石崔吉龚程邢裴陆荣翁荀羊甄曲封芮储靳焦牧山谷车侯宓蓬全班仰秋仲伊宫宁仇栾暴甘厉戎祖武符刘景詹束龙叶司黎乔苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍璩桑桂濮牛寿通边扈燕冀浦尚农温别庄晏柴瞿阎充慕连茹习艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权盖益桓公";
  const namePattern = new RegExp(`([${surnames}][\\u4e00-\\u9fa5]{1,2})(?=在|向|对|与|和|神色|看见|说道|问道|答道|道[：:“”]|走|来|有|将|把|让|又|却|便|则|的|，|。|：)`, "gu");
  const candidates = [...source.matchAll(namePattern)]
    .map(match => match[1])
    .filter(name => !/^(什么|怎么|其中|于是|可以|没有|这个|那个|自己|官家|宫墙内|宫人们|常粗重|左右|那好吧|那官家|国事|文官|文官们|武人|苗头|越尖锐|宋将门|花灯|步地|明明)$/.test(name));
  const counts = candidates.reduce((map, name) => map.set(name, (map.get(name) || 0) + 1), new Map());
  const names = [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .slice(0, 4);
  const characters = (names.length ? names : ["核心人物"]).map((name, index) => ({
    id: `character-${index + 1}`,
    name,
    role: index === 0 ? "主要角色" : "关键角色",
    description: index === 0 ? "贯穿主线的核心人物；造型、年龄、服装和气质需跨集保持一致。" : "推动剧情的重要人物；首次定妆后锁定外观。",
    visualAnchor: `${seriesPlan.format === "anime" ? "二维动漫角色设定" : "影视角色定妆"}，统一脸型、发型、服装轮廓与主色`,
    defaultWardrobe: "首次定妆服装；除非剧情明确换装、伪装、时间跳跃或服装损坏，否则持续沿用",
    views: { front: null, threeQuarter: null, side: null, back: null },
    status: "needs_design",
    locked: false,
  }));
  const sceneKeywords = ["宫", "殿", "城", "街", "房", "山", "海", "店", "车站", "学校"]
    .filter(keyword => source.includes(keyword))
    .slice(0, 3);
  const scenes = (sceneKeywords.length ? sceneKeywords : ["主场景"]).map((name, index) => ({
    id: `scene-${index + 1}`,
    name: name === "主场景" ? name : `${name}景`,
    description: "建立空间布局、时间、天气、光线和固定陈设，供所有相关分集复用。",
    status: "needs_design",
    locked: false,
  }));
  const propKeywords = ["剑", "刀", "枪", "弓", "武器", "信", "书", "伞", "车", "戒指", "手机"]
    .filter(keyword => source.includes(keyword))
    .slice(0, 5);
  const props = propKeywords.map((name, index) => ({
    id: `prop-${index + 1}`,
    name,
    category: /剑|刀|枪|弓|武器/.test(name) ? "武器" : "关键道具",
    description: "外形、材质、尺寸和使用痕迹需跨镜头保持一致。",
    initialHolder: null,
    status: "needs_design",
    locked: false,
  }));
  return {
    version: 1,
    status: "needs_review",
    characters,
    scenes,
    props,
    voices: characters.map((character, index) => ({
      id: `voice-${index + 1}`,
      characterId: character.id,
      characterName: character.name,
      speaker: index === 0 ? "Uncle_Fu" : "待选择",
      direction: index === 0 ? "沉稳自然，剧情感强，语速适中" : "等待选定音色与表演方向",
      bindingVersion: 1,
      status: index === 0 ? "configured" : "needs_config",
      locked: index === 0,
    })),
    continuity: {
      enabled: true,
      characterIdentity: true,
      wardrobe: true,
      sceneLayout: true,
      props: true,
      colorScript: true,
      voiceIdentity: true,
      previousEpisodeContext: true,
      lastFrameBridge: true,
      transitionStyle: "动作承接 + 环境声预叠 + 首尾帧匹配",
    },
  };
}

function normalizeProductionBible(bible) {
  if (!bible) return bible;
  bible.characters ||= [];
  bible.scenes ||= [];
  bible.props ||= [];
  bible.voices ||= [];
  bible.continuity ||= {};
  for (const character of bible.characters) {
    character.defaultWardrobe ||= "首次定妆服装；剧情未明确要求时保持不变";
  }
  for (const prop of bible.props) {
    if (!("initialHolder" in prop)) prop.initialHolder = null;
  }
  for (const voice of bible.voices) {
    voice.bindingVersion ||= 1;
    voice.sample ||= null;
  }
  return bible;
}

export function productionAssetReadiness(project) {
  const bible = normalizeProductionBible(project.productionBible);
  const missing = [];
  if (!bible?.analyzedAt) missing.push("AI 制片资产分析");
  for (const character of bible?.characters || []) {
    const absent = ["front", "threeQuarter", "side", "back"]
      .filter(view => !character.views?.[view]);
    if (absent.length) missing.push(`${character.name}人物多视图（缺 ${absent.length} 张）`);
  }
  for (const scene of bible?.scenes || []) {
    if (!scene.image) missing.push(`${scene.name}场景概念图`);
  }
  for (const prop of bible?.props || []) {
    if (!prop.image) missing.push(`${prop.name}武器/道具设定图`);
  }
  for (const voice of bible?.voices || []) {
    if (!voice.speaker || voice.speaker === "待选择") missing.push(`${voice.characterName}固定音色`);
    else if (!voice.sample) missing.push(`${voice.characterName}音色样本`);
  }
  const configuredSpeakers = (bible?.voices || [])
    .map(voice => voice.speaker)
    .filter(speaker => speaker && speaker !== "待选择");
  if (configuredSpeakers.length > 1 && new Set(configuredSpeakers).size !== configuredSpeakers.length) {
    missing.push("不同角色使用了重复音色");
  }
  return {
    ready: missing.length === 0,
    missing,
    counts: {
      characters: bible?.characters?.length || 0,
      scenes: bible?.scenes?.length || 0,
      props: bible?.props?.length || 0,
      voices: bible?.voices?.length || 0,
    },
  };
}

function explicitWardrobeChange(text, characterName) {
  const relevant = !characterName || text.includes(characterName);
  const match = text.match(/[^。！？]*(?:换上|换下|换装|更衣|脱下|穿上|披上|乔装|伪装|衣服被|衣衫破|服装破)[^。！？]*/u);
  return relevant && match ? safeText(match[0], 180) : null;
}

function explicitPropChange(text, propName) {
  if (!text.includes(propName)) return null;
  const match = text.match(new RegExp(`[^。！？]*${propName}[^。！？]*(?:交给|递给|夺走|抢走|丢失|遗失|拾起|捡起|拿起|放下|损坏|折断|耗尽|用完|归还)[^。！？]*`, "u"));
  return match ? safeText(match[0], 180) : null;
}

export function buildContinuitySnapshot(project, story, previousSnapshot = null) {
  const bible = normalizeProductionBible(project.productionBible ||
    buildProductionBible(project.input || {}, project.seriesPlan || { format: "anime" }));
  const episodeNumber = story.episode.number;
  const text = safeText(`${story.episode.narration} ${project.seriesPlan?.episodes?.[episodeNumber - 1]?.summary || ""}`, 3000);
  const previousCharacters = new Map((previousSnapshot?.characters || []).map(item => [item.characterId, item]));
  const previousProps = new Map((previousSnapshot?.props || []).map(item => [item.propId, item]));
  const changes = [];
  const characters = bible.characters.map(character => {
    const previous = previousCharacters.get(character.id);
    const wardrobeChange = explicitWardrobeChange(text, character.name);
    const wardrobeVersion = (previous?.wardrobeVersion || 1) + (wardrobeChange ? 1 : 0);
    if (wardrobeChange) changes.push({
      type: "wardrobe", assetId: character.id, assetName: character.name,
      reason: wardrobeChange, fromVersion: previous?.wardrobeVersion || 1, toVersion: wardrobeVersion,
    });
    return {
      characterId: character.id,
      name: character.name,
      identityAnchor: character.visualAnchor,
      identityVersion: 1,
      wardrobe: wardrobeChange || previous?.wardrobe || character.defaultWardrobe,
      wardrobeVersion,
      inheritedWardrobe: !wardrobeChange,
    };
  });
  const voices = bible.voices.map(voice => ({
    characterId: voice.characterId,
    characterName: voice.characterName,
    voiceId: voice.id,
    speaker: voice.speaker,
    direction: voice.direction,
    bindingVersion: voice.bindingVersion || 1,
    inherited: true,
  }));
  const scenes = bible.scenes.map(scene => ({
    sceneId: scene.id,
    name: scene.name,
    layoutAnchor: scene.description,
    state: previousSnapshot?.scenes?.find(item => item.sceneId === scene.id)?.state || "延续基础场景状态",
  }));
  const props = bible.props.map(prop => {
    const previous = previousProps.get(prop.id);
    const propChange = explicitPropChange(text, prop.name);
    if (propChange) changes.push({
      type: "prop", assetId: prop.id, assetName: prop.name, reason: propChange,
    });
    return {
      propId: prop.id,
      name: prop.name,
      appearanceAnchor: prop.description,
      holder: previous?.holder ?? prop.initialHolder ?? null,
      condition: propChange || previous?.condition || "完好，保持既定外观与使用痕迹",
      stateVersion: (previous?.stateVersion || 1) + (propChange ? 1 : 0),
      inherited: !propChange,
    };
  });
  return {
    episodeNumber,
    basedOnEpisode: previousSnapshot?.episodeNumber || null,
    createdAt: new Date().toISOString(),
    characters, voices, scenes, props, changes,
    rules: {
      voice: "角色声音永久绑定；没有明确人工变更时不得更换 speaker、语速、口音或声线",
      wardrobe: "服装默认继承；仅剧情明确换装、伪装、时间跳跃或服装损坏时建立新版本",
      props: "武器与道具默认继承外观、持有人、位置与损耗；仅明确剧情事件可改变",
    },
  };
}

function applyContinuityOverride(snapshot, override) {
  if (!override) return snapshot;
  const reasons = [];
  for (const change of override.characters || []) {
    const character = snapshot.characters.find(item => item.characterId === change.characterId);
    if (!character || !safeText(change.wardrobe, 500)) continue;
    character.wardrobe = safeText(change.wardrobe, 500);
    character.wardrobeVersion += 1;
    character.inheritedWardrobe = false;
    reasons.push({
      type: "wardrobe", assetId: character.characterId, assetName: character.name,
      reason: safeText(change.reason, 180) || "人工确认本集换装",
      toVersion: character.wardrobeVersion, source: "manual",
    });
  }
  for (const change of override.props || []) {
    const prop = snapshot.props.find(item => item.propId === change.propId);
    if (!prop) continue;
    const holder = safeText(change.holder, 80);
    const condition = safeText(change.condition, 500);
    if (!holder && !condition) continue;
    if (holder) prop.holder = holder;
    if (condition) prop.condition = condition;
    prop.stateVersion += 1;
    prop.inherited = false;
    reasons.push({
      type: "prop", assetId: prop.propId, assetName: prop.name,
      reason: safeText(change.reason, 180) || "人工确认本集道具状态变化",
      source: "manual",
    });
  }
  snapshot.changes.push(...reasons);
  snapshot.review = {
    status: "confirmed",
    note: safeText(override.note, 500),
    confirmedAt: override.confirmedAt || new Date().toISOString(),
  };
  return snapshot;
}

function buildProjectContinuityLedger(project, existingLedger = null) {
  const snapshots = [];
  const overrides = existingLedger?.overrides || {};
  let previous = null;
  for (const episodePlan of project.seriesPlan?.episodes || []) {
    const story = buildStory(project.input, episodePlan);
    const snapshot = buildContinuitySnapshot(project, story, previous);
    applyContinuityOverride(snapshot, overrides[episodePlan.number]);
    snapshots.push(snapshot);
    previous = snapshot;
  }
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    overrides,
    snapshots,
  };
}

async function analyzeProductionBible(env, project) {
  if (!env.ARK_API_KEY || !env.ARK_BASE_URL || !env.ARK_LLM_MODEL) {
    throw new Error("制片圣经分析缺少方舟语言模型配置");
  }
  const source = safeText(project.input?.content || project.input?.premise || project.seriesPlan?.summary, 12000);
  const response = await fetch(`${env.ARK_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.ARK_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.ARK_LLM_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "你是资深动画与影视制片人。只返回严格 JSON，不使用 Markdown。不要发明原文不存在的重要角色。描述必须能直接用于图像和视频生成。",
        },
        {
          role: "user",
          content: `请从下面故事中建立可执行的制片圣经，并判断最适合的成片类型。用户当前选择：${project.specification?.format || "anime"}。
JSON 格式必须是：
{"recommendedFormat":{"format":"anime|drama|film|other","reason":"","confidence":0.0},"characters":[{"name":"","role":"","description":"","visualAnchor":"","voiceDirection":""}],"scenes":[{"name":"","description":""}],"props":[{"name":"","category":"武器或关键道具","description":""}],"continuity":{"transitionStyle":""}}
要求：characters 最多 8 个，scenes 最多 8 个，props 最多 10 个；人物 visualAnchor 必须包含年龄段、脸型、发型、服装、主色、体态和不可改变特征；场景包含布局、时代、光线、固定陈设；道具包含材质、尺寸、颜色和使用痕迹。
成片类型只能是 anime（动漫）、drama（电视剧）、film（电影）或 other（其它）。推荐应基于故事体量、世界观实现难度、人物关系、叙事节奏和视觉表现力；不要因为用户当前选择而改变判断。
故事正文：
${source}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(Number(env.MODEL_REQUEST_TIMEOUT_MS || 180000)),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`语言模型分析失败 (${response.status}): ${text.slice(0, 500)}`);
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error("语言模型接口返回无效 JSON"); }
  const result = parseJsonContent(payload?.choices?.[0]?.message?.content);
  const characters = Array.isArray(result.characters) ? result.characters.slice(0, 8) : [];
  const scenes = Array.isArray(result.scenes) ? result.scenes.slice(0, 8) : [];
  const props = Array.isArray(result.props) ? result.props.slice(0, 10) : [];
  const allowedFormats = ["anime", "drama", "film", "other"];
  const recommendedFormat = allowedFormats.includes(result.recommendedFormat?.format)
    ? result.recommendedFormat.format
    : project.specification?.format || "anime";
  const confidence = Number(result.recommendedFormat?.confidence);
  if (!characters.length) throw new Error("语言模型未识别到可用角色");
  return {
    version: 2,
    status: "needs_review",
    analyzedAt: new Date().toISOString(),
    analyzer: { model: env.ARK_LLM_MODEL, requestId: payload.id || null },
    recommendation: {
      format: recommendedFormat,
      reason: safeText(result.recommendedFormat?.reason, 400) || "根据故事结构与当前制作条件综合判断",
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
      currentFormatAtAnalysis: project.specification?.format || "anime",
    },
    characters: characters.map((item, index) => ({
      id: slugId("character", index),
      name: safeText(item.name, 40) || `角色 ${index + 1}`,
      role: safeText(item.role, 80) || "剧情角色",
      description: safeText(item.description, 500),
      visualAnchor: safeText(item.visualAnchor, 800),
      defaultWardrobe: safeText(item.defaultWardrobe, 500) ||
        "首次定妆服装；除非剧情明确换装、伪装、时间跳跃或服装损坏，否则持续沿用",
      views: { front: null, threeQuarter: null, side: null, back: null },
      sheet: null,
      status: "needs_design",
      locked: false,
    })),
    scenes: scenes.map((item, index) => ({
      id: slugId("scene", index),
      name: safeText(item.name, 60) || `场景 ${index + 1}`,
      description: safeText(item.description, 800),
      initialHolder: safeText(item.initialHolder, 80) || null,
      image: null,
      status: "needs_design",
      locked: false,
    })),
    props: props.map((item, index) => ({
      id: slugId("prop", index),
      name: safeText(item.name, 60) || `道具 ${index + 1}`,
      category: safeText(item.category, 40) || "关键道具",
      description: safeText(item.description, 800),
      image: null,
      status: "needs_design",
      locked: false,
    })),
    voices: characters.map((item, index) => ({
      id: slugId("voice", index),
      characterId: slugId("character", index),
      characterName: safeText(item.name, 40) || `角色 ${index + 1}`,
      speaker: index === 0 ? (env.TTS_DEFAULT_SPEAKER || "Uncle_Fu") : "待选择",
      direction: safeText(item.voiceDirection, 300) || "自然、符合人物年龄与身份",
      bindingVersion: 1,
      status: index === 0 ? "configured" : "needs_config",
      locked: false,
    })),
    continuity: {
      enabled: true, characterIdentity: true, wardrobe: true, sceneLayout: true, props: true,
      colorScript: true, voiceIdentity: true, previousEpisodeContext: true, lastFrameBridge: true,
      transitionStyle: safeText(result.continuity?.transitionStyle, 300) ||
        "动作承接 + 环境声预叠 + 上一集尾帧匹配下一集首镜",
    },
  };
}

function imagePromptForAsset(project, type, asset) {
  const style = project.specification?.format === "anime"
    ? "高质量二维动漫制作设定稿，清晰线稿，赛璐璐上色"
    : "高质量电影美术概念设计，写实材质，专业制片设定稿";
  if (type === "character") return `${style}。同一个原创虚构角色的四视图横向排列：正面、三分之四侧面、标准侧面、背面，全身中立站姿，纯白背景，各视图人物比例与服装完全一致，无文字无标注。角色：${asset.name}。身份：${asset.role}。固定外观：${asset.visualAnchor}。`;
  if (type === "scene") return `${style}。原创场景概念图，宽幅构图，无人物，无文字无标注。场景：${asset.name}。固定设定：${asset.description}。突出可复用的空间布局、入口出口、固定陈设、时代材质、光线方向与色彩脚本。`;
  return `${style}。原创${asset.category || "关键道具"}设定图，单件物品，正侧背三视角，浅色纯背景，无人物，无文字无标注。名称：${asset.name}。固定设定：${asset.description}。清晰展示材质、尺寸比例、颜色、结构与使用痕迹。`;
}

async function generateArkImage(env, prompt) {
  if (!env.ARK_API_KEY || !env.ARK_BASE_URL || !env.ARK_IMAGE_MODEL) {
    throw new Error("资产生成缺少方舟图像模型配置");
  }
  const response = await fetch(`${env.ARK_BASE_URL.replace(/\/$/, "")}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.ARK_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.ARK_IMAGE_MODEL,
      prompt,
      sequential_image_generation: "disabled",
      response_format: "url",
      size: "2K",
      stream: false,
      watermark: true,
    }),
    signal: AbortSignal.timeout(Number(env.MODEL_REQUEST_TIMEOUT_MS || 180000)),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`图像模型生成失败 (${response.status}): ${text.slice(0, 500)}`);
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error("图像模型接口返回无效 JSON"); }
  const url = payload?.data?.[0]?.url;
  if (!url) throw new Error("图像模型成功响应但缺少图片 URL");
  const download = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!download.ok) throw new Error(`生成图片下载失败：HTTP ${download.status}`);
  const buffer = Buffer.from(await download.arrayBuffer());
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png = buffer.subarray(1, 4).toString("ascii") === "PNG";
  if (buffer.length < 10_000 || (!jpeg && !png)) throw new Error("图像模型返回内容不是有效 JPEG/PNG");
  return {
    buffer,
    extension: jpeg ? "jpg" : "png",
    contentType: jpeg ? "image/jpeg" : "image/png",
    generation: { model: env.ARK_IMAGE_MODEL, created: payload.created || null, bytes: buffer.length },
  };
}

async function splitCharacterSheet(projectDir, sourcePath, prefix, extension) {
  const outputs = {};
  for (const [index, key] of ["front", "threeQuarter", "side", "back"].entries()) {
    const filename = `${prefix}-${key}.${extension}`;
    const path = join(projectDir, filename);
    await run("ffmpeg", [
      "-y", "-i", sourcePath,
      "-vf", `crop=iw/4:ih:${index}*iw/4:0`,
      "-frames:v", "1", path,
    ], projectDir);
    outputs[key] = filename;
  }
  return outputs;
}

function formatSrtTime(seconds) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  const secs = Math.floor((milliseconds % 60000) / 1000);
  const ms = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > 12000) stderr = stderr.slice(-12000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} 退出码 ${code}: ${stderr.slice(-3000)}`));
    });
  });
}

async function probeDuration(audioPath) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      audioPath,
    ]);
    let output = "";
    let error = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (error += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`无法读取音频时长: ${error}`));
      else resolve(Number(output.trim()));
    });
  });
}

async function probeMedia(mediaPath) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", [
      "-v", "error",
      "-show_streams",
      "-show_format",
      "-of", "json",
      mediaPath,
    ]);
    let output = "";
    let error = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (error += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`无法检查媒体流: ${error}`));
      try {
        const data = JSON.parse(output);
        const streams = Array.isArray(data.streams) ? data.streams : [];
        const audio = streams.find(stream => stream.codec_type === "audio");
        const video = streams.find(stream => stream.codec_type === "video");
        const duration = Number(data.format?.duration || video?.duration || audio?.duration);
        resolve({
          duration: Number.isFinite(duration) ? duration : null,
          hasVideo: Boolean(video),
          hasAudio: Boolean(audio),
          videoCodec: video?.codec_name || null,
          audioCodec: audio?.codec_name || null,
          width: Number(video?.width) || null,
          height: Number(video?.height) || null,
        });
      } catch {
        reject(new Error("ffprobe 返回了无效媒体信息"));
      }
    });
  });
}

async function analyzeMediaQuality(mediaPath) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-hide_banner", "-nostats", "-i", mediaPath,
      "-filter_complex",
      "[0:v]blackdetect=d=0.5:pix_th=0.10,freezedetect=n=-50dB:d=1.5[v];[0:a]ebur128=peak=true[a]",
      "-map", "[v]", "-map", "[a]", "-f", "null", "-",
    ]);
    let diagnostics = "";
    child.stderr.on("data", chunk => {
      diagnostics += chunk;
      if (diagnostics.length > 500_000) diagnostics = diagnostics.slice(-500_000);
    });
    child.on("error", reject);
    child.on("close", code => {
      if (code !== 0) return reject(new Error("FFmpeg 高级质检失败"));
      const blackDurations = [...diagnostics.matchAll(/black_duration:([0-9.]+)/g)]
        .map(match => Number(match[1])).filter(Number.isFinite);
      const freezeStarts = [...diagnostics.matchAll(/freeze_start:\s*([0-9.]+)/g)]
        .map(match => Number(match[1])).filter(Number.isFinite);
      const freezeDurations = [...diagnostics.matchAll(/freeze_duration:\s*([0-9.]+)/g)]
        .map(match => Number(match[1])).filter(Number.isFinite);
      const integrated = [...diagnostics.matchAll(/\bI:\s*(-?[0-9.]+)\s+LUFS/g)]
        .map(match => Number(match[1])).filter(Number.isFinite).at(-1);
      const truePeak = [...diagnostics.matchAll(/\bPeak:\s*(-?[0-9.]+)\s+dBFS/g)]
        .map(match => Number(match[1])).filter(Number.isFinite).at(-1);
      resolve({
        analyzer: "ffmpeg-blackdetect-freezedetect-ebur128",
        blackSeconds: Number(blackDurations.reduce((sum, value) => sum + value, 0).toFixed(3)),
        blackSegments: blackDurations.length,
        freezeSeconds: Number(freezeDurations.reduce((sum, value) => sum + value, 0).toFixed(3)),
        freezeSegments: Math.max(freezeStarts.length, freezeDurations.length),
        integratedLoudnessLufs: Number.isFinite(integrated) ? integrated : null,
        truePeakDbfs: Number.isFinite(truePeak) ? truePeak : null,
      });
    });
  });
}

export async function requestMultimodalQuality(
  env, model, content, fetchImpl = globalThis.fetch,
) {
  const configuredTimeout = Number(env.MODEL_REQUEST_TIMEOUT_MS || 180000);
  const timeoutMs = Math.max(15_000, Math.min(180_000,
    Number.isFinite(configuredTimeout) ? configuredTimeout : 180_000));
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetchImpl(
        `${env.ARK_BASE_URL.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.ARK_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0,
            messages: [{ role: "user", content }],
          }),
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
      const raw = await response.text();
      if (response.ok) {
        try { return JSON.parse(raw); }
        catch { throw new Error("多模态质检返回无效 JSON"); }
      }
      const retryable = response.status === 429 || response.status >= 500;
      const error = new Error(`多模态质检失败 (${response.status}): ${raw.slice(0, 500)}`);
      if (!retryable || attempt === 2) throw error;
      lastError = error;
    } catch (error) {
      const code = error?.cause?.code || error?.code || error?.name;
      const transient = /timeout|fetch failed|network|socket|reset|und_err/i.test(
        `${code || ""} ${error?.message || ""}`,
      );
      if (!transient || attempt === 2) {
        if (transient) {
          throw new Error(`多模态质检网络超时，已重试仍未恢复（${code || "NetworkError"}）`);
        }
        throw error;
      }
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw lastError;
}

export async function analyzeVisualConsistency(env, videoPath, story, project, duration) {
  const qualityModel = env.ARK_QUALITY_MULTIMODAL_MODEL || env.ARK_MULTIMODAL_MODEL;
  if (!env.ARK_API_KEY || !env.ARK_BASE_URL || !qualityModel) {
    return { status: "unavailable", reason: "未配置方舟多模态质检模型" };
  }
  const absoluteVideoPath = isAbsolute(videoPath) ? videoPath : resolve(videoPath);
  const prefix = `quality-${story.episode.number}-${randomUUID()}`;
  const pattern = join(project.dir, `${prefix}-%02d.jpg`);
  const frameCount = 3;
  const rate = Math.max(0.1, frameCount / Math.max(1, Number(duration || 1)));
  const framePaths = Array.from({ length: frameCount }, (_, index) =>
    join(project.dir, `${prefix}-${String(index + 1).padStart(2, "0")}.jpg`));
  try {
    await run("ffmpeg", [
      "-y", "-i", absoluteVideoPath, "-vf", `fps=${rate},scale=640:-2`,
      "-frames:v", String(frameCount), pattern,
    ], project.dir);
    const content = [{
      type: "text",
      text: `你是影视连续性质检员。比较制片参考资产、本集连续性账本与本集成片抽帧。
只返回严格 JSON：
{"passed":true,"identity":{"passed":true,"details":""},"wardrobe":{"passed":true,"details":""},"props":{"passed":true,"details":""},"scene":{"passed":true,"details":""},"confidence":0.0,"summary":""}
只有能在抽帧中观察到的项目才判定；没有出现的道具或角色不得误判失败。人物脸型发型、剧情未要求变化的服装、出现的武器道具和场景布局必须与参考一致。
本集连续性状态：${JSON.stringify(story.continuitySnapshot || {})}`,
    }];
    const references = [];
    for (const character of project.productionBible?.characters || []) {
      const url = await localAssetDataUrl(project, character.views?.front || character.sheet);
      if (url) {
        content.push({ type: "image_url", image_url: { url } });
        references.push({ kind: "character", id: character.id, name: character.name });
      }
    }
    for (const prop of project.productionBible?.props || []) {
      const url = await localAssetDataUrl(project, prop.image);
      if (url) {
        content.push({ type: "image_url", image_url: { url } });
        references.push({ kind: "prop", id: prop.id, name: prop.name });
      }
    }
    for (const scene of project.productionBible?.scenes || []) {
      const url = await localAssetDataUrl(project, scene.image);
      if (url) {
        content.push({ type: "image_url", image_url: { url } });
        references.push({ kind: "scene", id: scene.id, name: scene.name });
      }
    }
    let extractedFrames = 0;
    for (const path of framePaths) {
      try {
        const body = await readFile(path);
        content.push({
          type: "image_url",
          image_url: { url: `data:image/jpeg;base64,${body.toString("base64")}` },
        });
        extractedFrames++;
      } catch { /* Short clips can yield fewer frames. */ }
    }
    if (!references.length || !extractedFrames) {
      return {
        status: "unavailable",
        reason: !references.length ? "没有可比较的制片参考资产" : "无法抽取成片质检帧",
        references, extractedFrames,
      };
    }
    const payload = await requestMultimodalQuality(env, qualityModel, content);
    const result = parseJsonContent(payload?.choices?.[0]?.message?.content);
    const dimensions = ["identity", "wardrobe", "props", "scene"];
    const checks = Object.fromEntries(dimensions.map(key => [key, {
      passed: result[key]?.passed === true,
      details: safeText(result[key]?.details, 500),
    }]));
    return {
      status: "analyzed",
      passed: result.passed === true && dimensions.every(key => checks[key].passed),
      checks,
      confidence: Number.isFinite(Number(result.confidence))
        ? Math.max(0, Math.min(1, Number(result.confidence))) : null,
      summary: safeText(result.summary, 800),
      model: qualityModel,
      fallbackUsed: qualityModel !== env.ARK_MULTIMODAL_MODEL,
      requestId: payload.id || null,
      references,
      extractedFrames,
    };
  } finally {
    await Promise.all(framePaths.map(path => rm(path, { force: true }).catch(() => {})));
  }
}

function normalizeSpeechText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, "");
}

function textSimilarity(expected, actual) {
  const left = normalizeSpeechText(expected);
  const right = normalizeSpeechText(actual);
  if (!left || !right) return 0;
  const grams = value => {
    if (value.length < 2) return new Set([value]);
    return new Set(Array.from({ length: value.length - 1 }, (_, index) =>
      value.slice(index, index + 2)));
  };
  const a = grams(left);
  const b = grams(right);
  let overlap = 0;
  for (const item of a) if (b.has(item)) overlap++;
  return (2 * overlap) / (a.size + b.size);
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value);
  return buffer;
}

function asrProtocolFrame(header, payload) {
  return Buffer.concat([Buffer.from(header), uint32(payload.length), payload]);
}

function parseAsrFrame(data) {
  if (data.length < 8) throw new Error("ASR 返回了无效数据帧");
  const headerSize = (data[0] & 0x0f) * 4;
  const messageType = data[1] >> 4;
  const flags = data[1] & 0x0f;
  let offset = headerSize;
  if (messageType === 0x0f) {
    const code = data.readUInt32BE(offset);
    const size = data.readUInt32BE(offset + 4);
    const message = data.subarray(offset + 8, offset + 8 + size).toString();
    throw new Error(`ASR ${code}: ${message}`);
  }
  if (flags & 0x01) offset += 4;
  const size = data.readUInt32BE(offset);
  let payload = data.subarray(offset + 4, offset + 4 + size);
  if ((data[2] & 0x0f) === 0x01) payload = gunzipSync(payload);
  return JSON.parse(payload.toString());
}

async function transcribeSeedAsr(env, mediaPath) {
  const pcmPath = `${mediaPath}.${randomUUID()}.pcm`;
  try {
    await run("ffmpeg", [
      "-y", "-i", mediaPath, "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", pcmPath,
    ]);
    const audio = await readFile(pcmPath);
    const request = gzipSync(Buffer.from(JSON.stringify({
      user: { uid: "novel-series-factory" },
      audio: { format: "pcm", codec: "raw", rate: 16000, bits: 16, channel: 1 },
      request: {
        model_name: "bigmodel", enable_itn: true, enable_punc: true,
        enable_ddc: true, show_utterances: true, enable_lid: true,
      },
    })));
    return await new Promise((resolve, reject) => {
      const socket = new WebSocket(env.ASR_API_URL, {
        headers: {
          "X-Api-Key": env.ASR_API_KEY,
          "X-Api-Resource-Id": env.ASR_MODEL,
          "X-Api-Connect-Id": randomUUID(),
        },
        handshakeTimeout: 15_000,
      });
      let latest = {};
      let settled = false;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        socket.close();
        if (error) reject(error);
        else resolve(result);
      };
      const timeout = setTimeout(() => {
        socket.terminate();
        finish(new Error("ASR 识别超时"));
      }, Number(env.MODEL_REQUEST_TIMEOUT_MS || 180000));
      socket.once("open", () => {
        socket.send(asrProtocolFrame([0x11, 0x10, 0x11, 0x00], request));
        const chunkSize = 16_000 * 2 * 2;
        for (let offset = 0; offset < audio.length; offset += chunkSize) {
          const chunk = audio.subarray(offset, offset + chunkSize);
          const last = offset + chunk.length >= audio.length;
          socket.send(asrProtocolFrame(
            [0x11, last ? 0x22 : 0x20, 0x01, 0x00], gzipSync(chunk),
          ));
        }
        if (!audio.length) {
          socket.send(asrProtocolFrame(
            [0x11, 0x22, 0x01, 0x00], gzipSync(Buffer.alloc(0)),
          ));
        }
      });
      socket.on("message", raw => {
        try {
          latest = parseAsrFrame(Buffer.from(raw));
          const utterances = latest.result?.utterances || [];
          if (utterances.some(item => item.definite) || latest.result?.text) {
            finish(null, latest);
          }
        } catch (error) {
          finish(error);
        }
      });
      socket.once("error", error => finish(error));
      socket.once("close", () => {
        if (!settled) {
          if (latest.result?.text) finish(null, latest);
          else finish(new Error("ASR 连接提前关闭且没有识别结果"));
        }
      });
    });
  } finally {
    await rm(pcmPath, { force: true }).catch(() => {});
  }
}

export async function verifyNativeSpeechWithAsr(env, mediaPath, story) {
  if (!env.ASR_API_URL || !env.ASR_API_KEY || !env.ASR_MODEL) {
    return { status: "unavailable", verified: false, reason: "未配置 ASR 内容核验服务" };
  }
  if (/^wss?:/i.test(env.ASR_API_URL)) {
    let payload;
    try {
      payload = await transcribeSeedAsr(env, mediaPath);
    } catch (error) {
      return {
        status: "failed", verified: false,
        reason: `SeedASR 核验失败：${publicErrorMessage(error)}`,
        endpointProtocol: "websocket",
      };
    }
    const transcript = safeText(payload.result?.text, 12_000);
    const expected = story.episode.narration;
    const similarity = textSimilarity(expected, transcript);
    return {
      status: "analyzed", verified: similarity >= 0.72,
      similarity: Number(similarity.toFixed(4)), transcript,
      expected: safeText(expected, 12_000), model: env.ASR_MODEL,
      endpointProtocol: "websocket",
      reason: similarity >= 0.72
        ? "SeedASR 证明模型原声与本集台词一致"
        : "SeedASR 识别台词与本集规范台词差异过大",
    };
  }
  const body = await readFile(mediaPath);
  const response = await fetch(env.ASR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.ASR_API_KEY ? { "Authorization": `Bearer ${env.ASR_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: env.ASR_MODEL,
      audio_base64: body.toString("base64"),
      response_format: "json",
    }),
    signal: AbortSignal.timeout(Number(env.MODEL_REQUEST_TIMEOUT_MS || 180000)),
  });
  const raw = await response.text();
  if (!response.ok) {
    return { status: "failed", verified: false, reason: `ASR HTTP ${response.status}` };
  }
  let payload;
  try { payload = JSON.parse(raw); } catch {
    return { status: "failed", verified: false, reason: "ASR 返回无效 JSON" };
  }
  const transcript = safeText(
    payload.text || payload.transcript || payload.result?.text || payload.data?.text, 12_000,
  );
  const expected = story.episode.narration;
  const similarity = textSimilarity(expected, transcript);
  return {
    status: "analyzed",
    verified: similarity >= 0.72,
    similarity: Number(similarity.toFixed(4)),
    transcript,
    expected: safeText(expected, 12_000),
    model: env.ASR_MODEL,
    reason: similarity >= 0.72 ? "模型原声与本集台词一致" : "模型原声与本集台词差异过大",
  };
}

async function synthesizeSpeech(ttsUrl, story, outputPath) {
  const primaryVoice = story.continuitySnapshot?.voices?.find(item =>
    item.speaker && item.speaker !== "待选择");
  const response = await fetch(`${ttsUrl.replace(/\/$/, "")}/v1/audio/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: story.episode.narration,
      language: "Chinese",
      speaker: primaryVoice?.speaker || "Uncle_Fu",
      instruct: primaryVoice?.direction ||
        "中文短剧旁白，沉稳自然，剧情感强，语速稍慢，句间有清晰停顿",
    }),
    signal: AbortSignal.timeout(600000),
  });
  if (!response.ok) throw new Error(`TTS 请求失败 (${response.status}): ${await response.text()}`);
  const payload = await response.json();
  if (!payload.audio_base64) throw new Error("TTS 返回中缺少音频");
  await writeFile(outputPath, Buffer.from(payload.audio_base64, "base64"));
  return payload.elapsed_seconds;
}

async function synthesizeVoiceSample(ttsUrl, voice, outputPath) {
  const response = await fetch(`${ttsUrl.replace(/\/$/, "")}/v1/audio/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `我是${voice.characterName}。从这一刻起，我的声音会贯穿整个故事。`,
      language: "Chinese",
      speaker: voice.speaker,
      instruct: voice.direction || "自然、符合人物年龄与身份，保持稳定声线",
    }),
    signal: AbortSignal.timeout(600000),
  });
  if (!response.ok) throw new Error(`${voice.characterName}音色样本生成失败 (${response.status}): ${await response.text()}`);
  const payload = await response.json();
  if (!payload.audio_base64) throw new Error(`${voice.characterName}音色样本缺少音频`);
  await writeFile(outputPath, Buffer.from(payload.audio_base64, "base64"));
}

async function fetchTtsVoices(ttsUrl) {
  if (!ttsUrl) throw new Error("音色资产生成缺少 TTS 服务地址");
  const response = await fetch(`${ttsUrl.replace(/\/$/, "")}/v1/voices`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`无法读取 TTS 音色列表 (${response.status})`);
  const payload = await response.json();
  const voices = Array.isArray(payload.voices) ? payload.voices : [];
  if (!voices.length) throw new Error("TTS 服务没有返回可用音色");
  return voices;
}

function chooseCharacterSpeaker(character, voice, available, used) {
  const profile = safeText([
    character?.name, character?.role, character?.description,
    character?.visualAnchor, voice?.direction,
  ].join(" "), 2000);
  const female = /女|少女|女性|母亲|妻子|姐姐|妹妹|姑娘|woman|girl|female/i.test(profile);
  const mature = /父亲|老人|老年|中年|成熟|低沉|沉稳|威严|elder|mature/i.test(profile);
  const preferred = female
    ? ["Serena", "Vivian"]
    : mature ? ["Uncle_Fu", "Eric", "Dylan"] : ["Dylan", "Eric", "Uncle_Fu"];
  const chinese = available.filter(item => item.language === "Chinese").map(item => item.id);
  return [...preferred, ...chinese].find(id => chinese.includes(id) && !used.has(id)) || null;
}

function isBillableGenerationEnabled(env) {
  return String(env.ALLOW_BILLABLE_GENERATION).toLowerCase() === "true";
}

function isEnabled(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return String(value).toLowerCase() === "true";
}

function seedanceMultimodalEnabled(env) {
  if (env.SEEDANCE_MULTIMODAL_REFERENCES !== undefined &&
    env.SEEDANCE_MULTIMODAL_REFERENCES !== "") {
    return isEnabled(env.SEEDANCE_MULTIMODAL_REFERENCES);
  }
  return /seedance-2-5/i.test(String(env.ARK_VIDEO_MODEL || ""));
}

function mimeTypeFor(path) {
  const extension = extname(path).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".wav") return "audio/wav";
  return "image/png";
}

async function localAssetDataUrl(project, assetUrl) {
  if (!assetUrl || typeof assetUrl !== "string") return null;
  const filename = basename(new URL(assetUrl, "http://localhost").pathname);
  if (!filename) return null;
  try {
    const path = join(project.dir, filename);
    const body = await readFile(path);
    return `data:${mimeTypeFor(path)};base64,${body.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function buildSeedanceReferences(env, story, project) {
  if (!seedanceMultimodalEnabled(env)) {
    return { content: [], audit: { enabled: false, images: [], audio: null, video: null } };
  }
  const content = [];
  const images = [];
  const maxImages = Math.max(1, Math.min(30, Number(env.SEEDANCE_MAX_REFERENCE_IMAGES || 30)));
  for (const character of project.productionBible?.characters || []) {
    for (const [view, assetUrl] of Object.entries(character.views || {})) {
      if (!assetUrl || content.length >= maxImages) continue;
      const url = await localAssetDataUrl(project, assetUrl);
      if (!url) continue;
      content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
      images.push({ kind: "character", assetId: character.id, assetName: character.name, view });
    }
  }
  for (const [kind, assets] of [
    ["scene", project.productionBible?.scenes || []],
    ["prop", project.productionBible?.props || []],
  ]) {
    for (const asset of assets) {
      if (!asset.image || content.length >= maxImages) continue;
      const url = await localAssetDataUrl(project, asset.image);
      if (!url) continue;
      content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
      images.push({ kind, assetId: asset.id, assetName: asset.name });
    }
  }
  const voiceSamples = [];
  for (const voice of project.productionBible?.voices || []) {
    if (!voice.sample || voiceSamples.length >= 9) continue;
    const url = await localAssetDataUrl(project, voice.referenceSample || voice.sample);
    if (!url) continue;
    content.push({ type: "audio_url", audio_url: { url }, role: "reference_audio" });
    voiceSamples.push({
      characterId: voice.characterId,
      characterName: voice.characterName,
      speaker: voice.speaker,
      bindingVersion: voice.bindingVersion,
      durationSeconds: voice.referenceSampleDuration || null,
    });
  }
  const episodeNumber = story.episode?.number || 1;
  const narrationPath = join(project.dir, `narration-${String(episodeNumber).padStart(2, "0")}.wav`);
  let audio = null;
  try {
    const body = await readFile(narrationPath);
    let narrationDuration = 0;
    try { narrationDuration = await probeDuration(narrationPath); }
    catch { /* Invalid test fixtures and legacy audio are handled by the final media validator. */ }
    const voiceDuration = voiceSamples.reduce((sum, item) =>
      sum + Number(item.durationSeconds || 0), 0);
    if (body.length <= 15 * 1024 * 1024 && narrationDuration + voiceDuration <= 30.2) {
      content.push({
        type: "audio_url",
        audio_url: { url: `data:audio/wav;base64,${body.toString("base64")}` },
        role: "reference_audio",
      });
      audio = {
        filename: basename(narrationPath),
        purpose: "episode_dialogue_timing",
        durationSeconds: narrationDuration,
        referenceOrdinal: voiceSamples.length + 1,
        voiceBindings: story.continuitySnapshot?.voices?.map(item => ({
          characterId: item.characterId,
          speaker: item.speaker,
          bindingVersion: item.bindingVersion,
        })) || [],
      };
    } else {
      audio = {
        filename: basename(narrationPath),
        purpose: "omitted_audio_budget",
        durationSeconds: narrationDuration,
        omitted: true,
        reason: `角色音色指纹与本集配音合计 ${Number((narrationDuration + voiceDuration).toFixed(2))} 秒，超过 Seedance 30.2 秒限制`,
      };
    }
  } catch {
    // Audio is optional. The caller records the missing reference in the audit metadata.
  }
  let video = null;
  if (episodeNumber > 1 && isEnabled(env.SEEDANCE_CROSS_EPISODE_VIDEO_REFERENCE, true)) {
    const previous = project.assets?.episodes?.find(item => item.number === episodeNumber - 1);
    const url = previous?.videoGeneration?.sourceUrl;
    if (url) {
      content.push({ type: "video_url", video_url: { url }, role: "reference_video" });
      video = { episodeNumber: episodeNumber - 1, remoteTaskId: previous.videoGeneration.remoteTaskId };
    }
  }
  return { content, audit: { enabled: true, images, voiceSamples, audio, video } };
}

function buildVideoPrompt(story, project) {
  const ratio = project.specification?.ratio || "9:16";
  const format = project.specification?.format || "anime";
  const style = format === "drama" ? "cinematic live-action short drama" :
    format === "film" ? "cinematic film trailer" :
      "high-quality 2D hand-drawn anime with clean line art, cel shading and expressive illustrated faces";
  const formatGuard = format === "anime"
    ? "STYLE IS STRICTLY 2D ANIME: illustrated characters, visible drawn outlines, cel-shaded colors. Absolutely no live-action actors, no photorealistic people, no photographic or realistic TV-drama look."
    : "";
  const scenes = story.episode.scenes.map((scene, index) =>
    `Scene ${index + 1}: ${scene.title}. Visual: ${scene.visual}. Story beat: ${scene.narration}`).join("\n");
  const bible = project.productionBible;
  const episodeNumber = story.episode.number;
  const previousEpisode = project.seriesPlan?.episodes?.[episodeNumber - 2];
  const nextEpisode = project.seriesPlan?.episodes?.[episodeNumber];
  const continuity = bible ? [
    "SERIES CONTINUITY BIBLE — treat every locked attribute as mandatory:",
    `Characters: ${bible.characters.map(item => `${item.name}: ${item.visualAnchor}`).join(" | ") || "none"}`,
    `Locations: ${bible.scenes.map(item => `${item.name}: ${item.description}`).join(" | ") || "none"}`,
    `Props and weapons: ${bible.props.map(item => `${item.name} (${item.category}): ${item.description}`).join(" | ") || "none"}`,
    `Transition policy: ${bible.continuity.transitionStyle}`,
    story.continuitySnapshot ? `EPISODE STATE LEDGER — mandatory state at episode start:
Character identity and wardrobe: ${story.continuitySnapshot.characters.map(item =>
    `${item.name}: identity=${item.identityAnchor}; wardrobe v${item.wardrobeVersion}=${item.wardrobe}`).join(" | ") || "none"}
Fixed character voices: ${story.continuitySnapshot.voices.map(item =>
    `${item.characterName}: speaker=${item.speaker}; direction=${item.direction}; binding v${item.bindingVersion}`).join(" | ") || "none"}
Prop ownership and condition: ${story.continuitySnapshot.props.map(item =>
    `${item.name}: holder=${item.holder || "unspecified"}; condition=${item.condition}; state v${item.stateVersion}`).join(" | ") || "none"}
Allowed changes in this episode: ${story.continuitySnapshot.changes.map(item =>
    `${item.type}:${item.assetName}:${item.reason}`).join(" | ") || "NO CHANGES. Inherit all wardrobe, voices, props and locations exactly."}
Never change a character voice. Never change wardrobe, weapon, prop owner or prop condition unless listed under allowed changes.` : "",
    previousEpisode ? `Previous episode ending context: ${previousEpisode.summary}` : "This is the opening episode; establish reusable visual anchors.",
    nextEpisode ? `Next episode opening context: ${nextEpisode.summary}` : "This is the final planned episode; resolve the visual motion cleanly.",
    "End on a stable composition and continuous character action that can bridge into the next episode. Do not randomly change faces, wardrobe, props, architecture, lighting direction or voice identity.",
  ].join("\n") : "";
  return [
    `Create a ${ratio} ${style} video based on this original story episode.`,
    formatGuard,
    "The output must be an actual visual scene, not a placeholder card, not abstract UI lines, not a slideshow title card.",
    "No on-screen text, no subtitles, no logos, no watermark.",
    "Use coherent characters, atmospheric lighting, smooth camera movement and clear narrative progression.",
    "Keep it safe, non-explicit, suitable for general audiences.",
    `Episode title: ${story.episode.title}`,
    `Logline: ${story.logline}`,
    continuity,
    scenes,
    "Camera language: establishing shot, character close-up, object detail, slow push-in, emotional reveal, cliffhanger ending.",
  ].join("\n\n");
}

async function generateFallbackVideo(env, story, project, outputPath) {
  if (!isBillableGenerationEnabled(env)) throw new Error("真实视频生成未开启：请在制片配置中将 ALLOW_BILLABLE_GENERATION 设置为 true");
  if (!env.FALLBACK_VIDEO_API_URL || !env.FALLBACK_VIDEO_API_KEY || !env.FALLBACK_VIDEO_MODEL) {
    throw new Error("真实视频生成缺少兜底视频模型配置");
  }
  let response;
  try {
    response = await fetch(env.FALLBACK_VIDEO_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.FALLBACK_VIDEO_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.FALLBACK_VIDEO_MODEL,
        messages: [{ role: "user", content: buildVideoPrompt(story, project) }],
      }),
      signal: AbortSignal.timeout(Number(env.MODEL_REQUEST_TIMEOUT_MS || 600000)),
    });
  } catch (error) {
    if (error.name === "TimeoutError" || /aborted|timeout/i.test(error.message)) {
      throw new Error("真实视频模型生成超时，请调大请求超时或稍后重试");
    }
    throw error;
  }
  if (!response.ok) throw new Error(`真实视频模型请求失败 (${response.status}): ${(await response.text()).slice(0, 1000)}`);
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  const video = decodeVideoDataUri(content);
  await writeFile(outputPath, video);
}

async function generateArkVideo(env, story, project, outputPath) {
  if (!isBillableGenerationEnabled(env)) throw new Error("真实视频生成未开启，请先在制片配置中打开开关");
  if (!env.ARK_API_KEY || !env.ARK_BASE_URL || !env.ARK_VIDEO_MODEL) {
    throw new Error("Seedance 视频生成缺少方舟地址、API Key 或视频模型配置");
  }
  const baseUrl = env.ARK_BASE_URL.replace(/\/$/, "");
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${env.ARK_API_KEY}`,
  };
  const requestedDuration = Number(story.episode?.targetDurationSeconds ||
    project.specification?.episodeDurationSeconds || 5);
  const duration = Math.max(4, Math.min(30, Math.round(requestedDuration)));
  const ratio = project.specification?.ratio === "9:16" ? "9:16" : "16:9";
  const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) },
      signal: AbortSignal.timeout(Number(env.MODEL_REQUEST_TIMEOUT_MS || 600000)),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Seedance API ${response.status}: ${text.slice(0, 1200)}`);
    try { return JSON.parse(text); }
    catch { throw new Error(`Seedance API 返回无效 JSON：${text.slice(0, 300)}`); }
  };
  const references = await buildSeedanceReferences(env, story, project);
  const prompt = [
    buildVideoPrompt(story, project),
    references.audit.images.length
      ? `Reference images define immutable production assets: ${references.audit.images.map((item, index) => `image${index + 1}=${item.kind}/${item.assetName}${item.view ? `/${item.view}` : ""}`).join(", ")}. Match character identity and wardrobe, scene layout, and prop/weapon appearance exactly.`
      : "",
    references.audit.voiceSamples?.length
      ? `The first ${references.audit.voiceSamples.length} reference audio clips are immutable character voice identities: ${references.audit.voiceSamples.map((item, index) => `audio${index + 1}=${item.characterName}/${item.speaker}`).join(", ")}. Never swap voices between characters.`
      : "",
    references.audit.audio && !references.audit.audio.omitted
      ? `Use audio${references.audit.audio.referenceOrdinal} as the exact episode dialogue/timing guide. Preserve each character's bound voice identity and synchronize mouth motion to it.`
      : "",
    references.audit.video
      ? `Continue naturally from video1, which is the immediately preceding episode. Preserve its final character pose, camera direction, lighting, scene layout, wardrobe and prop state; begin this episode as one seamless continuation.`
      : "",
  ].filter(Boolean).join("\n\n");
  const content = [{ type: "text", text: prompt }, ...references.content];
  const usesPreviousVideo = Boolean(references.audit.video);
  const created = await request("/contents/generations/tasks", {
    method: "POST",
    body: JSON.stringify({
      model: env.ARK_VIDEO_MODEL,
      content,
      duration,
      ratio: usesPreviousVideo ? "adaptive" : ratio,
      resolution: "720p",
      generate_audio: project.specification?.audioStrategy !== "tts",
      return_last_frame: true,
      ...(usesPreviousVideo ? { omni_reference_task_type: "extend" } :
        references.content.length ? { omni_reference_task_type: "reference" } : {}),
    }),
  });
  if (!created.id) throw new Error("Seedance 创建任务成功但未返回任务 ID");
  const startedAt = Date.now();
  const timeoutMs = Number(env.MODEL_REQUEST_TIMEOUT_MS || 600000);
  let task;
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    task = await request(`/contents/generations/tasks/${encodeURIComponent(created.id)}`);
    if (task.status === "succeeded") break;
    if (["failed", "expired", "cancelled"].includes(task.status)) {
      throw new Error(`Seedance 任务 ${task.status}：${task.error?.message || JSON.stringify(task.error || {})}`);
    }
    if (!["queued", "running"].includes(task.status)) throw new Error(`Seedance 返回未知任务状态：${task.status || "empty"}`);
  }
  if (task?.status !== "succeeded") throw new Error(`Seedance 任务等待超时（任务 ID：${created.id}）`);
  const videoUrl = task.content?.video_url;
  if (!videoUrl) throw new Error(`Seedance 任务成功但没有返回视频地址（任务 ID：${created.id}）`);
  const videoResponse = await fetch(videoUrl, { signal: AbortSignal.timeout(120000) });
  if (!videoResponse.ok) throw new Error(`Seedance 视频下载失败：HTTP ${videoResponse.status}`);
  const video = Buffer.from(await videoResponse.arrayBuffer());
  const header = video.subarray(0, 32).toString("latin1");
  if (video.length < 10_000 || !header.includes("ftyp")) {
    throw new Error(`Seedance 返回内容不是合法 MP4（${video.length} bytes）`);
  }
  await writeFile(outputPath, video);
  return {
    remoteTaskId: created.id,
    model: env.ARK_VIDEO_MODEL,
    duration,
    ratio: usesPreviousVideo ? "adaptive" : ratio,
    bytes: video.length,
    sourceUrl: videoUrl,
    lastFrameUrl: task.content?.last_frame_url || null,
    taskType: usesPreviousVideo ? "extend" : references.content.length ? "reference" : "text",
    referenceInputs: references.audit,
  };
}

function decodeVideoDataUri(content) {
  if (typeof content !== "string" || !content.trim()) throw new Error("真实视频模型没有返回视频内容");
  const trimmed = content.trim();
  const match = trimmed.match(/^data:video\/mp4;base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) {
    const preview = trimmed.replace(/\s+/g, " ").slice(0, 160);
    throw new Error(`真实视频模型未返回 video/mp4 base64，返回内容预览：${preview}`);
  }
  const video = Buffer.from(match[1].replace(/\s+/g, ""), "base64");
  const header = video.subarray(0, 32).toString("latin1");
  if (video.length < 10_000 || !header.includes("ftyp")) {
    throw new Error(`真实视频模型返回内容不是可播放 MP4（${video.length} bytes）`);
  }
  return video;
}

function publicErrorMessage(error) {
  const message = String(error?.message || error || "生成失败");
  if (/moov atom not found|Invalid data found when processing input|Error opening input file/.test(message)) {
    return "视频模型返回的文件不是可播放 MP4，无法合成旁白。请检查兜底视频模型是否真正返回 video/mp4。";
  }
  if (/真实视频模型未返回|真实视频模型返回内容不是可播放 MP4|真实视频模型生成超时|no access to model|not found or not running/i.test(message)) {
    return message;
  }
  return message.split("\n")[0].slice(0, 240);
}

async function muxVideoWithAudio(projectDir, visualPath, audioPath, videoPath) {
  await run("ffmpeg", [
    "-y",
    "-i", visualPath,
    "-i", audioPath,
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "160k",
    "-shortest",
    "-movflags", "+faststart",
    videoPath,
  ], projectDir);
}

async function preserveNativeVideo(projectDir, visualPath, videoPath) {
  await run("ffmpeg", [
    "-y",
    "-i", visualPath,
    "-map", "0:v:0",
    "-map", "0:a:0",
    "-c", "copy",
    "-movflags", "+faststart",
    videoPath,
  ], projectDir);
}

async function writeEstimatedSubtitles(story, duration, subtitlePath) {
  const scenes = story.episode.scenes;
  const weights = scenes.map((scene) => Math.max(1, [...scene.narration].length));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const durations = weights.map((weight) => Math.max(2.5, (duration * weight) / totalWeight));
  const normalizedTotal = durations.reduce((sum, value) => sum + value, 0);
  const scale = duration / normalizedTotal;
  const adjusted = durations.map((value) => value * scale);
  let cursor = 0;
  const subtitles = scenes.map((scene, index) => {
    const start = cursor;
    cursor += adjusted[index];
    return `${index + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(cursor)}\n${wrapSubtitleText(scene.narration, 20, 3)}\n`;
  });
  await writeFile(subtitlePath, subtitles.join("\n"), "utf8");
}

async function renderVideo(projectDir, story, duration, audioPath, videoPath, subtitlePath) {
  const scenes = story.episode.scenes;
  const weights = scenes.map((scene) => Math.max(1, [...scene.narration].length));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const durations = weights.map((weight) => Math.max(2.5, (duration * weight) / totalWeight));
  const normalizedTotal = durations.reduce((sum, value) => sum + value, 0);
  const scale = duration / normalizedTotal;
  const adjusted = durations.map((value) => value * scale);

  await writeEstimatedSubtitles(story, duration, subtitlePath);

  const colors = ["0x111827", "0x261b2c", "0x182b2a"];
  const inputs = [];
  const filters = [];
  for (let index = 0; index < scenes.length; index += 1) {
    inputs.push(
      "-f", "lavfi",
      "-t", adjusted[index].toFixed(3),
      "-i", `color=c=${colors[index]}:s=720x1280:r=24`,
    );
    const fadeOutStart = Math.max(0, adjusted[index] - 0.6).toFixed(3);
    filters.push(
      `[${index}:v]drawbox=x=56:y=120:w=608:h=1040:color=black@0.18:t=fill,` +
      `drawbox=x=56:y=120:w=8:h=1040:color=0xd6aa66@0.85:t=fill,` +
      `drawbox=x=104:y=${300 + index * 120}:w=${420 - index * 45}:h=5:color=white@0.34:t=fill,` +
      `drawbox=x=104:y=${340 + index * 120}:w=${330 + index * 35}:h=3:color=white@0.18:t=fill,` +
      `fade=t=in:st=0:d=0.6,fade=t=out:st=${fadeOutStart}:d=0.6[v${index}]`,
    );
  }
  filters.push(`${scenes.map((_, index) => `[v${index}]`).join("")}concat=n=${scenes.length}:v=1:a=0[vout]`);

  await run("ffmpeg", [
    "-y",
    ...inputs,
    "-i", audioPath,
    "-filter_complex", filters.join(";"),
    "-map", "[vout]",
    "-map", `${scenes.length}:a`,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "22",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "160k",
    "-movflags", "+faststart",
    "-shortest",
    videoPath,
  ], projectDir);
}

export function validateInput(input, sourceDocument = null) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("无效项目内容");
  if (!["manual", "ai", "url"].includes(input.sourceType)) throw new Error("目前只支持正文、小说地址或剧情描述");
  const text = input.sourceType === "ai" ? input.premise :
    sourceDocument?.text || (input.sourceType === "url" ? input.resolvedContent : input.content);
  if (typeof text !== "string" || !text.trim()) throw new Error("请填写正文或剧情描述");
  if ([...text].length > MAX_NOVEL_CHARACTERS) {
    throw new Error("小说正文最多支持 100 万字符；请按卷拆分为多个项目");
  }
  if (input.sourceType !== "ai" && input.rightsConfirmed !== true) throw new Error("请确认改编授权");
  if (input.title != null && (typeof input.title !== "string" || input.title.length > 80)) throw new Error("项目名最多 80 字");
}

function analyzeSourceVolume(text) {
  const normalized = normalizeNovelText(text);
  const cjkCharacters = (normalized.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) || []).length;
  const latinWords = (normalized.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu) || [])
    .filter(token => !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(token)).length;
  // One English word carries roughly the adaptation information of 4.5 Chinese
  // characters. Punctuation and whitespace intentionally do not inflate volume.
  const equivalentUnits = cjkCharacters + latinWords * 4.5;
  const language = cjkCharacters > latinWords * 2 ? "zh" :
    latinWords > cjkCharacters ? "en" : "mixed";
  return {
    language,
    cjkCharacters,
    latinWords,
    equivalentUnits: Math.max(1, Math.round(equivalentUnits)),
  };
}

function sourceScopeInfo(sourceType, urlImport) {
  if (sourceType === "ai") return {
    scope: "ai_premise", provisional: true, label: "AI 剧情描述",
  };
  if (sourceType !== "url") return {
    scope: "provided_text", provisional: false, label: "已提供正文",
  };
  const scope = urlImport?.sourceScope ||
    (urlImport?.truncated ? "truncated_sample" : "complete_page");
  const labels = {
    chapter_sample: "公开章节样本",
    book_intro: "作品简介样本",
    truncated_sample: "已截取的正文片段",
    complete_page: "当前网页正文",
  };
  return {
    scope,
    provisional: scope !== "complete_page",
    label: labels[scope] || "当前导入内容",
  };
}

export function deriveEpisodePlan({
  sourceType, content, premise, format, episodeDurationSeconds, urlImport,
}) {
  const duration = Number(episodeDurationSeconds);
  if (!Number.isInteger(duration) || duration < 5 || duration > 10800) throw new Error("请选择有效的单集时长");
  if (format === "film") {
    return { episodeCount: 1, episodeDurationSeconds: duration, basis: "电影按单片结构制作，目标片长由用户指定" };
  }
  if (sourceType === "url" && !String(content || "").trim()) {
    return { episodeCount: null, episodeDurationSeconds: duration, basis: "读取并分析原文后生成集数" };
  }
  const text = String(sourceType === "ai" ? premise : content || "").trim();
  const volume = analyzeSourceVolume(text);
  const scope = sourceScopeInfo(sourceType, urlImport);
  // This is source material adapted per screen second, not narration speed.
  // It accounts for compression into dialogue, action and visual storytelling.
  const sourceUnitsPerSecond = format === "drama" ? 11 : format === "anime" ? 13 : 12;
  const capacity = Math.max(120, duration * sourceUnitsPerSecond);
  const minimumArc = sourceType === "ai" ? 3 : 1;
  const episodeCount = Math.min(MAX_EPISODES, Math.max(minimumArc, Math.ceil(volume.equivalentUnits / capacity)));
  const volumeText = volume.language === "en"
    ? `${volume.latinWords.toLocaleString("zh-CN")} 个英文单词`
    : volume.language === "zh"
      ? `${volume.cjkCharacters.toLocaleString("zh-CN")} 个中文字符`
      : `${volume.cjkCharacters.toLocaleString("zh-CN")} 个中文字符 + ${volume.latinWords.toLocaleString("zh-CN")} 个英文单词`;
  const qualifier = scope.provisional ? "；仅代表当前片段，不是整本书最终集数" : "";
  return {
    episodeCount,
    episodeDurationSeconds: duration,
    estimatedTotalSeconds: episodeCount * duration,
    sourceMetrics: volume,
    sourceScope: scope.scope,
    sourceScopeLabel: scope.label,
    provisional: scope.provisional,
    capacityEquivalentUnits: capacity,
    basis: `按${scope.label}中的 ${volumeText}、单集 ${duration} 秒和${format === "anime" ? "动漫" : format === "drama" ? "电视剧" : "视频"}改编节奏估算${qualifier}`,
  };
}

function formatDurationText(seconds) {
  if (!seconds) return "待定";
  if (seconds >= 3600) return `${Math.round(seconds / 60)} 分钟`;
  if (seconds >= 60) return `${Number((seconds / 60).toFixed(1))} 分钟`;
  return `${seconds} 秒`;
}

function productionCostEstimate(env, episodeCount, episodeDurationSeconds) {
  const unitCost = Number(env.VIDEO_COST_CNY_PER_SECOND);
  const seconds = Math.max(0, Number(episodeCount) * Number(episodeDurationSeconds || 0));
  if (!(unitCost > 0) || !Number.isFinite(unitCost)) {
    return {
      available: false, currency: "CNY", estimatedSeconds: seconds,
      reason: "未配置视频生成估算单价，无法在生产前估价",
    };
  }
  return {
    available: true,
    currency: "CNY",
    unitCostPerSecond: unitCost,
    estimatedSeconds: seconds,
    estimatedCost: Number((seconds * unitCost).toFixed(2)),
    actualCost: null,
    actualCostStatus: "provider_usage_unavailable",
  };
}

function episodeQualityReport(
  media, project, episodeNumber, advanced = null, semantic = null,
) {
  const expectedDuration = Number(project.specification?.episodeDurationSeconds || 0);
  const checks = [
    { id: "video_stream", required: true, passed: media.hasVideo === true, value: media.videoCodec || null },
    { id: "audio_stream", required: true, passed: media.hasAudio === true, value: media.audioCodec || null },
    { id: "positive_duration", required: true, passed: Number(media.duration) > 0, value: media.duration || null },
  ];
  if (media.width && media.height) {
    checks.push({
      id: "resolution", required: true,
      passed: media.width >= 640 && media.height >= 640,
      value: `${media.width}x${media.height}`,
    });
  }
  if (expectedDuration > 0 && media.duration > 0) {
    const differenceRatio = Math.abs(media.duration - expectedDuration) / expectedDuration;
    checks.push({
      id: "target_duration", required: false,
      passed: differenceRatio <= 0.25,
      value: media.duration,
      expected: expectedDuration,
      warning: differenceRatio > 0.25 ? "成片时长与目标时长偏差超过 25%" : null,
    });
  }
  if (advanced?.status === "analyzed") {
    const duration = Number(media.duration || 0);
    const blackLimit = Math.max(0.5, duration * 0.1);
    const freezeLimit = Math.max(2, duration * 0.2);
    checks.push(
      {
        id: "black_frames", required: true,
        passed: advanced.blackSeconds <= blackLimit,
        value: advanced.blackSeconds, expected: `≤ ${Number(blackLimit.toFixed(2))} 秒`,
      },
      {
        id: "frozen_frames", required: true,
        passed: advanced.freezeSeconds <= freezeLimit,
        value: advanced.freezeSeconds, expected: `≤ ${Number(freezeLimit.toFixed(2))} 秒`,
      },
      {
        id: "integrated_loudness", required: true,
        passed: advanced.integratedLoudnessLufs != null &&
          advanced.integratedLoudnessLufs >= -30 && advanced.integratedLoudnessLufs <= -8,
        value: advanced.integratedLoudnessLufs, expected: "-30 至 -8 LUFS",
      },
      {
        id: "true_peak", required: true,
        passed: advanced.truePeakDbfs != null && advanced.truePeakDbfs <= -1,
        value: advanced.truePeakDbfs, expected: "≤ -1 dBFS",
      },
    );
  }
  if (semantic) {
    checks.push(
      {
        id: "speech_content_consistency",
        required: true,
        passed: semantic.speech?.verified === true,
        value: semantic.speech?.similarity ?? semantic.speech?.proof ?? null,
        details: semantic.speech?.reason || null,
      },
      {
        id: "visual_asset_consistency",
        required: true,
        passed: semantic.visual?.status === "analyzed" &&
          semantic.visual?.passed === true,
        value: semantic.visual?.confidence ?? null,
        details: semantic.visual?.summary || semantic.visual?.reason || null,
      },
    );
  }
  const failedRequired = checks.filter(check => check.required && !check.passed);
  return {
    version: 1,
    episodeNumber,
    status: failedRequired.length ? "failed" : "passed",
    checkedAt: new Date().toISOString(),
    checks,
    advancedAnalysis: advanced,
    semanticAnalysis: semantic,
    warnings: checks.filter(check => !check.required && !check.passed)
      .map(check => check.warning).filter(Boolean),
  };
}

function sourceDocument(text, urlImport) {
  const normalized = normalizeNovelText(text);
  const paragraphs = [];
  let cursor = 0;
  for (const [index, value] of normalized.split(/\n{2,}/).map(item => item.trim()).filter(Boolean).entries()) {
    const startOffset = normalized.indexOf(value, cursor);
    const endOffset = startOffset + value.length;
    const heading = /^(?:第[零一二三四五六七八九十百千万两\d]+[章节卷回部篇]|chapter\s+\w+)/iu.test(value) &&
      [...value].length <= 80;
    paragraphs.push({
      id: `p-${String(index + 1).padStart(6, "0")}`,
      index, startOffset, endOffset, preview: value.slice(0, 120),
      type: heading ? "chapter_heading" : "paragraph",
    });
    cursor = endOffset;
  }
  if (!paragraphs.length && normalized) {
    paragraphs.push({
      id: "p-000001", index: 0, startOffset: 0, endOffset: normalized.length,
      preview: normalized.slice(0, 120), type: "paragraph",
    });
  }
  const chapters = [];
  for (const paragraph of paragraphs) {
    if (paragraph.type !== "chapter_heading") continue;
    chapters.push({
      id: `chapter-${String(chapters.length + 1).padStart(3, "0")}`,
      title: normalized.slice(paragraph.startOffset, paragraph.endOffset),
      startParagraphId: paragraph.id, startOffset: paragraph.startOffset,
    });
  }
  if (!chapters.length && paragraphs.length) {
    chapters.push({
      id: "chapter-001", title: urlImport?.chapter?.title || "正文",
      startParagraphId: paragraphs[0].id, startOffset: 0,
    });
  }
  chapters.forEach((chapter, index) => {
    const next = chapters[index + 1];
    chapter.endOffset = next ? next.startOffset : normalized.length;
    chapter.endParagraphId = [...paragraphs].reverse()
      .find(item => item.endOffset <= chapter.endOffset)?.id || paragraphs.at(-1)?.id || null;
  });
  return {
    version: 2,
    text: normalized,
    characterCount: [...normalized].length,
    byteCount: Buffer.byteLength(normalized, "utf8"),
    sha256: createHash("sha256").update(normalized).digest("hex"),
    paragraphCount: paragraphs.length,
    chapterCount: chapters.length,
    importedAt: new Date().toISOString(),
    truncated: Boolean(urlImport?.truncated),
    paragraphs,
    chapters,
  };
}

function sourceRangeForEpisode(document, index, count) {
  const paragraphs = document.paragraphs;
  if (!paragraphs.length) return {
    chapterStart: null, chapterEnd: null, startParagraphId: null, endParagraphId: null,
    startOffset: 0, endOffset: 0, excerpt: "", characterCount: 0, coverageRatio: 0,
  };
  // Offsets are authoritative and form contiguous, non-overlapping half-open ranges.
  // Paragraph IDs remain stable anchors even when a very long paragraph spans episodes.
  const startOffset = Math.floor(index * document.text.length / count);
  const endOffset = index === count - 1 ? document.text.length :
    Math.floor((index + 1) * document.text.length / count);
  const lowerBound = (items, predicate) => {
    let low = 0;
    let high = items.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (predicate(items[middle])) high = middle;
      else low = middle + 1;
    }
    return low;
  };
  const firstParagraph = lowerBound(paragraphs, item => item.endOffset > startOffset);
  const afterLastParagraph = lowerBound(paragraphs, item => item.startOffset >= endOffset);
  const included = paragraphs.slice(firstParagraph, afterLastParagraph);
  const start = included[0] || paragraphs[0];
  const end = included.at(-1) || paragraphs.at(-1);
  const firstChapter = lowerBound(document.chapters, item => item.endOffset > startOffset);
  const afterLastChapter = lowerBound(document.chapters, item => item.startOffset >= endOffset);
  const chapters = document.chapters.slice(firstChapter, afterLastChapter);
  const preview = document.text.slice(
    startOffset, Math.min(endOffset, startOffset + SOURCE_PREVIEW_CHARACTERS),
  );
  return {
    chapterStart: chapters[0]?.title || null,
    chapterEnd: chapters.at(-1)?.title || null,
    startParagraphId: start.id,
    endParagraphId: end.id,
    paragraphIds: included.length <= 50 ? included.map(item => item.id) :
      [included[0].id, included.at(-1).id],
    startOffset,
    endOffset,
    preview,
    characterCount: endOffset - startOffset,
    coverageRatio: document.text.length ? Number(((endOffset - startOffset) / document.text.length).toFixed(4)) : 0,
  };
}

export function buildSeriesPlan({ title, sourceType, content, premise, format, episodeDurationSeconds, urlImport }) {
  const episodePlan = deriveEpisodePlan({
    sourceType, content, premise, format, episodeDurationSeconds, urlImport,
  });
  if (!episodePlan.episodeCount) {
    return {
      ...episodePlan,
      title: safeText(title, 80) || "待解析作品",
      format,
      planningMode: "pending_source",
      summary: urlImport?.error || "已保存小说地址。读取并确认正文后，系统会根据内容体量和每集时长自动生成建议集数。",
      episodes: [],
      milestones: ["读取正文", "确认版权与来源", "分析内容体量", "生成分集方案"],
    };
  }

  const rawText = sourceType === "ai" ? premise : content;
  const document = sourceDocument(rawText, urlImport);
  const text = document.text;
  const sentences = splitSentences(text);
  const count = episodePlan.episodeCount;
  const perEpisode = Math.max(1, Math.ceil(sentences.length / count));
  const episodes = Array.from({ length: count }, (_, index) => {
    const slice = sentences.slice(index * perEpisode, (index + 1) * perEpisode);
    const fallback = sentences[index % Math.max(1, sentences.length)] || text || "等待补充剧情";
    const joined = safeText(slice.join(" ") || fallback, 170);
    const isFirst = index === 0;
    const isLast = index === count - 1;
    const source = sourceRangeForEpisode(document, index, count);
    return {
      number: index + 1,
      title: isFirst ? "开场钩子" : isLast ? "阶段悬念" : `推进与反转 ${index + 1}`,
      targetDurationSeconds: episodePlan.episodeDurationSeconds,
      summary: joined,
      hook: isLast ? "留下下一阶段核心疑问" : "以新线索或人物选择收束，推动追看",
      source,
      storyBeats: slice.map((beat, beatIndex) => ({
        id: `ep-${index + 1}-beat-${beatIndex + 1}`, text: safeText(beat, 140),
      })),
      characters: [],
      scenes: [],
      props: [],
      cliffhanger: isLast ? "留下下一阶段核心疑问" : "以新线索或人物选择收束，推动追看",
      estimatedDurationSeconds: episodePlan.episodeDurationSeconds,
    };
  });

  return {
    ...episodePlan,
    title: safeText(title, 80) || safeText(text, 18) || "未命名故事",
    format,
    planningMode: "heuristic",
    summary: safeText(text, 260),
    totalDurationText: formatDurationText(episodePlan.estimatedTotalSeconds),
    episodeDurationText: formatDurationText(episodePlan.episodeDurationSeconds),
    episodes,
    sourceDocument: document,
    sourceCoverage: {
      coveredCharacters: episodes.reduce((total, episode) => total + episode.source.characterCount, 0),
      totalCharacters: document.characterCount,
      ratio: document.characterCount ? 1 : 0,
      overlaps: [],
      gaps: [],
    },
    milestones: ["故事设定", "分集大纲", "前三集样片", "批量制作"],
  };
}

function normalizeEpisodeStates(project) {
  const existing = new Map((project.episodeStates || []).map(item => [item.number, item]));
  const assets = new Map((project.assets?.episodes || []).map(item => [item.number, item]));
  return (project.seriesPlan?.episodes || []).map(episode => ({
    number: episode.number,
    title: episode.title,
    summary: episode.summary,
    status: "not_started",
    stage: "未生成",
    progress: 0,
    error: null,
    ...(assets.has(episode.number) ? {
      status: "completed",
      stage: "已完成",
      progress: 100,
      duration: assets.get(episode.number).duration,
      assets: assets.get(episode.number),
    } : {}),
    ...existing.get(episode.number),
  }));
}

export function createMvpPipeline({ dataDir, env, onUpdate, services = {} }) {
  const projectsDir = join(dataDir, "projects");
  const pending = [];
  const scheduled = new Set();
  const productionControls = new Map();
  let draining = false;
  const speech = services.speech || synthesizeSpeech;
  const probe = services.probe || probeDuration;
  const mediaProbe = services.mediaProbe || probeMedia;
  const mediaQualityAnalyzer = services.mediaQualityAnalyzer ||
    (services.mediaProbe
      ? async () => ({ status: "unavailable", reason: "测试媒体适配器未提供高级质检" })
      : async path => ({ status: "analyzed", ...(await analyzeMediaQuality(path)) }));
  const visualConsistencyAnalyzer = services.visualConsistencyAnalyzer ||
    (services.mediaProbe
      ? async () => ({
        status: "analyzed", passed: true, confidence: 1,
        summary: "测试媒体适配器视觉一致性通过",
      })
      : analyzeVisualConsistency);
  const nativeSpeechVerifier = services.nativeSpeechVerifier ||
    (services.nativeVoiceVerifier
      ? async () => ({
        status: "analyzed", verified: true, similarity: 1,
        reason: "测试音色适配器原声内容通过",
      })
      : verifyNativeSpeechWithAsr);
  const semanticQualityOperational = () => {
    if (typeof services.semanticQualityOperational === "function") {
      return services.semanticQualityOperational();
    }
    return Boolean(services.visualConsistencyAnalyzer || services.mediaProbe);
  };
  const render = services.render || renderVideo;
  const realVideo = services.realVideo || (env.ARK_API_KEY && env.ARK_VIDEO_MODEL ? generateArkVideo : generateFallbackVideo);
  const mux = services.mux || muxVideoWithAudio;
  const preserveNative = services.preserveNative || preserveNativeVideo;
  const sourceFetcher = services.sourceFetcher || fetchSourceFromUrl;
  const bibleAnalyzer = services.bibleAnalyzer || analyzeProductionBible;
  const imageGenerator = services.imageGenerator || generateArkImage;
  const characterSheetSplitter = services.characterSheetSplitter || splitCharacterSheet;
  const seriesAssembler = services.seriesAssembler || (async (projectDir, listPath, outputPath) => {
    await run("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0", "-i", listPath,
      "-c", "copy", "-movflags", "+faststart", outputPath,
    ], projectDir);
    return probe(outputPath);
  });
  const nativeVoiceVerifier = services.nativeVoiceVerifier || (async (_path, _snapshot, generation) => ({
    verified: generation?.voiceConsistencyVerified === true,
    reason: generation?.voiceConsistencyVerified === true
      ? "视频模型返回了角色音色一致性证明"
      : "当前没有可验证角色音色身份的多模态结果",
  }));

  async function update(project, patch) {
    Object.assign(project, patch, { updatedAt: new Date().toISOString() });
    const temporary = join(project.dir, `project-${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(project, null, 2), "utf8");
    await rename(temporary, join(project.dir, "project.json"));
    onUpdate?.(project);
  }

  async function createVersionSnapshot(project, reason) {
    const versionsDir = join(project.dir, "versions");
    await mkdir(versionsDir, { recursive: true });
    const snapshot = {
      id: randomUUID(),
      projectId: project.id,
      reason: safeText(reason, 200) || "关键修改前自动备份",
      createdAt: new Date().toISOString(),
      state: {
        title: project.title,
        specification: project.specification,
        seriesPlan: project.seriesPlan,
        productionBible: project.productionBible,
        continuityLedger: project.continuityLedger,
        episodeStates: project.episodeStates,
        assets: project.assets,
        assembly: project.assembly,
      },
    };
    await writeFile(join(versionsDir, `${snapshot.id}.json`), JSON.stringify(snapshot), "utf8");
    return snapshot;
  }

  async function drain() {
    if (draining) return;
    draining = true;
    try {
      while (pending.length) {
        const project = pending.shift();
        try { await api.run(project); }
        catch (error) { console.error("项目状态写入失败", project.id, error.code || "unknown"); }
        finally { scheduled.delete(project.id); }
      }
    } finally { draining = false; }
  }

  const api = {
    isScheduled(id) {
      return scheduled.has(id);
    },

    async initialize() {
      await mkdir(projectsDir, { recursive: true });
      for (const project of await api.list()) {
        if (["running", "queued"].includes(project.status)) {
          if (project.productionRun?.mode === "full_series") {
            project.productionRun.status = "failed";
            project.productionRun.failedStage = "interrupted";
            project.productionRun.error = "应用重启中断了全集生产；已完成分集会保留。";
            project.productionRun.updatedAt = new Date().toISOString();
          }
          await update(project, {
            status: "failed",
            stage: "任务被服务重启中断",
            error: project.productionRun?.mode === "full_series"
              ? "请在生产总控中继续；系统会跳过已完成分集。"
              : "请点击重试；已生成的旁白会在校验后复用。",
            productionRun: project.productionRun,
          });
        }
      }
    },

    async list() {
      const entries = await readdir(projectsDir, { withFileTypes: true });
      const items = await Promise.all(entries.filter(e => e.isDirectory() && /^[0-9a-f-]{36}$/.test(e.name)).map(async e => {
        try { return await api.read(e.name); } catch { return null; }
      }));
      return items.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async createPlan(input) {
      if (!input || !["manual", "ai", "url"].includes(input.sourceType)) throw new Error("请选择故事来源");
      if (!["anime", "drama", "film", "other"].includes(input.format)) throw new Error("请选择成片类型");
      if (input.audioStrategy != null && !["auto", "tts", "native"].includes(input.audioStrategy)) {
        throw new Error("请选择有效的声音方案");
      }
      const content = input.sourceType === "manual" ? input.content : input.sourceType === "ai" ? input.premise : input.url;
      if (typeof content !== "string" || !content.trim()) throw new Error("请输入故事、小说地址或创作描述");
      if (input.sourceType !== "url" && [...content].length > MAX_NOVEL_CHARACTERS) {
        throw new Error("小说正文最多支持 100 万字符；请按卷拆分为多个项目");
      }
      if (input.sourceType === "url" && content.length > 4_000) throw new Error("小说地址过长");
      if (input.sourceType !== "ai" && input.rightsConfirmed !== true) throw new Error("请确认内容使用权");
      if (input.sourceType === "url") {
        let url;
        try { url = new URL(content); } catch { throw new Error("小说地址格式不正确"); }
        if (!["http:", "https:"].includes(url.protocol)) throw new Error("仅支持 HTTP/HTTPS 地址");
      }
      let urlImport = null;
      const originalSourceType = input.sourceType;
      const originalUrl = input.sourceType === "url" ? content : "";
      let effectiveInput = input;
      if (input.sourceType === "url") {
        try {
          urlImport = await sourceFetcher(content);
          effectiveInput = { ...input, content: urlImport.content };
        } catch (error) {
          urlImport = { url: content, error: error.message };
        }
      }
      const effectiveSeriesPlan = buildSeriesPlan({ ...effectiveInput, urlImport });
      const productionBible = buildProductionBible(effectiveInput, effectiveSeriesPlan);
      const confirmedSourceUrl = originalSourceType === "url" ? originalUrl : safeText(effectiveInput.sourceUrl, 1000);
      const title = safeText(input.title, 80) || safeText(urlImport?.title, 80) ||
        (originalSourceType === "url" ? "链接故事" : safeText(content, 18));
      const id = randomUUID();
      const project = {
        id, dir: join(projectsDir, id),
        title,
        status: "draft", stage: "方案已保存", progress: 0,
        createdAt: new Date().toISOString(),
        specification: {
          format: input.format,
          episodeCount: effectiveSeriesPlan.episodeCount,
          episodeDurationSeconds: effectiveSeriesPlan.episodeDurationSeconds,
          estimatedTotalSeconds: effectiveSeriesPlan.estimatedTotalSeconds,
          basis: effectiveSeriesPlan.basis,
          ratio: input.ratio === "16:9" ? "16:9" : "9:16",
          audioStrategy: input.audioStrategy || "auto",
          productionStatus: "not_connected",
        },
        seriesPlan: effectiveSeriesPlan,
        productionBible,
        episodeStates: effectiveSeriesPlan.episodes.map(episode => ({
          number: episode.number,
          title: episode.title,
          summary: episode.summary,
          status: "not_started",
          stage: "未生成",
          progress: 0,
          error: null,
        })),
        sourceImport: urlImport || (confirmedSourceUrl ? {
          url: confirmedSourceUrl,
          importedVia: "browser_confirmed",
        } : null),
        input: {
          sourceType: originalSourceType,
          effectiveSourceType: originalSourceType === "url" && urlImport?.content ? "resolved_url" : originalSourceType,
          // The authoritative full text lives once in seriesPlan.sourceDocument.
          // These previews keep old integrations compatible without duplicating a novel.
          content: originalSourceType === "manual" || originalSourceType === "url"
            ? safeText(effectiveSeriesPlan.sourceDocument?.text, 12_000) : "",
          resolvedContent: originalSourceType === "url"
            ? safeText(effectiveSeriesPlan.sourceDocument?.text, 12_000) : "",
          premise: originalSourceType === "ai" ? safeText(content, 12_000) : "",
          url: confirmedSourceUrl,
          title: safeText(input.title, 80), rightsConfirmed: input.rightsConfirmed === true,
        },
      };
      project.continuityLedger = buildProjectContinuityLedger(project);
      await mkdir(project.dir, { recursive: true });
      await update(project, {});
      return project;
    },

    async startSample(id) {
      if (scheduled.has(id)) throw new Error("任务已在队列中");
      scheduled.add(id);
      try {
        const project = await api.read(id);
        if (project.status !== "draft") throw new Error("该方案已有试制任务");
        validateInput(project.input, project.seriesPlan?.sourceDocument);
        await update(project, { status: "queued", stage: "等待流程自检片", generationMode: "self_check", previewOnly: true });
        pending.push(project);
        void drain();
        return project;
      } catch (error) {
        scheduled.delete(id);
        throw error;
      }
    },

    async startRealVideo(id, options = {}) {
      if (scheduled.has(id)) throw new Error("任务已在队列中");
      scheduled.add(id);
      try {
        const project = await api.read(id);
        if (project.status !== "draft") throw new Error("该方案已有生成任务");
        validateInput(project.input, project.seriesPlan?.sourceDocument);
        if (!isBillableGenerationEnabled(env)) throw new Error("真实视频生成未开启：请先在制片配置中打开 ALLOW_BILLABLE_GENERATION");
        if (!semanticQualityOperational()) {
          throw new Error("多模态成片一致性质检未通过运行检查，不能开始真实视频生成");
        }
        if (seedanceMultimodalEnabled(env)) {
          const readiness = productionAssetReadiness(project);
          if (!readiness.ready) {
            throw new Error(`制片资产包尚未完成，不能生成视频。请先补齐：${readiness.missing.join("、")}`);
          }
        }
        const requested = Number(options.episodeLimit || 1);
        if (!Number.isInteger(requested) || requested < 1 || requested > 3) throw new Error("首轮试制支持 1–3 集");
        const productionEpisodeLimit = Math.min(requested, Math.max(1, project.seriesPlan?.episodeCount || 1));
        const productionEpisodeNumbers = Array.from({ length: productionEpisodeLimit }, (_, index) => index + 1);
        const episodeStates = normalizeEpisodeStates(project);
        for (const number of productionEpisodeNumbers) {
          Object.assign(episodeStates[number - 1], {
            status: "queued", stage: "等待生成", progress: 0, error: null,
          });
        }
        await update(project, {
          status: "queued",
          stage: `等待前 ${productionEpisodeLimit} 集真实视频样片`,
          generationMode: "real_video",
          previewOnly: false,
          productionEpisodeLimit,
          productionEpisodeNumbers,
          episodeStates,
        });
        pending.push(project);
        void drain();
        return project;
      } catch (error) {
        scheduled.delete(id);
        throw error;
      }
    },

    async startSeriesProduction(id, options = {}) {
      if (scheduled.has(id)) throw new Error("项目已有任务在运行");
      const project = await api.read(id);
      if (["queued", "running"].includes(project.status)) throw new Error("项目已有任务在运行");
      validateInput(project.input, project.seriesPlan?.sourceDocument);
      if (!isBillableGenerationEnabled(env)) {
        throw new Error("全集生产未开启：请先在制片配置中打开真实视频生成开关");
      }
      const readiness = productionAssetReadiness(project);
      if (!readiness.ready) {
        throw new Error(`制片资产包尚未完成，不能开始全集生产。请先补齐：${readiness.missing.join("、")}`);
      }
      const completed = new Set((project.assets?.episodes || []).map(item => item.number));
      const episodeNumbers = (project.seriesPlan?.episodes || [])
        .map(item => item.number)
        .filter(number => !completed.has(number));
      if (!episodeNumbers.length) throw new Error("所有分集均已完成，无需重复生成");
      const costEstimate = productionCostEstimate(
        env, episodeNumbers.length, project.specification?.episodeDurationSeconds,
      );
      const dailyBudget = Number(env.DAILY_BUDGET_CNY);
      if (costEstimate.available && dailyBudget > 0 &&
          costEstimate.estimatedCost > dailyBudget) {
        throw new Error(
          `本次预计费用 ¥${costEstimate.estimatedCost}，超过每日预算 ¥${dailyBudget}；请缩小批次或调整预算`,
        );
      }
      if (!semanticQualityOperational()) {
        throw new Error("多模态成片一致性质检未通过运行检查，不能开始全集生产");
      }
      if (options.confirmBillable !== true ||
          Number(options.confirmedEpisodeCount) !== episodeNumbers.length) {
        throw new Error(`请确认本次将调用模型生成 ${episodeNumbers.length} 集`);
      }
      scheduled.add(id);
      try {
        productionControls.delete(id);
        const episodeStates = normalizeEpisodeStates(project);
        for (const number of episodeNumbers) {
          Object.assign(episodeStates[number - 1], {
            status: "queued", stage: "等待全集生产", progress: 0, error: null,
          });
        }
        const productionRun = {
          id: randomUUID(),
          status: "queued",
          mode: "full_series",
          totalEpisodes: project.seriesPlan.episodeCount,
          submittedEpisodes: episodeNumbers,
          completedBeforeRun: completed.size,
          completedEpisodes: completed.size,
          failedEpisode: null,
          control: { requested: null, requestedAt: null },
          costEstimate,
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await update(project, {
          status: "queued",
          stage: `全集生产已排队 · 待生成 ${episodeNumbers.length} 集`,
          progress: Math.round(completed.size / project.seriesPlan.episodeCount * 100),
          error: null,
          generationMode: "real_video",
          productionMode: "full_series",
          previewOnly: false,
          productionEpisodeNumbers: episodeNumbers,
          productionEpisodeLimit: episodeNumbers.length,
          episodeStates,
          productionRun,
        });
        pending.push(project);
        void drain();
        return project;
      } catch (error) {
        scheduled.delete(id);
        throw error;
      }
    },

    async productionPreflight(id) {
      const project = await api.read(id);
      const completed = new Set((project.assets?.episodes || []).map(item => item.number));
      const remainingEpisodes = (project.seriesPlan?.episodes || [])
        .map(item => item.number)
        .filter(number => !completed.has(number));
      const costEstimate = productionCostEstimate(
        env, remainingEpisodes.length, project.specification?.episodeDurationSeconds,
      );
      const dailyBudget = Number(env.DAILY_BUDGET_CNY);
      const readiness = productionAssetReadiness(project);
      const blockers = [];
      if (!isBillableGenerationEnabled(env)) blockers.push("真实视频生成开关未开启");
      if (!semanticQualityOperational()) blockers.push("多模态成片一致性质检不可用或未通过运行检查");
      if (!readiness.ready) blockers.push(...readiness.missing);
      if (!remainingEpisodes.length) blockers.push("所有分集均已完成");
      if (costEstimate.available && dailyBudget > 0 &&
          costEstimate.estimatedCost > dailyBudget) {
        blockers.push(`预计费用 ¥${costEstimate.estimatedCost} 超过每日预算 ¥${dailyBudget}`);
      }
      return {
        projectId: id,
        ready: blockers.length === 0,
        remainingEpisodes,
        remainingCount: remainingEpisodes.length,
        completedCount: completed.size,
        episodeDurationSeconds: project.specification?.episodeDurationSeconds || null,
        costEstimate,
        dailyBudget: dailyBudget > 0 ? dailyBudget : null,
        blockers,
      };
    },

    async controlSeriesProduction(id, command) {
      if (!["pause", "stop"].includes(command)) throw new Error("不支持的生产控制命令");
      const project = await api.read(id);
      if (project.productionRun?.mode !== "full_series" ||
          !["queued", "running"].includes(project.status)) {
        throw new Error("当前没有可控制的全集生产任务");
      }
      project.productionRun.control = {
        requested: command,
        requestedAt: new Date().toISOString(),
      };
      productionControls.set(id, {
        requested: command,
        requestedAt: project.productionRun.control.requestedAt,
      });
      project.productionRun.updatedAt = new Date().toISOString();
      await update(project, {
        productionRun: project.productionRun,
        stage: command === "pause"
          ? "已请求暂停 · 当前分集完成后暂停"
          : "已请求停止 · 当前分集完成后结束本轮",
      });
      return project;
    },

    async startEpisode(id, episodeNumber) {
      if (scheduled.has(id)) throw new Error("项目已有任务在运行");
      scheduled.add(id);
      try {
        const project = await api.read(id);
        validateInput(project.input, project.seriesPlan?.sourceDocument);
        if (!isBillableGenerationEnabled(env)) throw new Error("真实视频生成未开启：请先在制片配置中打开开关");
        if (!semanticQualityOperational()) {
          throw new Error("多模态成片一致性质检未通过运行检查，不能生成分集");
        }
        if (seedanceMultimodalEnabled(env)) {
          const readiness = productionAssetReadiness(project);
          if (!readiness.ready) {
            throw new Error(`制片资产包尚未完成，不能生成视频。请先补齐：${readiness.missing.join("、")}`);
          }
        }
        const number = Number(episodeNumber);
        if (!Number.isInteger(number) || number < 1 || number > (project.seriesPlan?.episodeCount || 0)) {
          throw new Error("分集编号无效");
        }
        const episodeStates = normalizeEpisodeStates(project);
        Object.assign(episodeStates[number - 1], {
          status: "queued", stage: "等待重新生成", progress: 0, error: null,
        });
        await update(project, {
          status: "queued",
          stage: `等待生成第 ${number} 集`,
          progress: 0,
          error: null,
          generationMode: "real_video",
          previewOnly: false,
          productionEpisodeNumbers: [number],
          productionEpisodeLimit: 1,
          episodeStates,
        });
        pending.push(project);
        void drain();
        return project;
      } catch (error) {
        scheduled.delete(id);
        throw error;
      }
    },

    async updateProductionBible(id, changes) {
      const project = await api.read(id);
      await createVersionSnapshot(project, "修改制片圣经前");
      const bible = project.productionBible || buildProductionBible(project.input, project.seriesPlan);
      if (!changes || typeof changes !== "object" || Array.isArray(changes)) throw new Error("制片资产配置无效");
      if (changes.characterId) {
        const character = bible.characters.find(item => item.id === changes.characterId);
        if (!character) throw new Error("角色不存在");
        if (changes.visualAnchor != null) character.visualAnchor = safeText(changes.visualAnchor, 500);
        if (changes.description != null) character.description = safeText(changes.description, 500);
        if (changes.defaultWardrobe != null) character.defaultWardrobe = safeText(changes.defaultWardrobe, 500);
        if (changes.locked != null) character.locked = changes.locked === true;
      }
      if (changes.voiceId) {
        const voice = bible.voices.find(item => item.id === changes.voiceId);
        if (!voice) throw new Error("音色不存在");
        if (changes.speaker != null) {
          const nextSpeaker = safeText(changes.speaker, 80);
          if (voice.speaker !== nextSpeaker) {
            voice.bindingVersion = (voice.bindingVersion || 1) + 1;
            voice.sample = null;
            voice.sampleGeneratedAt = null;
          }
          voice.speaker = nextSpeaker;
        }
        if (changes.direction != null) {
          const nextDirection = safeText(changes.direction, 300);
          if (voice.direction !== nextDirection) {
            voice.sample = null;
            voice.sampleGeneratedAt = null;
          }
          voice.direction = nextDirection;
        }
        if (changes.locked != null) voice.locked = changes.locked === true;
        voice.status = voice.speaker && voice.speaker !== "待选择" ? "configured" : "needs_config";
      }
      if (changes.continuity && typeof changes.continuity === "object" && !Array.isArray(changes.continuity)) {
        const allowed = ["enabled", "characterIdentity", "wardrobe", "sceneLayout", "props", "colorScript",
          "voiceIdentity", "previousEpisodeContext", "lastFrameBridge"];
        for (const key of allowed) if (key in changes.continuity) bible.continuity[key] = changes.continuity[key] === true;
        if (changes.continuity.transitionStyle != null) {
          bible.continuity.transitionStyle = safeText(changes.continuity.transitionStyle, 200);
        }
      }
      bible.status = bible.characters.every(item => item.locked) &&
        bible.voices.every(item => item.locked) ? "locked" : "needs_review";
      project.continuityLedger = buildProjectContinuityLedger(project, project.continuityLedger);
      await update(project, { productionBible: bible, continuityLedger: project.continuityLedger });
      return project;
    },

    async analyzeBible(id) {
      const project = await api.read(id);
      if (scheduled.has(id)) throw new Error("项目已有生成任务在运行");
      const previous = project.productionBible;
      await update(project, {
        productionBible: { ...previous, status: "analyzing", error: null },
      });
      try {
        const productionBible = await bibleAnalyzer(env, project);
        project.productionBible = normalizeProductionBible(productionBible);
        project.continuityLedger = buildProjectContinuityLedger(project, project.continuityLedger);
        await update(project, {
          productionBible: project.productionBible,
          continuityLedger: project.continuityLedger,
        });
        return project;
      } catch (error) {
        await update(project, {
          productionBible: { ...previous, status: "analysis_failed", error: publicErrorMessage(error) },
        });
        throw error;
      }
    },

    async prepareProductionAssets(id) {
      if (scheduled.has(id)) throw new Error("项目已有生成任务在运行");
      scheduled.add(id);
      let project = await api.read(id);
      try {
        await update(project, {
          assetPreparation: {
            status: "running", stage: "AI 分析人物、场景、武器道具与音色", progress: 5,
            startedAt: new Date().toISOString(), error: null,
          },
        });
        if (!project.productionBible?.analyzedAt) {
          project.productionBible = normalizeProductionBible(await bibleAnalyzer(env, project));
          project.continuityLedger = buildProjectContinuityLedger(project, project.continuityLedger);
          await update(project, {
            productionBible: project.productionBible,
            continuityLedger: project.continuityLedger,
          });
        }
        const bible = project.productionBible;
        const visualAssets = [
          ...bible.characters.map(asset => ({ type: "character", asset })),
          ...bible.scenes.map(asset => ({ type: "scene", asset })),
          ...bible.props.map(asset => ({ type: "prop", asset })),
        ];
        let finished = 0;
        for (const { type, asset } of visualAssets) {
          const alreadyReady = type === "character"
            ? ["front", "threeQuarter", "side", "back"].every(view => asset.views?.[view])
            : Boolean(asset.image);
          if (!alreadyReady) {
            asset.status = "generating";
            await update(project, { productionBible: bible });
            const generated = await imageGenerator(env, imagePromptForAsset(project, type, asset));
            const base = `${type}-${asset.id}`;
            const filename = `${base}-sheet.${generated.extension}`;
            const path = join(project.dir, filename);
            await writeFile(path, generated.buffer);
            asset.sheet = `/api/projects/${project.id}/assets/${filename}`;
            asset.image = asset.sheet;
            asset.generation = generated.generation;
            if (type === "character") {
              const views = await characterSheetSplitter(project.dir, path, base, generated.extension);
              asset.views = Object.fromEntries(Object.entries(views).map(([key, file]) =>
                [key, `/api/projects/${project.id}/assets/${file}`]));
            }
            asset.status = "ready";
            asset.generatedAt = new Date().toISOString();
          }
          finished++;
          await update(project, {
            productionBible: bible,
            assetPreparation: {
              ...project.assetPreparation,
              stage: `生成制片视觉资产 ${finished}/${visualAssets.length}`,
              progress: 10 + Math.round((finished / Math.max(1, visualAssets.length)) * 70),
            },
          });
        }
        const availableVoices = await fetchTtsVoices(env.TTS_API_URL);
        const usedSpeakers = new Set();
        for (let index = 0; index < bible.voices.length; index++) {
          const voice = bible.voices[index];
          const character = bible.characters.find(item => item.id === voice.characterId);
          const duplicate = usedSpeakers.has(voice.speaker);
          if (!voice.speaker || voice.speaker === "待选择" || duplicate) {
            const nextSpeaker = chooseCharacterSpeaker(character, voice, availableVoices, usedSpeakers);
            if (!nextSpeaker) throw new Error(`${voice.characterName}没有可分配的独立中文音色`);
            if (voice.speaker !== nextSpeaker) {
              voice.speaker = nextSpeaker;
              voice.bindingVersion = (voice.bindingVersion || 1) + 1;
              voice.sample = null;
              voice.sampleGeneratedAt = null;
            }
          }
          usedSpeakers.add(voice.speaker);
          voice.direction ||= "自然、符合人物年龄与身份，保持稳定声线";
          voice.status = "configured";
          if (!voice.sample) {
            const filename = `voice-${voice.id}-sample.wav`;
            await synthesizeVoiceSample(env.TTS_API_URL, voice, join(project.dir, filename));
            voice.sample = `/api/projects/${project.id}/assets/${filename}`;
            voice.sampleGeneratedAt = new Date().toISOString();
            voice.status = "configured";
          }
          const referenceDuration = 1.8;
          if (!voice.referenceSample || Number(voice.referenceSampleDuration || 0) < referenceDuration) {
            const source = join(project.dir, basename(new URL(voice.sample, "http://localhost").pathname));
            const filename = `voice-${voice.id}-reference.wav`;
            await run("ffmpeg", [
              "-y", "-i", source, "-t", String(referenceDuration), "-ac", "1", "-ar", "24000",
              join(project.dir, filename),
            ], project.dir);
            voice.referenceSample = `/api/projects/${project.id}/assets/${filename}`;
            voice.referenceSampleDuration = referenceDuration;
          }
          await update(project, {
            productionBible: bible,
            assetPreparation: {
              ...project.assetPreparation,
              stage: `生成固定角色音色样本 ${index + 1}/${bible.voices.length}`,
              progress: 82 + Math.round(((index + 1) / Math.max(1, bible.voices.length)) * 15),
            },
          });
        }
        const readiness = productionAssetReadiness(project);
        if (!readiness.ready) throw new Error(`资产验收未通过：${readiness.missing.join("、")}`);
        bible.status = "ready";
        await update(project, {
          productionBible: bible,
          productionAssetReadiness: readiness,
          assetPreparation: {
            ...project.assetPreparation,
            status: "completed", stage: "制片资产包已就绪", progress: 100,
            completedAt: new Date().toISOString(), readiness,
          },
        });
        return project;
      } catch (error) {
        await update(project, {
          assetPreparation: {
            ...(project.assetPreparation || {}),
            status: "failed", stage: "制片资产包需要处理",
            error: publicErrorMessage(error),
          },
        });
        throw error;
      } finally {
        scheduled.delete(id);
      }
    },

    async updateEpisodePlan(id, episodeNumber, changes) {
      const project = await api.read(id);
      const number = Number(episodeNumber);
      const episode = project.seriesPlan?.episodes?.find(item => item.number === number);
      if (!episode) throw new Error("分集编号无效");
      if (["queued", "running"].includes(project.status)) throw new Error("项目正在生成，暂时不能修改分集");
      const hasCompletedAsset = (project.assets?.episodes || []).some(item => item.number === number);
      if (hasCompletedAsset && changes?.allowCompleted !== true) {
        throw new Error("本集已有成片，修改剧本前需要明确确认");
      }
      await createVersionSnapshot(project, `修改第 ${number} 集前`);
      if (changes?.title != null) episode.title = safeText(changes.title, 120);
      if (changes?.summary != null) episode.summary = safeText(changes.summary, 1200);
      if (changes?.instruction != null) {
        const instruction = safeText(changes.instruction, 1200);
        episode.summary = safeText(`${episode.summary || ""} 导演修改：${instruction}`, 1200);
        episode.directorInstruction = instruction;
      }
      if (!episode.title || !episode.summary) throw new Error("分集标题和摘要不能为空");
      const state = normalizeEpisodeStates(project).find(item => item.number === number);
      if (hasCompletedAsset) {
        const remaining = project.assets.episodes.filter(item => item.number !== number);
        project.assets = remaining.length
          ? { ...remaining[0], episodes: remaining }
          : { episodes: [] };
        if (state) Object.assign(state, {
          status: "stale", stage: "剧本已修改，等待重新生成", progress: 0,
          assets: null, error: null,
        });
        project.assembly = project.assembly?.video
          ? { status: "stale", error: "分集剧本已修改，需要重新合并全集" }
          : project.assembly;
      } else if (state) {
        state.title = episode.title;
        state.summary = episode.summary;
      }
      project.continuityLedger = buildProjectContinuityLedger(project, project.continuityLedger);
      await update(project, {
        seriesPlan: project.seriesPlan,
        episodeStates: project.episodeStates,
        assets: project.assets,
        assembly: project.assembly,
        continuityLedger: project.continuityLedger,
      });
      return project;
    },

    async updateEpisodeContinuity(id, episodeNumber, changes, options = {}) {
      const project = await api.read(id);
      const number = Number(episodeNumber);
      if (!Number.isInteger(number) || number < 1 || number > (project.seriesPlan?.episodeCount || 0)) {
        throw new Error("分集编号无效");
      }
      if (["queued", "running"].includes(project.status)) throw new Error("项目正在生成，暂时不能修改连续性状态");
      const completed = (project.assets?.episodes || []).some(item => item.number === number);
      if (completed && options.allowCompleted !== true) {
        throw new Error("本集已有成片；请先重新生成本集时再应用新的连续性状态");
      }
      await createVersionSnapshot(project, `修改第 ${number} 集连续性前`);
      const bible = normalizeProductionBible(project.productionBible);
      const characterIds = new Set(bible.characters.map(item => item.id));
      const propIds = new Set(bible.props.map(item => item.id));
      const characters = Array.isArray(changes?.characters) ? changes.characters
        .filter(item => characterIds.has(item.characterId) && safeText(item.wardrobe, 500))
        .map(item => ({
          characterId: item.characterId,
          wardrobe: safeText(item.wardrobe, 500),
          reason: safeText(item.reason, 180),
        })) : [];
      const props = Array.isArray(changes?.props) ? changes.props
        .filter(item => propIds.has(item.propId) &&
          (safeText(item.holder, 80) || safeText(item.condition, 500)))
        .map(item => ({
          propId: item.propId,
          holder: safeText(item.holder, 80),
          condition: safeText(item.condition, 500),
          reason: safeText(item.reason, 180),
        })) : [];
      const continuityLedger = project.continuityLedger || { version: 1, overrides: {}, snapshots: [] };
      continuityLedger.overrides ||= {};
      continuityLedger.overrides[number] = {
        characters, props, note: safeText(changes?.note, 500),
        confirmedAt: new Date().toISOString(),
      };
      project.continuityLedger = buildProjectContinuityLedger(project, continuityLedger);
      if (completed) {
        const remaining = project.assets.episodes.filter(item => item.number !== number);
        project.assets = remaining.length
          ? { ...remaining[0], episodes: remaining }
          : { episodes: [] };
        const state = normalizeEpisodeStates(project).find(item => item.number === number);
        if (state) Object.assign(state, {
          status: "stale", stage: "连续性已修改，等待重新生成", progress: 0,
          assets: null, error: null,
        });
        project.assembly = project.assembly?.video
          ? { status: "stale", error: "分集连续性已修改，需要重新合并全集" }
          : project.assembly;
      }
      await update(project, {
        continuityLedger: project.continuityLedger,
        episodeStates: project.episodeStates,
        assets: project.assets,
        assembly: project.assembly,
      });
      return project;
    },

    async applyFormatRecommendation(id) {
      const project = await api.read(id);
      const recommendation = project.productionBible?.recommendation;
      if (!recommendation || !["anime", "drama", "film", "other"].includes(recommendation.format)) {
        throw new Error("当前没有可采用的 AI 成片类型推荐");
      }
      if (["queued", "running"].includes(project.status)) throw new Error("项目正在生成，暂时不能更改成片类型");
      if ((project.assets?.episodes || []).length) {
        throw new Error("已有分集成片，不能直接更改类型；请新建方案以保护现有资产");
      }
      if (project.specification.format === recommendation.format) return project;
      await createVersionSnapshot(project, "采用 AI 成片类型推荐前");
      const seriesPlan = buildSeriesPlan({
        ...project.input,
        format: recommendation.format,
        episodeDurationSeconds: project.specification.episodeDurationSeconds,
      });
      recommendation.appliedAt = new Date().toISOString();
      recommendation.previousFormat = project.specification.format;
      const specification = {
        ...project.specification,
        format: recommendation.format,
        episodeCount: seriesPlan.episodeCount,
        estimatedTotalSeconds: seriesPlan.estimatedTotalSeconds,
        basis: seriesPlan.basis,
        ratio: ["film", "drama"].includes(recommendation.format) ? "16:9" : project.specification.ratio,
      };
      const episodeStates = seriesPlan.episodes.map(episode => ({
        number: episode.number, title: episode.title, summary: episode.summary,
        status: "not_started", stage: "未生成", progress: 0, error: null,
      }));
      project.specification = specification;
      project.seriesPlan = seriesPlan;
      project.episodeStates = episodeStates;
      project.continuityLedger = buildProjectContinuityLedger(project, project.continuityLedger);
      await update(project, {
        specification, seriesPlan, episodeStates,
        productionBible: project.productionBible,
        continuityLedger: project.continuityLedger,
      });
      return project;
    },

    async listVersions(id) {
      const project = await api.read(id);
      const versionsDir = join(project.dir, "versions");
      let entries;
      try {
        entries = await readdir(versionsDir, { withFileTypes: true });
      } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
      }
      const versions = await Promise.all(entries
        .filter(entry => entry.isFile() && /^[0-9a-f-]{36}\.json$/.test(entry.name))
        .map(async entry => {
          const snapshot = JSON.parse(await readFile(join(versionsDir, entry.name), "utf8"));
          return { id: snapshot.id, reason: snapshot.reason, createdAt: snapshot.createdAt };
        }));
      return versions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async restoreVersion(id, versionId) {
      const project = await api.read(id);
      if (scheduled.has(id) || ["queued", "running"].includes(project.status)) {
        throw new Error("项目正在生产，不能恢复版本");
      }
      if (!/^[0-9a-f-]{36}$/.test(versionId)) throw new Error("版本 ID 无效");
      const snapshot = JSON.parse(await readFile(
        join(project.dir, "versions", `${versionId}.json`), "utf8",
      ));
      if (snapshot.projectId !== id || !snapshot.state) throw new Error("版本快照无效");
      await createVersionSnapshot(project, `恢复到版本 ${versionId} 前`);
      const restored = structuredClone(snapshot.state);
      await update(project, {
        ...restored,
        status: "draft",
        stage: `已恢复版本 · ${snapshot.reason}`,
        progress: 0,
        error: null,
        restoredVersion: {
          id: versionId,
          reason: snapshot.reason,
          restoredAt: new Date().toISOString(),
        },
      });
      return project;
    },

    async createDeliveryPackage(id) {
      const project = await api.read(id);
      if (scheduled.has(id) || ["queued", "running"].includes(project.status)) {
        throw new Error("项目正在生产，暂时不能打包交付");
      }
      const episodes = [...(project.assets?.episodes || [])].sort((a, b) => a.number - b.number);
      if (!episodes.length) throw new Error("尚无可交付分集");
      if (episodes.length !== project.seriesPlan?.episodeCount ||
          project.assembly?.status !== "completed" || !project.assembly?.video) {
        throw new Error("商业交付包要求所有分集完成且全集合成验收通过");
      }
      if (!episodes.every(item => item.qualityReport?.status === "passed")) {
        throw new Error("仍有分集未通过质量门禁，不能生成交付包");
      }
      const entries = await readdir(project.dir, { withFileTypes: true });
      const mediaFiles = entries.filter(entry => entry.isFile() &&
        /^(series-complete\.mp4|episode-\d{2}\.(?:mp4|srt)|voice-[a-z0-9-]+-(?:sample|reference)\.wav)$/.test(entry.name))
        .map(entry => entry.name).sort();
      const manifest = {
        schemaVersion: 1, product: "故事片场", projectId: project.id, title: project.title,
        createdAt: new Date().toISOString(),
        source: {
          type: project.input?.sourceType, url: project.input?.url || null,
          document: project.seriesPlan?.sourceDocument ? {
            sha256: project.seriesPlan.sourceDocument.sha256,
            characters: project.seriesPlan.sourceDocument.characterCount,
            chapters: project.seriesPlan.sourceDocument.chapterCount,
            paragraphs: project.seriesPlan.sourceDocument.paragraphCount,
          } : null,
        },
        specification: project.specification,
        episodeCount: episodes.length,
        files: mediaFiles,
        qualityGate: project.productionRun?.qualityGate || {
          status: "passed", episodeCount: episodes.length, passedEpisodes: episodes.length,
          hasVideo: true, duration: project.assembly.duration,
        },
        cost: project.productionRun?.costEstimate || null,
        actualCostStatus: project.productionRun?.costEstimate?.actualCostStatus ||
          "provider_usage_unavailable",
      };
      const quality = {
        schemaVersion: 1, generatedAt: manifest.createdAt, assembly: project.assembly,
        episodes: episodes.map(item => ({
          number: item.number, duration: item.duration, report: item.qualityReport,
        })),
      };
      const bible = {
        schemaVersion: 1, projectId: project.id,
        productionBible: project.productionBible, continuityLedger: project.continuityLedger,
      };
      const metadataFiles = [
        ["delivery-manifest.json", manifest],
        ["quality-report.json", quality],
        ["production-bible.json", bible],
      ];
      for (const [filename, payload] of metadataFiles) {
        await writeFile(join(project.dir, filename), JSON.stringify(payload, null, 2), "utf8");
      }
      const filename = "commercial-delivery.zip";
      await run("zip", [
        "-j", "-q", "-FS", join(project.dir, filename),
        ...mediaFiles.map(file => join(project.dir, file)),
        ...metadataFiles.map(([file]) => join(project.dir, file)),
      ], project.dir);
      const delivery = {
        status: "completed", filename,
        url: `/api/projects/${project.id}/assets/${filename}`,
        generatedAt: manifest.createdAt, episodeCount: episodes.length,
        files: [...mediaFiles, ...metadataFiles.map(([file]) => file)],
        qualityGate: manifest.qualityGate,
      };
      await update(project, { delivery });
      return project;
    },

    async generateBibleAsset(id, type, assetId) {
      const project = await api.read(id);
      if (scheduled.has(id)) throw new Error("项目已有生成任务在运行");
      const bible = project.productionBible || buildProductionBible(project.input, project.seriesPlan);
      const collection = type === "character" ? bible.characters :
        type === "scene" ? bible.scenes : type === "prop" ? bible.props : null;
      if (!collection) throw new Error("资产类型无效");
      const asset = collection.find(item => item.id === assetId);
      if (!asset) throw new Error("制片资产不存在");
      asset.status = "generating";
      asset.error = null;
      await update(project, { productionBible: bible });
      try {
        const generated = await imageGenerator(env, imagePromptForAsset(project, type, asset));
        const base = `${type}-${asset.id}`;
        const filename = `${base}-sheet.${generated.extension}`;
        const path = join(project.dir, filename);
        await writeFile(path, generated.buffer);
        asset.sheet = `/api/projects/${project.id}/assets/${filename}`;
        asset.image = asset.sheet;
        asset.generation = generated.generation;
        if (type === "character") {
          const views = await characterSheetSplitter(project.dir, path, base, generated.extension);
          asset.views = Object.fromEntries(Object.entries(views).map(([key, file]) =>
            [key, `/api/projects/${project.id}/assets/${file}`]));
        }
        asset.status = "ready";
        asset.generatedAt = new Date().toISOString();
        await update(project, { productionBible: bible });
        return project;
      } catch (error) {
        asset.status = "failed";
        asset.error = publicErrorMessage(error);
        await update(project, { productionBible: bible });
        throw error;
      }
    },

    async revalidateEpisode(id, episodeNumber) {
      const project = await api.read(id);
      const number = Number(episodeNumber);
      if (!Number.isInteger(number) || number < 1) throw new Error("分集编号无效");
      if (scheduled.has(id) || ["queued", "running"].includes(project.status)) {
        throw new Error("项目正在生产，暂时不能重新验收");
      }
      const asset = (project.assets?.episodes || []).find(item => item.number === number);
      if (!asset?.video) throw new Error("本集没有可重新验收的成片");
      if (!semanticQualityOperational()) {
        throw new Error("多模态成片一致性质检未通过运行检查，不能重新验收");
      }
      const videoPath = join(project.dir, `episode-${String(number).padStart(2, "0")}.mp4`);
      const storyPath = join(project.dir, `story-${String(number).padStart(2, "0")}.json`);
      const story = JSON.parse(await readFile(storyPath, "utf8"));
      const media = await mediaProbe(videoPath);
      const advancedQuality = await mediaQualityAnalyzer(videoPath);
      const speechConsistency = asset.audioSource === "native"
        ? await nativeSpeechVerifier(env, videoPath, story)
        : {
            status: "provenance_verified", verified: true, similarity: 1,
            proof: "tts_subtitle_same_source",
            reason: "固定 TTS 与字幕均由本集规范台词生成",
          };
      const visualConsistency = await visualConsistencyAnalyzer(
        env, videoPath, story, project, media.duration,
      );
      const qualityReport = {
        ...episodeQualityReport(media, project, number, advancedQuality, {
          speech: speechConsistency,
          visual: visualConsistency,
        }),
        revalidatedAt: new Date().toISOString(),
        revalidationKind: "existing_media_only",
      };
      asset.duration = media.duration;
      asset.qualityReport = qualityReport;
      asset.speechConsistency = speechConsistency;
      const episodeStates = normalizeEpisodeStates(project);
      const state = episodeStates.find(item => item.number === number);
      if (state) Object.assign(state, {
        status: qualityReport.status === "passed" ? "completed" : "failed",
        stage: qualityReport.status === "passed" ? "重新验收通过" : "质量门禁未通过",
        progress: 100,
        error: qualityReport.status === "passed" ? null : "现有成片未通过质量门禁，请查看报告后单集修复",
        duration: media.duration,
        assets: asset,
      });
      const episodes = project.assets.episodes;
      const allEpisodesReady = episodes.length === project.seriesPlan?.episodeCount &&
        episodes.every(item => item.qualityReport?.status === "passed");
      if (project.productionRun?.qualityGate) {
        project.productionRun.qualityGate = {
          ...project.productionRun.qualityGate,
          status: allEpisodesReady ? "passed" : "failed",
          episodeCount: episodes.length,
          passedEpisodes: episodes.filter(
            item => item.qualityReport?.status === "passed",
          ).length,
          updatedAt: new Date().toISOString(),
        };
      }
      const failed = qualityReport.status !== "passed";
      await update(project, {
        status: failed ? "failed" : project.status,
        stage: failed
          ? `第 ${number} 集重新验收未通过`
          : project.stage,
        error: failed
          ? `第 ${number} 集现有成片未通过质量门禁，请查看报告后单集修复`
          : project.error,
        assets: project.assets,
        episodeStates,
        productionRun: project.productionRun,
        assembly: failed && project.assembly?.video
          ? { status: "stale", error: `第 ${number} 集质量门禁未通过，需要修复后重新合并` }
          : project.assembly,
        delivery: project.delivery?.url
          ? {
              status: "stale",
              error: failed
                ? `第 ${number} 集质量门禁未通过，交付包已失效`
                : "分集重新验收后需要重新生成商业交付包",
            }
          : project.delivery,
      });
      return { project, asset };
    },

    async assembleSeries(id, options = {}) {
      const project = await api.read(id);
      const episodes = [...(project.assets?.episodes || [])].sort((a, b) => a.number - b.number);
      if (episodes.length < 2) throw new Error("至少需要两集已完成视频才能合并全集");
      if (options.requireComplete && episodes.length !== project.seriesPlan?.episodeCount) {
        throw new Error(`全集合成需要 ${project.seriesPlan?.episodeCount || 0} 集，当前仅完成 ${episodes.length} 集`);
      }
      const expected = Array.from({ length: episodes.length }, (_, index) => index + 1);
      if (episodes.some((item, index) => item.number !== expected[index])) {
        throw new Error("只能从第 1 集开始连续合并，请先补齐中间缺失分集");
      }
      const listPath = join(project.dir, "series-concat.txt");
      const lines = episodes.map(item => {
        const filename = new URL(item.video, "http://localhost").pathname.split("/").pop();
        return `file '${filename.replace(/'/g, "'\\''")}'`;
      });
      await writeFile(listPath, `${lines.join("\n")}\n`, "utf8");
      const outputPath = join(project.dir, "series-complete.mp4");
      await update(project, { assembly: { status: "running", episodeCount: episodes.length, error: null } });
      try {
        const duration = await seriesAssembler(project.dir, listPath, outputPath, episodes);
        const assembly = {
          status: "completed",
          episodeCount: episodes.length,
          duration: Number(duration.toFixed(2)),
          video: `/api/projects/${project.id}/assets/series-complete.mp4`,
          completedAt: new Date().toISOString(),
        };
        await update(project, { assembly });
        return project;
      } catch (error) {
        await update(project, { assembly: {
          status: "failed", episodeCount: episodes.length, error: publicErrorMessage(error),
        } });
        throw error;
      }
    },

    enqueue(project) {
      if (scheduled.has(project.id)) return;
      scheduled.add(project.id);
      pending.push(project);
      void drain();
    },

    async retry(id) {
      if (scheduled.has(id)) throw new Error("项目已经在队列中");
      scheduled.add(id);
      try {
        const project = await api.read(id);
        if (project.status !== "failed") throw new Error("只有失败或中断的任务可以重试");
        if (project.productionRun?.mode === "full_series") {
          throw new Error("全集生产请在生产总控中确认继续；系统会跳过已完成分集");
        }
        await update(project, { status: "queued", stage: "等待重试", progress: 0, error: null });
        pending.push(project);
        void drain();
        return project;
      } catch (error) {
        scheduled.delete(id);
        throw error;
      }
    },

    async create(input) {
      validateInput(input);
      const id = randomUUID();
      const projectDir = join(projectsDir, id);
      await mkdir(projectDir, { recursive: true });
      const project = {
        id,
        dir: projectDir,
        title: safeText(input.title, 80) || "未命名故事",
        status: "queued",
        stage: "等待处理",
        progress: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        input: {
          sourceType: input.sourceType || "manual",
          title: safeText(input.title, 80),
          content: safeText(input.content, 12000),
          premise: safeText(input.premise, 12000),
          genre: safeText(input.genre, 40),
          rightsConfirmed: input.rightsConfirmed === true,
        },
      };
      await update(project, {});
      return project;
    },

    async run(project) {
      let step = "story";
      const steps = project.steps || {};
      const mark = async (name, status) => {
        steps[name] = { status, updatedAt: new Date().toISOString() };
        await update(project, { steps });
      };
      try {
        await mark(step, "running");
        const isRealVideo = project.generationMode === "real_video";
        const episodeStates = normalizeEpisodeStates(project);
        const updateEpisodeState = async (number, patch) => {
          const episodeState = episodeStates.find(item => item.number === number);
          if (!episodeState) return;
          Object.assign(episodeState, patch, { updatedAt: new Date().toISOString() });
          await update(project, { episodeStates });
        };
        await update(project, {
          status: "running",
          stage: isRealVideo ? "整理首集剧情：准备真实视频生成" : "规则抽句：构建流程自检片",
          progress: 12,
          error: null,
        });
        const episodeNumbers = isRealVideo
          ? (project.productionEpisodeNumbers || Array.from(
            { length: project.productionEpisodeLimit || 1 }, (_, index) => index + 1,
          ))
          : [1];
        const episodePlans = episodeNumbers
          .map(number => project.seriesPlan?.episodes?.[number - 1])
          .filter(Boolean);
        if (!episodePlans.length) episodePlans.push(null);
        const stories = episodePlans.map(episodePlan => buildStory(project.input, episodePlan));
        project.continuityLedger = buildProjectContinuityLedger(project, project.continuityLedger);
        const snapshots = new Map(project.continuityLedger.snapshots
          .map(snapshot => [snapshot.episodeNumber, snapshot]));
        for (const item of stories) item.continuitySnapshot = snapshots.get(item.episode.number);
        const story = stories[0];
        project.title = story.title;
        project.story = story;
        await writeFile(join(project.dir, "story.json"), JSON.stringify(story, null, 2), "utf8");
        for (let index = 0; index < stories.length; index++) {
          const episodeNumber = episodeNumbers[index] || index + 1;
          const number = String(episodeNumber).padStart(2, "0");
          await updateEpisodeState(episodeNumber, {
            status: "running", stage: "整理剧情", progress: 10, error: null,
          });
          await writeFile(join(project.dir, `story-${number}.json`), JSON.stringify(stories[index], null, 2), "utf8");
        }
        await mark(step, "completed");
        step = "speech";
        await mark(step, "running");

        const audioStrategy = project.specification?.audioStrategy || "auto";
        const audioItems = Array(stories.length).fill(null);
        const ensureTtsAudio = async (index) => {
          const episodeNumber = episodeNumbers[index] || index + 1;
          const number = String(episodeNumber).padStart(2, "0");
          await updateEpisodeState(episodeNumber, {
            status: "running", stage: "生成独立配音", progress: 40,
          });
          await update(project, {
            stage: `生成第 ${episodeNumber} 集独立配音`,
            progress: 20 + Math.round((index / stories.length) * 25),
          });
          const audioPath = join(project.dir, `narration-${number}.wav`);
          const cachePath = join(project.dir, `narration-${number}.meta.json`);
          const identity = narrationCacheIdentity(stories[index]);
          let duration;
          try {
            const cached = JSON.parse(await readFile(cachePath, "utf8"));
            if (cached.hash === identity.hash) duration = await probe(audioPath);
          } catch { /* Missing, stale or invalid cache is regenerated. */ }
          let ttsSeconds;
          if (!(duration > 0 && Number.isFinite(duration))) {
            ttsSeconds = await speech(env.TTS_API_URL, stories[index], audioPath);
            duration = await probe(audioPath);
            await writeFile(cachePath, JSON.stringify({
              ...identity,
              generatedAt: new Date().toISOString(),
              duration,
            }, null, 2), "utf8");
          }
          if (!(duration > 0 && Number.isFinite(duration))) throw new Error(`第 ${episodeNumber} 集音频时长无效`);
          audioItems[index] = { path: audioPath, duration, ttsSeconds };
          if (episodeNumber === 1) await writeFile(join(project.dir, "narration.wav"), await readFile(audioPath));
          return audioItems[index];
        };
        const seedanceReferenceAudio = isRealVideo && seedanceMultimodalEnabled(env);
        if (!isRealVideo || audioStrategy === "tts" || seedanceReferenceAudio) {
          for (let index = 0; index < stories.length; index++) await ensureTtsAudio(index);
        } else {
          await update(project, { stage: "视频模型将先生成画面，完成后自动检查原声音轨", progress: 28 });
        }
        await mark(step, "completed");
        step = "render";
        await mark(step, "running");

        const episodeAssetMap = new Map((project.assets?.episodes || []).map(item => [item.number, item]));
        for (let index = 0; index < stories.length; index++) {
          const episodeNumber = episodeNumbers[index] || index + 1;
          const number = String(episodeNumber).padStart(2, "0");
          const videoPath = join(project.dir, `episode-${number}.mp4`);
          const subtitlePath = join(project.dir, `episode-${number}.srt`);
          let finalDuration = audioItems[index]?.duration || 0;
          let videoGeneration = null;
          let audioSource = "tts";
          let nativeAudioDetected = false;
          let nativeAudioFallback = false;
          let nativeVoiceVerification = null;
          let nativeSpeechVerification = null;
          let qualityReport = null;
          if (isRealVideo) {
            await updateEpisodeState(episodeNumber, {
              status: "running", stage: "生成画面", progress: 60,
            });
            await update(project, {
              stage: `调用视频模型生成第 ${episodeNumber} 集真实画面`,
              progress: 50 + Math.round((index / stories.length) * 35),
            });
            const rawVideoPath = join(project.dir, `model-video-${number}.mp4`);
            videoGeneration = await realVideo(env, stories[index], project, rawVideoPath) || null;
            const media = await mediaProbe(rawVideoPath);
            if (!media.hasVideo) throw new Error(`第 ${episodeNumber} 集视频模型结果缺少视频流`);
            nativeAudioDetected = media.hasAudio;
            if (nativeAudioDetected && audioStrategy !== "tts") {
              nativeVoiceVerification = await nativeVoiceVerifier(
                rawVideoPath, stories[index].continuitySnapshot, videoGeneration,
              );
              if (nativeVoiceVerification?.verified === true) {
                nativeSpeechVerification = await nativeSpeechVerifier(
                  env, rawVideoPath, stories[index],
                );
              }
            }
            const nativeAudioUsable = nativeAudioDetected &&
              nativeVoiceVerification?.verified === true &&
              nativeSpeechVerification?.verified === true;
            await updateEpisodeState(episodeNumber, {
              status: "running",
              stage: audioStrategy !== "tts" && nativeAudioUsable ? "保留已验证模型原声" : "合成固定角色配音",
              progress: 85,
              remoteTaskId: videoGeneration?.remoteTaskId || null,
            });
            if (audioStrategy !== "tts" && nativeAudioUsable) {
              await update(project, {
                stage: `第 ${episodeNumber} 集检测到模型原声，保留原声音轨`,
                progress: 65 + Math.round((index / stories.length) * 30),
              });
              await preserveNative(project.dir, rawVideoPath, videoPath);
              audioSource = "native";
            } else {
              nativeAudioFallback = audioStrategy === "native" && !nativeAudioUsable;
              await update(project, {
                stage: nativeAudioFallback
                  ? `第 ${episodeNumber} 集原声音色未通过一致性验证，自动回退固定角色配音`
                  : `合成第 ${episodeNumber} 集固定角色配音、字幕和画面`,
                progress: 65 + Math.round((index / stories.length) * 30),
              });
              const ttsAudio = audioItems[index] || await ensureTtsAudio(index);
              await mux(project.dir, rawVideoPath, ttsAudio.path, videoPath);
              audioSource = "tts";
            }
            const finalMedia = await mediaProbe(videoPath);
            if (!finalMedia.hasVideo || !finalMedia.hasAudio || !(finalMedia.duration > 0)) {
              throw new Error(`第 ${episodeNumber} 集最终成片音视频流校验失败`);
            }
            const advancedQuality = await mediaQualityAnalyzer(videoPath);
            const speechConsistency = audioSource === "tts"
              ? {
                status: "provenance_verified", verified: true, similarity: 1,
                proof: "tts_subtitle_same_source",
                reason: "固定 TTS 与字幕均由本集规范台词生成",
              }
              : nativeSpeechVerification;
            const visualConsistency = await visualConsistencyAnalyzer(
              env, videoPath, stories[index], project, finalMedia.duration,
            );
            qualityReport = episodeQualityReport(
              finalMedia, project, episodeNumber, advancedQuality, {
                speech: speechConsistency,
                visual: visualConsistency,
              },
            );
            if (qualityReport.status !== "passed") {
              const failed = qualityReport.checks.filter(check => check.required && !check.passed)
                .map(check => check.id).join("、");
              throw new Error(`第 ${episodeNumber} 集质量门禁未通过：${failed}`);
            }
            finalDuration = finalMedia.duration;
            await writeEstimatedSubtitles(stories[index], finalDuration, subtitlePath);
          } else {
            await update(project, { stage: "生成字幕和竖屏流程自检片", progress: 70 });
            await render(project.dir, stories[index], audioItems[index].duration, audioItems[index].path, videoPath, subtitlePath);
            finalDuration = await probe(videoPath);
          }
          const asset = {
            number: episodeNumber,
            duration: Number(finalDuration.toFixed(2)),
            videoGeneration,
            video: `/api/projects/${project.id}/assets/episode-${number}.mp4`,
            audio: audioItems[index] ? `/api/projects/${project.id}/assets/narration-${number}.wav` : null,
            audioSource,
            audioStrategy,
            nativeAudioDetected,
            nativeAudioFallback,
            nativeVoiceVerification,
            nativeSpeechVerification,
            qualityReport,
            continuitySnapshot: stories[index].continuitySnapshot,
            subtitles: `/api/projects/${project.id}/assets/episode-${number}.srt`,
            story: `/api/projects/${project.id}/assets/story-${number}.json`,
          };
          episodeAssetMap.set(episodeNumber, asset);
          project.assets = {
            ...(project.assets || {}),
            episodes: [...episodeAssetMap.values()].sort((a, b) => a.number - b.number),
          };
          await updateEpisodeState(episodeNumber, {
            status: "completed", stage: "已完成", progress: 100, error: null,
            duration: asset.duration, assets: asset,
          });
          if (project.productionRun?.mode === "full_series") {
            project.productionRun.status = "running";
            project.productionRun.completedEpisodes = episodeAssetMap.size;
            project.productionRun.currentEpisode = episodeNumber;
            project.productionRun.updatedAt = new Date().toISOString();
          }
          await update(project, { assets: project.assets });
          if (project.productionRun?.mode === "full_series") {
            const latest = await api.read(project.id);
            const control = productionControls.get(project.id) ||
              latest.productionRun?.control;
            const requested = control?.requested;
            if (requested === "pause" || requested === "stop") {
              const remainingNumbers = episodeNumbers.slice(index + 1);
              const pausedStates = normalizeEpisodeStates(latest);
              for (const remainingNumber of remainingNumbers) {
                Object.assign(pausedStates[remainingNumber - 1], {
                  status: "not_started",
                  stage: requested === "pause" ? "已暂停" : "本轮已停止",
                  progress: 0,
                  error: null,
                });
              }
              latest.productionRun = {
                ...latest.productionRun,
                control,
                status: requested === "pause" ? "paused" : "stopped",
                currentEpisode: null,
                completedEpisodes: episodeAssetMap.size,
                pausedAt: requested === "pause" ? new Date().toISOString() : null,
                stoppedAt: requested === "stop" ? new Date().toISOString() : null,
                updatedAt: new Date().toISOString(),
              };
              await update(latest, {
                status: requested === "pause" ? "paused" : "stopped",
                stage: requested === "pause"
                  ? `全集生产已暂停 · 已完成 ${episodeAssetMap.size} 集`
                  : `本轮生产已停止 · 已完成 ${episodeAssetMap.size} 集`,
                progress: Math.round(episodeAssetMap.size / latest.seriesPlan.episodeCount * 100),
                episodeStates: pausedStates,
                productionRun: latest.productionRun,
              });
              productionControls.delete(project.id);
              return;
            }
          }
        }
        const episodeAssets = [...episodeAssetMap.values()].sort((a, b) => a.number - b.number);
        await mark(step, "completed");

        const firstAsset = episodeAssets[0];
        if (project.productionRun?.mode === "full_series") {
          project.productionRun.status = "media_completed";
          project.productionRun.completedEpisodes = episodeAssets.length;
          project.productionRun.currentEpisode = null;
          project.productionRun.updatedAt = new Date().toISOString();
        }
        const fullSeriesReadyForAssembly = project.productionRun?.mode === "full_series" &&
          episodeAssets.length === project.seriesPlan.episodeCount;
        await update(project, {
          status: fullSeriesReadyForAssembly ? "running" : "completed",
          stage: fullSeriesReadyForAssembly
            ? "全部分集已完成，正在合成并验收全集"
            : isRealVideo
              ? `本次 ${stories.length} 集制作完成；累计完成 ${episodeAssets.length} 集`
              : "流程自检片完成（抽句 / 占位画面 / 估算字幕）",
          progress: fullSeriesReadyForAssembly ? 98 : 100,
          duration: firstAsset.duration,
          videoGeneration: firstAsset.videoGeneration,
          generatedEpisodeCount: episodeAssets.length,
          outputKind: isRealVideo ? "real_video_sample" : "pipeline_self_check",
          assets: {
            ...firstAsset,
            episodes: episodeAssets,
          },
          continuityLedger: project.continuityLedger,
          productionRun: project.productionRun,
        });
        if (fullSeriesReadyForAssembly) {
          try {
            await api.assembleSeries(project.id, { requireComplete: true });
            const refreshed = await api.read(project.id);
            refreshed.productionRun = {
              ...refreshed.productionRun,
              status: "completed",
              completedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              qualityGate: {
                status: refreshed.assembly?.status === "completed" &&
                  episodeAssets.every(asset => asset.qualityReport?.status === "passed")
                  ? "passed" : "failed",
                episodeCount: episodeAssets.length,
                passedEpisodes: episodeAssets.filter(asset =>
                  asset.qualityReport?.status === "passed").length,
                hasVideo: Boolean(refreshed.assembly?.video),
                duration: refreshed.assembly?.duration || 0,
              },
            };
            await update(refreshed, {
              productionRun: refreshed.productionRun,
              status: "completed",
              stage: "全集生产、合成与媒体验收完成",
              progress: 100,
              outputKind: "complete_series",
            });
            productionControls.delete(project.id);
          } catch (error) {
            project.productionRun.status = "failed";
            project.productionRun.failedStage = "assembly";
            project.productionRun.error = publicErrorMessage(error);
            project.productionRun.updatedAt = new Date().toISOString();
            await update(project, {
              productionRun: project.productionRun,
              status: "failed",
              stage: "分集已完成，全集合成失败",
              error: project.productionRun.error,
            });
            productionControls.delete(project.id);
          }
        }
      } catch (error) {
        const runningEpisode = project.episodeStates?.find(item =>
          ["queued", "running"].includes(item.status));
        if (runningEpisode) {
          Object.assign(runningEpisode, {
            status: "failed", stage: "生成失败", error: publicErrorMessage(error),
            updatedAt: new Date().toISOString(),
          });
        }
        if (project.productionRun?.mode === "full_series") {
          project.productionRun.status = "failed";
          project.productionRun.failedEpisode = runningEpisode?.number || null;
          project.productionRun.error = publicErrorMessage(error);
          project.productionRun.updatedAt = new Date().toISOString();
        }
        steps[step] = { status: "failed", updatedAt: new Date().toISOString() };
        await update(project, {
          steps,
          episodeStates: project.episodeStates,
          failedStep: step,
          status: "failed",
          stage: "生成失败",
          error: publicErrorMessage(error),
          technicalError: String(error.message || error),
          productionRun: project.productionRun,
        });
        productionControls.delete(project.id);
      }
    },

    async read(id) {
      if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("无效项目 ID");
      const file = join(projectsDir, id, "project.json");
      const project = JSON.parse(await readFile(file, "utf8"));
      project.dir = join(projectsDir, id);
      if (project.seriesPlan && !project.productionBible) {
        project.productionBible = buildProductionBible(project.input || {}, project.seriesPlan);
      }
      normalizeProductionBible(project.productionBible);
      project.productionAssetReadiness = productionAssetReadiness(project);
      if (project.seriesPlan && project.productionBible &&
          !project.continuityLedger?.snapshots?.length) {
        project.continuityLedger = buildProjectContinuityLedger(project, project.continuityLedger);
      }
      return project;
    },

    assetPath(id, filename) {
      if (!/^[0-9a-f-]{36}$/.test(id) ||
          !/^(episode-\d{2}\.(mp4|srt)|narration-\d{2}\.wav|voice-[a-z0-9-]+-(sample|reference)\.wav|story-\d{2}\.json|narration\.wav|story\.json|series-complete\.mp4|commercial-delivery\.zip|(character|scene|prop)-[a-z0-9-]+-(sheet|front|threeQuarter|side|back)\.(jpg|png))$/.test(filename)) return null;
      return join(projectsDir, id, filename);
    },
  };
  return api;
}
