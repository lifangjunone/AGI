const { readFile } = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_MODEL = "doubao-seed-2-0-lite-260428";
const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

function parseEnv(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
        return [line.slice(0, separator).trim(), value];
      })
  );
}

async function loadLocalEnv(app) {
  const candidates = [
    process.env.EIS_ENV_FILE,
    path.join(process.cwd(), ".env.local"),
    path.join(app.getPath("userData"), ".env.local"),
    path.resolve(path.dirname(process.execPath), "../../../../../.env.local")
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return parseEnv(await readFile(candidate, "utf8"));
    } catch {
      // Try the next local-only configuration path.
    }
  }
  return {};
}

function localGrammarAnswer({ sentence, question }) {
  const asksAboutBy = /\bby\b/i.test(question) && /\bby\s+\w+ing\b/i.test(sentence);
  if (asksAboutBy) {
    return {
      source: "local",
      model: "",
      summary: "这里的 by 表示“通过某种方式”，by 后面的动词要使用 -ing 形式。",
      grammarRole: "by + V-ing：方式介词短语",
      explanation:
        "begin by telling me... 的意思是“先从告诉我……开始”。by telling 描述开始这段回答所采用的第一步或方式，不表示地点，也不是被动语态。",
      contrast:
        "去掉 by 后变成 begin telling me...，语法仍可能成立，但更强调“开始讲述”这个动作；begin by telling... 更清楚地强调“第一步先做什么”。不能换成 with telling；若使用 with，通常要接名词，如 begin with a brief introduction。",
      examples: [
        {
          english: "Let us begin by reviewing the main points.",
          chinese: "让我们先从回顾要点开始。"
        },
        {
          english: "She started by introducing herself.",
          chinese: "她先从自我介绍开始。"
        }
      ],
      tip: "记忆模板：begin/start by + V-ing = 先从做某事开始。"
    };
  }

  return {
    source: "local",
    model: "",
    summary: "当前未连接文本模型，已提供基于句子结构的本地解析。",
    grammarRole: "结合当前句子的词性与结构判断",
    explanation: `问题聚焦于“${question}”。当前句为“${sentence}”。可先定位核心谓语，再判断目标词是在连接动作、补充方式，还是引出对象。`,
    contrast: "配置文本模型后可获得针对替换、语气和使用场景的进一步对比。",
    examples: [],
    tip: "在 .env.local 中配置 ARK_TEXT_MODEL 后，将自动启用模型分析。"
  };
}

function normalizeAnswer(value, model) {
  const examples = Array.isArray(value?.examples)
    ? value.examples
        .filter((item) => item?.english && item?.chinese)
        .slice(0, 3)
        .map((item) => ({
          english: String(item.english),
          chinese: String(item.chinese)
        }))
    : [];
  return {
    source: "ai",
    model,
    summary: String(value?.summary || "模型已完成语法分析。"),
    grammarRole: String(value?.grammarRole || "语法作用"),
    explanation: String(value?.explanation || ""),
    contrast: String(value?.contrast || ""),
    examples,
    tip: String(value?.tip || "")
  };
}

function parseModelContent(content, model) {
  const cleaned = String(content)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return normalizeAnswer(JSON.parse(cleaned), model);
}

async function askGrammarModel(app, payload, fetchImpl = fetch) {
  const sentence = String(payload?.sentence || "").trim().slice(0, 800);
  const translation = String(payload?.translation || "").trim().slice(0, 800);
  const question = String(payload?.question || "").trim().slice(0, 500);
  const level = String(payload?.level || "B2").slice(0, 8);
  if (!sentence || !question) {
    throw new Error("Sentence and question are required.");
  }

  const localAnswer = localGrammarAnswer({ sentence, question });
  const env = { ...process.env, ...(await loadLocalEnv(app)) };
  const apiKey = env.ARK_API_KEY;
  const model = env.ARK_TEXT_MODEL || DEFAULT_MODEL;
  if (!apiKey) return localAnswer;

  try {
    const response = await fetchImpl(
      `${env.ARK_TEXT_BASE_URL || DEFAULT_BASE_URL}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 900,
          thinking: { type: "disabled" },
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "你是严谨的英语教师。根据当前英文句子回答中国学习者的语法追问。必须解释该词或结构在本句中的作用、为什么这样用、删除或替换后的区别，并给出短例句。不要编造词源。只输出 JSON，字段为 summary, grammarRole, explanation, contrast, examples[{english,chinese}], tip。"
            },
            {
              role: "user",
              content: `学习者等级：${level}\n英文句子：${sentence}\n中文参考：${translation}\n问题：${question}`
            }
          ]
        }),
        signal: AbortSignal.timeout(25000)
      }
    );
    if (!response.ok) throw new Error(`Model request failed: ${response.status}`);
    const data = await response.json();
    return parseModelContent(data?.choices?.[0]?.message?.content, model);
  } catch {
    return localAnswer;
  }
}

function registerGrammarAiHandlers(ipcMain, app) {
  ipcMain.handle("grammar:ask", (_event, payload) =>
    askGrammarModel(app, payload ?? {})
  );
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  askGrammarModel,
  loadLocalEnv,
  localGrammarAnswer,
  parseEnv,
  parseModelContent,
  registerGrammarAiHandlers
};
