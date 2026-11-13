import { diagnose, redactSensitiveText } from "./diagnosis.mjs";
import { completeWithMaas, maasConfiguration } from "./maas-client.mjs";

const ALLOWED_TYPES = [
  "临下班投喂型",
  "需求漂移型",
  "会议吞噬型",
  "周报折磨型",
  "甲方玄学型",
  "同事甩锅型",
  "老板画饼型",
  "已读不回型",
  "加班合理化型",
  "流程地狱型",
  "背锅复盘型",
  "精神稳定伪装型"
];

const SYSTEM_PROMPT = [
  "你是「牛马嘴替」的中文互联网职场黑色幽默文案引擎。",
  "任务：根据用户的一句职场吐槽，生成有传播感、好笑、短促、能截图分享的解压报告。",
  "气质：先站用户这边；不爹味、不鸡汤、不劝大度；可以荒诞、阴阳怪气、赛博工位、打工人梗。",
  "安全边界：不要鼓励真实攻击、骚扰、违法、泄密或自伤；不要输出真实人名/公司名；不要让用户去报复。",
  "输出必须是严格 JSON 对象，不要 Markdown，不要代码块，不要额外解释。",
  "字段：angerType, angerScore, title, monster, comfort, roast, civilized, shareText, survival。",
  `angerType 只能从这些值里选：${ALLOWED_TYPES.join("、")}。`,
  "angerScore 是 30-99 的整数；survival 是 3-96 的整数。",
  "title 8-14 个中文，像荒诞职场身份；monster 4-10 个中文，像可点击打爆的怨气怪物。",
  "comfort 18-32 个中文，先共情再轻微幽默。",
  "roast 20-42 个中文，阴阳怪气但不辱骂具体个人，不含威胁。",
  "civilized 28-58 个中文，适合真的发给同事/老板的理性表达。",
  "shareText 18-38 个中文，适合海报医嘱，必须好笑。"
].join("\n");

function parseJsonObject(text) {
  const trimmed = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("model_json_parse_failed");
  }
}

function stringField(value, fallback, maxLength) {
  const text = String(value || fallback || "")
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return [...text].slice(0, maxLength).join("") || fallback;
}

function intField(value, fallback, min, max) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

export function normalizeModelDiagnosis(payload, fallback) {
  const angerType = ALLOWED_TYPES.includes(payload?.angerType) ? payload.angerType : fallback.angerType;
  return {
    ...fallback,
    angerType,
    angerScore: intField(payload?.angerScore, fallback.angerScore, 30, 99),
    title: stringField(payload?.title, fallback.title, 18),
    monster: stringField(payload?.monster, fallback.monster, 14),
    comfort: stringField(payload?.comfort, fallback.comfort, 46),
    roast: stringField(payload?.roast, fallback.roast, 62),
    civilized: stringField(payload?.civilized, fallback.civilized, 86),
    shareText: stringField(payload?.shareText, fallback.shareText, 54),
    survival: intField(payload?.survival, fallback.survival, 3, 96),
    source: "maas",
    model: { used: true }
  };
}

export async function diagnoseWithModel(rawInput, env = process.env) {
  const input = redactSensitiveText(rawInput);
  const fallback = { ...diagnose(input), source: "local-rules", model: { used: false, error: null } };
  const config = maasConfiguration(env);
  if (!config) return { ...fallback, model: { used: false, error: "maas_not_configured" } };

  try {
    const content = await completeWithMaas(config, [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          userComplaint: input,
          fallbackHint: {
            angerType: fallback.angerType,
            angerScore: fallback.angerScore,
            title: fallback.title,
            monster: fallback.monster
          }
        })
      }
    ]);
    const parsed = parseJsonObject(content);
    const normalized = normalizeModelDiagnosis(parsed, fallback);
    normalized.model = { used: true, modelId: config.modelId, error: null };
    return normalized;
  } catch (error) {
    return {
      ...fallback,
      source: "local-rules",
      model: { used: false, modelId: config.modelId, error: error.message || "maas_error" }
    };
  }
}
