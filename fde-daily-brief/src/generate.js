// 每日文章生成：采集 -> 组装素材 -> 调方舟 -> 结构化校验 -> 返回 article 对象。
import { chat, extractJSON } from "./llm.js";
import { collectAll } from "./sources.js";
import { config } from "./config.js";

const MAX_SIGNALS = 4;
const MAX_REFS = 8;

function buildDigest(items) {
  return items
    .slice(0, 30)
    .map((it, i) => {
      const parts = [
        `[${i + 1}] (${it.source}) ${it.title}`,
        it.summary ? `摘要: ${it.summary.slice(0, 160)}` : "",
        `链接: ${it.url}`,
      ];
      return parts.filter(Boolean).join("\n");
    })
    .join("\n\n");
}

function buildPrompt(items) {
  const system =
    "你是一名面向企业一线 AI 交付工程师（FDE）的资深编辑，擅长把当天全球技术热点翻译成" +
    "‘对现场交付到底有什么用’。只输出 JSON，不要输出任何解释或 markdown 代码块。";

  const schema = {
    title: "string，中文主标题，具体有信息量、不做标题党，18 字以内",
    subtitle: "string，一句话副标题/导语，30 字以内",
    takeaway: "string，今天最该记住的一句话结论，40 字以内",
    signals: [
      {
        title: "string，信号标题",
        point: "string，发生了什么（1-2 句，含具体事实/数字）",
        fde: "string，对 FDE 现场交付意味着什么、能怎么用（1-2 句，必须具体可落地）",
        url: "string，原始链接（必须直接使用下面素材里给出的链接）",
        source: "string，来源名",
      },
    ],
    practical:
      "string，‘今天可以在项目里做的一个动作’，写成可直接照做的步骤，60-100 字",
  };

  const user =
    `主题方向：${config.topic}\n\n` +
    `下面是今天采集到的候选素材（已按相关性排序）：\n\n${buildDigest(items)}\n\n` +
    `请从中挑选 ${MAX_SIGNALS} 条最值得一线 FDE 关注的真实信号，按以下 JSON 结构输出。\n` +
    `要求：\n` +
    `1. 只使用素材中真实存在的内容和链接，禁止编造；\n` +
    `2. signals 中每条的 url/source 必须来自素材；\n` +
    `3. fde 字段必须给出可落地的交付视角，不要空话；\n` +
    `4. practical 要让工程师今天就能在项目里用；\n` +
    `5. 严格输出该 JSON（signals 为数组，长度 ${MAX_SIGNALS}）：\n` +
    JSON.stringify(schema, null, 2);

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function asString(v, fallback = "") {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function normalize(raw, items) {
  const byUrl = new Map(items.map((it) => [it.url, it]));
  const rawSignals = Array.isArray(raw.signals) ? raw.signals : [];

  const signals = rawSignals
    .map((s) => {
      const url = asString(s?.url);
      const matched = byUrl.get(url);
      return {
        title: asString(s?.title, matched?.title || "信号"),
        point: asString(s?.point),
        fde: asString(s?.fde),
        url: url || matched?.url || "#",
        source: asString(s?.source, matched?.source || ""),
      };
    })
    .filter((s) => s.point || s.fde)
    .slice(0, MAX_SIGNALS);

  return {
    title: asString(raw.title, "FDE 每日速递"),
    subtitle: asString(raw.subtitle),
    takeaway: asString(raw.takeaway),
    signals,
    practical: asString(raw.practical),
  };
}

/**
 * 生成今日文章。
 * @param {{date?: Date}} [opts]
 */
export async function generateArticle(opts = {}) {
  const date = opts.date || new Date();
  const { items, status } = await collectAll();
  if (items.length === 0) {
    throw new Error("所有来源均采集失败，无法生成文章");
  }

  const content = await chat(buildPrompt(items), { temperature: 0.5 });
  const raw = extractJSON(content);
  const article = normalize(raw, items);

  return {
    id: date.toISOString().slice(0, 10),
    generatedAt: date.toISOString(),
    model: config.ark.model,
    sourceStatus: status,
    candidateCount: items.length,
    refs: items.slice(0, MAX_REFS).map((it) => ({
      source: it.source,
      title: it.title,
      url: it.url,
    })),
    article,
  };
}
