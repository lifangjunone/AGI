import { createFallbackPlan, enrichLearningPlan } from "../data/curriculum";
import { getLanguage } from "../data/languages";
import { resolveApiRequest } from "./nativeConnection";
import type {
  AppProgress,
  BaselineResult,
  CoachFeedback,
  CoachMessage,
  EvolutionInsight,
  EvolutionResult,
  LearnerProfile,
  LearningPlan,
  LanguageCode,
  SpeechConfig,
  SpeechServiceStatus
} from "../types";

async function postJson<T>(
  path: string,
  body: unknown,
  timeoutMs = 30_000
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    const request = await resolveApiRequest(path, {
      "Content-Type": "application/json"
    });
    response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "服务暂时不可用" }));
    throw new Error(error.message ?? "服务暂时不可用");
  }

  return response.json() as Promise<T>;
}

export async function generatePlan(profile: LearnerProfile): Promise<LearningPlan> {
  try {
    const plan = await postJson<LearningPlan>("/api/plan", { profile }, 45_000);
    return enrichLearningPlan(profile, plan);
  } catch {
    return createFallbackPlan(profile);
  }
}

export async function getEvolutionStatus(): Promise<{
  available: boolean;
  installed: boolean;
  configured: boolean;
  runtime: string;
  model: string;
  inference: {
    provider: "custom";
    mode: "cloud" | "local";
    baseUrl: string;
    model: string;
    apiKeyConfigured: boolean;
    source: "easysay-local" | "current-model-default";
  };
  localModel: {
    modelId: string;
    modelPath: string;
    baseUrl: string;
    downloaded: boolean;
    online: boolean;
  };
  privacy: string;
}> {
  const request = await resolveApiRequest("/api/evolution/status");
  const response = await fetch(request.url, { headers: request.headers });
  if (!response.ok) throw new Error("无法读取自进化引擎状态");
  return response.json();
}

export async function saveEvolutionInference(input: {
  mode: "cloud" | "local";
  baseUrl: string;
  model: string;
  apiKey?: string;
  clearApiKey?: boolean;
}): Promise<{
  ok: true;
  inference: Awaited<
    ReturnType<typeof getEvolutionStatus>
  >["inference"];
}> {
  return postJson("/api/evolution/inference", { ...input, test: true }, 30_000);
}

export async function evolveLearningPlan(input: {
  profile: LearnerProfile;
  baseline?: BaselineResult;
  plan: LearningPlan;
  progress: AppProgress;
  currentWeek: number;
  previousInsight?: EvolutionInsight;
}): Promise<EvolutionResult> {
  return postJson(
    "/api/evolution/analyze",
    {
      profile: input.profile,
      currentWeek: input.currentWeek,
      baseline: input.baseline
        ? {
            focusAreas: input.baseline.focusAreas,
            scores: input.baseline.scores
          }
        : undefined,
      records: input.progress.records.slice(-30).map((record) => ({
        createdAt: record.createdAt,
        durationSeconds: record.durationSeconds,
        transcript: record.transcript,
        completionMode: record.completionMode,
        feedback: record.feedback
          ? {
              intelligibility: record.feedback.intelligibility,
              fluency: record.feedback.fluency,
              expression: record.feedback.expression,
              interaction: record.feedback.interaction,
              priorityIssue: record.feedback.priorityIssue,
              grammarFix: record.feedback.grammarFix
            }
          : undefined
      })),
      weeks: input.plan.weeks.map((week) => ({
        week: week.week,
        phase: week.phase,
        theme: week.theme,
        outcome: week.outcome,
        chunks: week.chunks
      })),
      previousInsight: input.previousInsight
        ? {
            summary: input.previousInsight.summary,
            focusAreas: input.previousInsight.focusAreas
          }
        : undefined
    },
    120_000
  );
}

export async function getPracticeFeedback(input: {
  profile: LearnerProfile;
  prompt: string;
  transcript: string;
}): Promise<CoachFeedback> {
  try {
    return await postJson<CoachFeedback>("/api/feedback", input);
  } catch {
    const wordCount = input.transcript.trim().split(/\s+/).filter(Boolean).length;
    const hasReasons = /\b(because|reason|so|therefore)\b/i.test(input.transcript);
    const phrases: Record<LanguageCode, string[]> = {
      "zh-CN": ["换句话说……", "主要原因是……", "一个具体的例子是……"],
      en: [
        "Let me put it this way.",
        "The main reason is ...",
        "A good example would be ..."
      ],
      ja: ["言い換えると……", "主な理由は……", "具体的な例として……"],
      ko: ["다시 말하면……", "가장 큰 이유는……", "구체적인 예를 들면……"],
      es: ["Dicho de otra manera...", "La razón principal es...", "Un buen ejemplo sería..."],
      fr: ["Autrement dit...", "La raison principale est...", "Un bon exemple serait..."]
    };
    return {
      summary: "你完成了有效输出。下一遍先减少停顿，再补一个具体例子。",
      intelligibility: wordCount > 15 ? 3 : 2,
      fluency: wordCount > 35 ? 3 : 2,
      expression: hasReasons ? 3 : 2,
      interaction: 3,
      priorityIssue: "句子之间停顿较多，先用连接表达保持话轮。",
      grammarFix: "先保留简单句，确保时态一致，再增加复杂结构。",
      naturalPhrases: phrases[input.profile.targetLanguage],
      retryPrompt: "现在重新说一遍：保持连续，并加入一个具体例子。",
      source: "local"
    };
  }
}

