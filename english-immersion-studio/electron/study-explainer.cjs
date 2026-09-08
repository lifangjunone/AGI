const {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  loadLocalEnv
} = require("./grammar-ai.cjs");

const levelGuidance = {
  A1: "Use common A1 words. Each step must contain at most 8 words.",
  A2: "Use common daily English. Each step must contain at most 10 words.",
  B1: "Use clear intermediate English. Each step must contain at most 12 words.",
  B2: "Use natural upper-intermediate English. Each step must contain at most 14 words.",
  C1: "Use precise advanced English. Each step must contain at most 16 words.",
  C2: "Use precise idiomatic English. Each step must contain at most 18 words."
};

const maxWordsByLevel = {
  A1: 8,
  A2: 10,
  B1: 12,
  B2: 14,
  C1: 16,
  C2: 18
};

function normalizeLevel(value) {
  const level = String(value || "A2").toUpperCase();
  return Object.hasOwn(levelGuidance, level) ? level : "A2";
}

function limitSpokenWords(value, limit) {
  const words = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= limit) return words.join(" ");
  return `${words.slice(0, limit).join(" ").replace(/[,:;.!?]+$/, "")}.`;
}

function stripTeachingPrefix(value) {
  return String(value || "")
    .replace(/^\s*\d+[.)]\s*/, "")
    .replace(
      /^(?:meaning|usage|use|authentic example|example|repeat(?: after me)?)\s*:\s*/i,
      ""
    )
    .trim();
}

function localStudyExplanation(payload) {
  const level = normalizeLevel(payload?.level);
  const title = String(payload?.title || "this item").slice(0, 160);
  const meaning = String(payload?.meaning || "").slice(0, 240);
  const context = String(payload?.context || "").slice(0, 400);
  const focus = String(payload?.focus || "").slice(0, 240);
  const spokenMeaning = /[\u3400-\u9fff]/.test(meaning) ? "" : meaning;
  const spokenFocus = /[\u3400-\u9fff]/.test(focus) ? "" : focus;
  const wordLimit = maxWordsByLevel[level];
  const sentences = [
    spokenMeaning
      ? `${title} means ${spokenMeaning}.`
      : `${title} carries the key meaning here.`,
    spokenFocus
      ? `Use this pattern: ${spokenFocus}.`
      : "Use it naturally in this situation.",
    context ? `For example: ${context}` : `For example, use ${title} in context.`,
    context || title
  ].map((sentence) => limitSpokenWords(sentence, wordLimit));
  return {
    source: "local",
    model: "",
    level,
    title: `${level} 分级讲解`,
    scriptSentences: sentences,
    chineseSummary: `${title}：${meaning || focus || "结合当前场景理解并模仿。"}`,
    keyPoints: [
      {
        english: focus || title,
        chinese: meaning || "当前项目的核心表达"
      }
    ],
    checkQuestion: `What is the main idea of ${title}?`,
    checkAnswer: meaning || focus || title
  };
}

function normalizeExplanation(value, model, level, teachingItem = {}) {
  const normalizedLevel = normalizeLevel(level);
  const scriptSentences = Array.isArray(value?.scriptSentences)
    ? value.scriptSentences
        .map(stripTeachingPrefix)
        .filter(Boolean)
        .slice(0, 4)
        .map((sentence) =>
          limitSpokenWords(sentence, maxWordsByLevel[normalizedLevel])
        )
    : [];
  const keyPoints = Array.isArray(value?.keyPoints)
    ? value.keyPoints
        .filter((point) => point?.english && point?.chinese)
        .slice(0, 5)
        .map((point) => ({
          english: String(point.english),
          chinese: String(point.chinese)
        }))
    : [];
  if (
    scriptSentences.length !== 4 ||
    scriptSentences.some((sentence) => /[\u3400-\u9fff]/.test(sentence))
  ) {
    throw new Error("Model must return exactly four English-only teaching steps.");
  }
  const repeatText = String(
    teachingItem.context || teachingItem.title || ""
  ).trim();
  if (repeatText && !/[\u3400-\u9fff]/.test(repeatText)) {
    scriptSentences[3] = limitSpokenWords(
      repeatText,
      maxWordsByLevel[normalizedLevel]
    );
  }
  return {
    source: "ai",
    model,
    level: normalizedLevel,
    title: String(value?.title || `${normalizedLevel} 分级讲解`),
    scriptSentences,
    chineseSummary: String(value?.chineseSummary || ""),
    keyPoints,
    checkQuestion: String(value?.checkQuestion || ""),
    checkAnswer: String(value?.checkAnswer || "")
  };
}

function parseExplanationContent(content, model, level, teachingItem) {
  const cleaned = String(content)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return normalizeExplanation(JSON.parse(cleaned), model, level, teachingItem);
}

async function explainStudyItem(app, payload, fetchImpl = fetch) {
  const level = normalizeLevel(payload?.level);
  const type = String(payload?.type || "item").slice(0, 32);
  const title = String(payload?.title || "").trim().slice(0, 180);
  const meaning = String(payload?.meaning || "").trim().slice(0, 400);
  const focus = String(payload?.focus || "").trim().slice(0, 400);
  const context = String(payload?.context || "").trim().slice(0, 700);
  const translation = String(payload?.translation || "").trim().slice(0, 700);
  if (!title) throw new Error("A study item title is required.");

  const localAnswer = localStudyExplanation({
    level,
    type,
    title,
    meaning,
    focus,
    context,
    translation
  });
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
          temperature: 0.25,
          max_tokens: 650,
          thinking: { type: "disabled" },
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are a warm, concise English teacher for a Chinese learner. Create exactly four short spoken steps in this order: 1 meaning, 2 usage, 3 one authentic example, 4 a repeat-after-me prompt. Every scriptSentences item must be English-only, including the meaning step; never put Chinese characters there. Each array item must be one short sentence. Never add an introduction, conclusion, academic discussion, or a second sentence inside a step. The English must strictly match the requested CEFR level. Include one short Chinese summary, at most two bilingual key points, and one short comprehension question. Output JSON only with fields: title, scriptSentences[string], chineseSummary, keyPoints[{english,chinese}], checkQuestion, checkAnswer."
            },
            {
              role: "user",
              content: [
                `CEFR level: ${level}`,
                `Level rules: ${levelGuidance[level]}`,
                `Study type: ${type}`,
                `Item: ${title}`,
                `Chinese meaning or teaching note: ${meaning}`,
                `Form or pattern: ${focus}`,
                `Authentic sentence: ${context}`,
                `Chinese translation: ${translation}`
              ].join("\n")
            }
          ]
        }),
        signal: AbortSignal.timeout(25000)
      }
    );
    if (!response.ok) throw new Error(`Model request failed: ${response.status}`);
    const data = await response.json();
    return parseExplanationContent(
      data?.choices?.[0]?.message?.content,
      model,
      level,
      { title, context }
    );
  } catch {
    return localAnswer;
  }
}

function registerStudyExplainerHandlers(ipcMain, app) {
  ipcMain.handle("study:explain", (_event, payload) =>
    explainStudyItem(app, payload ?? {})
  );
}

module.exports = {
  explainStudyItem,
  levelGuidance,
  limitSpokenWords,
  localStudyExplanation,
  maxWordsByLevel,
  normalizeLevel,
  parseExplanationContent,
  registerStudyExplainerHandlers,
  stripTeachingPrefix
};