export async function askPracticeTutor(input: {
  profile: LearnerProfile;
  sentence: string;
  question: string;
}): Promise<{ answer: string; source: "hermes" | "local" }> {
  try {
    return await postJson("/api/tutor", input, 90_000);
  } catch {
    return {
      answer:
        "先看这个表达在整句中的作用，而不是逐词翻译。保留原句结构，替换一个信息再说一遍，通常比单独背规则更容易掌握。",
      source: "local"
    };
  }
}

export async function continueRoleplay(input: {
  profile: LearnerProfile;
  scenario: string;
  messages: CoachMessage[];
}): Promise<{ message: string; source: "ark" | "local" }> {
  try {
    return await postJson("/api/roleplay", input);
  } catch {
    const promptsByLanguage: Record<LanguageCode, string[]> = {
      "zh-CN": ["听起来不错，可以再多说一点吗？", "能举一个具体的例子吗？"],
      en: [
        "That sounds good. Could you tell me a little more?",
        "Could you give me a specific example?"
      ],
      ja: ["いいですね。もう少し詳しく教えてください。", "具体的な例を挙げていただけますか。"],
      ko: ["좋네요. 조금 더 자세히 말씀해 주세요.", "구체적인 예를 들어 주시겠어요?"],
      es: ["Suena bien. ¿Puedes contarme un poco más?", "¿Puedes darme un ejemplo concreto?"],
      fr: ["Très bien. Pouvez-vous m'en dire un peu plus ?", "Pouvez-vous donner un exemple concret ?"]
    };
    const prompts = promptsByLanguage[input.profile.targetLanguage];
    return {
      message: prompts[input.messages.length % prompts.length],
      source: "local"
    };
  }
}

export async function finishRoleplay(input: {
  profile: LearnerProfile;
  scenario: string;
  messages: CoachMessage[];
}): Promise<CoachFeedback> {
  const transcript = input.messages
    .filter((message) => message.role === "learner")
    .map((message) => message.content)
    .join(" ");

  return getPracticeFeedback({
    profile: input.profile,
    prompt: input.scenario,
    transcript
  });
}

export async function getSpeechConfig(): Promise<{
  config: SpeechConfig;
  service: SpeechServiceStatus;
}> {
  const request = await resolveApiRequest("/api/speech/config");
  const response = await fetch(request.url, { headers: request.headers });
  if (!response.ok) throw new Error("无法读取本地模型配置");
  return response.json();
}

export async function saveSpeechConfig(
  config: SpeechConfig
): Promise<{ config: SpeechConfig; service: SpeechServiceStatus }> {
  return postJson("/api/speech/config", config, 15_000);
}

export async function loadSpeechModels(): Promise<SpeechServiceStatus> {
  return postJson("/api/speech/models/load", {}, 300_000);
}

export async function transcribeAudio(
  audio: Blob,
  targetLanguage: LanguageCode = "en"
): Promise<{ text: string; language: string; model: string; latencyMs: number }> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 180_000);
  try {
    const language = encodeURIComponent(getLanguage(targetLanguage).asrLanguage);
    const request = await resolveApiRequest(`/api/speech/asr?language=${language}`, {
      "Content-Type": audio.type || "audio/webm"
    });
    // #region debug-point A:B:client-request
    fetch("http://10.3.223.139:7777/event",{method:"POST",body:JSON.stringify({sessionId:"iphone-asr-transcription",runId:"post-fix",hypothesisId:"A,B",location:"api.ts:transcribeAudio",msg:"[DEBUG] Sending ASR request",data:{url:request.url,size:audio.size,type:audio.type||"audio/webm",hasAccessCode:request.headers.has("X-EasySay-Access-Code")},ts:Date.now()})}).catch(()=>{});
    // #endregion
    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: audio,
      signal: controller.signal
    });
    // #region debug-point B:C:D:E:client-response
    fetch("http://10.3.223.139:7777/event",{method:"POST",body:JSON.stringify({sessionId:"iphone-asr-transcription",runId:"post-fix",hypothesisId:"B,C,D,E",location:"api.ts:transcribeAudio",msg:"[DEBUG] ASR response received",data:{status:response.status,ok:response.ok,contentType:response.headers.get("content-type")},ts:Date.now()})}).catch(()=>{});
    // #endregion
    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: "本地转写暂时不可用" }));
      throw new Error(error.message ?? "本地转写暂时不可用");
    }
    return response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function synthesizeSpeech(input: {
  text: string;
  accent: LearnerProfile["accent"];
  language?: string;
  voice?: string;
  styleInstruction?: string;
}): Promise<Blob> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 180_000);
  try {
    const request = await resolveApiRequest("/api/speech/tts", {
      "Content-Type": "application/json"
    });
    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(input),
      signal: controller.signal
    });
    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: "本地朗读暂时不可用" }));
      throw new Error(error.message ?? "本地朗读暂时不可用");
    }
    return response.blob();
  } finally {
    window.clearTimeout(timeout);
  }
}
