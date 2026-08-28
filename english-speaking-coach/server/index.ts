import "dotenv/config";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import https from "node:https";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Response } from "express";
import { z } from "zod";
import {
  arkConfigured,
  completeJson,
  completeText,
  generateSceneImage
} from "./ark.ts";
import { hermesRouter } from "./hermes.ts";
import { mobileAuthRouter, requireMobileAccess } from "./mobileAuth.ts";
import { loadSpeechConfig, speechRouter } from "./speech.ts";
import { completeWithHermesInference } from "./hermesConfig.ts";

const app = express();
const port = Number(process.env.PORT ?? 8787);
const host =
  process.env.HOST ??
  (process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0");

app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        process.env.NODE_ENV !== "production" ||
        ["capacitor://localhost", "http://localhost", "https://localhost"].includes(
          origin
        )
      ) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed"));
    },
    allowedHeaders: ["Content-Type", "X-EasySay-Access-Code"],
    methods: ["GET", "POST", "PUT", "OPTIONS"]
  })
);
app.set("trust proxy", "loopback");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "connect-src": ["'self'"],
        "img-src": ["'self'", "data:", "https:"],
        "media-src": ["'self'", "blob:"]
      }
    }
  })
);
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "请求过于频繁，请稍后再试" }
  })
);
app.use(express.urlencoded({ extended: false, limit: "4kb" }));
app.use(mobileAuthRouter);
app.use(requireMobileAccess);
app.use(express.json({ limit: "2mb" }));

function sendApiError(
  response: Response,
  error: unknown,
  publicMessage: string
): void {
  if (error instanceof z.ZodError) {
    response.status(400).json({ message: "请求参数不正确" });
    return;
  }

  console.error(publicMessage, error);
  response.status(503).json({ message: publicMessage });
}

const profileSchema = z.object({
  name: z.string().min(1).max(40),
  level: z.enum(["A1", "A2", "B1", "B2"]),
  goal: z.enum(["daily", "travel", "work", "interview"]),
  minutesPerDay: z.union([z.literal(30), z.literal(45), z.literal(60)]),
  accent: z.enum(["american", "british"]),
  nativeLanguage: z.enum(["zh-CN", "en", "ja", "ko", "es", "fr"]),
  targetLanguage: z.enum(["zh-CN", "en", "ja", "ko", "es", "fr"]),
  createdAt: z.string()
});

const lessonSchema = z.object({
  category: z.string(),
  difficulty: z.number().int().min(1).max(5),
  roles: z.array(z.object({ name: z.string(), description: z.string() })).min(2),
  dialogues: z
    .array(
      z.object({
        speaker: z.string(),
        target: z.string(),
        translation: z.string()
      })
    )
    .min(3),
  vocabulary: z.array(
    z.object({
      term: z.string(),
      pronunciation: z.string().optional(),
      meaning: z.string(),
      example: z.string()
    })
  ),
  patterns: z.array(
    z.object({ pattern: z.string(), translation: z.string() })
  )
});

const weekSchema = z.object({
  week: z.number().int().min(1).max(24),
  phase: z.string(),
  theme: z.string(),
  outcome: z.string(),
  chunks: z.array(z.string()).min(3).max(6),
  lesson: lessonSchema.optional()
});

const planSchema = z.object({
  title: z.string(),
  level: z.enum(["A1", "A2", "B1", "B2"]),
  goal: z.enum(["daily", "travel", "work", "interview"]),
  summary: z.string(),
  weeks: z.array(weekSchema).length(24)
});

const feedbackSchema = z.object({
  summary: z.string(),
  intelligibility: z.number().min(1).max(5),
  fluency: z.number().min(1).max(5),
  expression: z.number().min(1).max(5),
  interaction: z.number().min(1).max(5),
  priorityIssue: z.string(),
  grammarFix: z.string(),
  naturalPhrases: z.array(z.string()).length(3),
  retryPrompt: z.string()
});

app.get("/api/health", async (_request, response) => {
  // #region debug-point B,D,E:server-arrival
  fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"iphone-hotspot-connection",runId:"post-fix",hypothesisId:"B,D,E",location:"server/index.ts:/api/health",msg:"[DEBUG] Health request reached Mac gateway",data:{remoteAddress:_request.socket.remoteAddress,userAgent:_request.get("user-agent")},ts:Date.now()})}).catch(()=>{});
  // #endregion
  const speech = await loadSpeechConfig().catch(() => undefined);
  response.json({
    ok: true,
    arkConfigured,
    models: {
      reasoning: process.env.ARK_REASONING_MODEL ?? "doubao-seed-evolving",
      vision: process.env.ARK_VISION_ENDPOINT ?? null,
      image:
        process.env.ARK_IMAGE_MODEL ?? "doubao-seedream-5-0-pro-260628",
      asr: speech?.asr.modelId ?? null,
      tts: speech?.tts.modelId ?? null
    }
  });
});

app.post("/api/plan", async (request, response) => {
  try {
    const profile = profileSchema.parse(request.body.profile);
    const languageNames = {
      "zh-CN": "中文",
      en: "英语",
      ja: "日语",
      ko: "韩语",
      es: "西班牙语",
      fr: "法语"
    };
    const result = await completeJson<unknown>(
      `你是面向成年人的语言口语课程设计师。学习者母语是${languageNames[profile.nativeLanguage]}，目标语言是${languageNames[profile.targetLanguage]}。根据用户档案生成24周计划。
原则：
1. 目标是可理解、流利和真实互动，不追求消除口音。
2. 六阶段依次为开口启动、生存口语、社交表达、职场沟通、即兴表达、真实迁移，每阶段4周。
3. 每周必须是一个真实场景，outcome 必须是可验收的口语任务。
4. chunks 必须是3到6个可直接说出的目标语言表达块。
返回字段：title, level, goal, summary, weeks。weeks 必须正好24项，每项包含 week, phase, theme, outcome, chunks。课程资料由系统基于这些场景继续展开。`,
      { profile },
      7200
    );
    const plan = planSchema.parse(result);
    response.json({ ...plan, generatedBy: "ark" });
  } catch (error) {
    sendApiError(response, error, "生成计划失败");
  }
});

app.post("/api/feedback", async (request, response) => {
  try {
    const profile = profileSchema.parse(request.body.profile);
    const prompt = z.string().min(1).parse(request.body.prompt);
    const transcript = z.string().parse(request.body.transcript);
    const result = await completeJson<unknown>(
      `你是严格但克制的语言口语教练。学习者母语是${profile.nativeLanguage}，正在学习${profile.targetLanguage}。
基于任务和转写文本评分，不要假装听到了音频，因此不要评价具体音素。
四项分数使用1到5：intelligibility, fluency, expression, interaction。
只指出一个最影响沟通的问题、一个高频语法改进、三个自然表达，并给出明确重说指令。
如果转写很短，直接指出输出不足。反馈使用学习者母语，表达块使用目标语言。
返回字段：summary, intelligibility, fluency, expression, interaction, priorityIssue, grammarFix, naturalPhrases, retryPrompt。`,
      { profile, prompt, transcript },
      1600
    );
    const feedback = feedbackSchema.parse(result);
    response.json({ ...feedback, source: "ark" });
  } catch (error) {
    sendApiError(response, error, "生成反馈失败");
  }
});

app.post("/api/tutor", async (request, response) => {
  try {
    const profile = profileSchema.parse(request.body.profile);
    const sentence = z.string().min(1).max(1000).parse(request.body.sentence);
    const question = z.string().min(1).max(500).parse(request.body.question);
    const answer = await completeWithHermesInference({
      system: `你是随练随问的语言老师。学习者母语是${profile.nativeLanguage}，目标语言是${profile.targetLanguage}，水平是${profile.level}。
只解决当前句子里的这个具体问题。先用一句话直接回答，再给一个简短规则和一个正确/错误对比例句。解释使用学习者母语，例句保留目标语言。规则必须前后一致，不确定时不要编造。使用纯文本，不要使用 Markdown。不要扩展成泛泛课程。`,
      prompt: `当前句子：${sentence}\n学习者的问题：${question}`
    });
    response.json({ answer, source: "hermes" });
  } catch (error) {
    sendApiError(response, error, "AI 老师暂时无法回答");
  }
});

app.post("/api/roleplay", async (request, response) => {
  try {
    const profile = profileSchema.parse(request.body.profile);
    const scenario = z.string().min(1).parse(request.body.scenario);
    const messages = z
      .array(
        z.object({
          role: z.enum(["coach", "learner"]),
          content: z.string()
        })
      )
      .max(30)
      .parse(request.body.messages);

    const reply = await completeText(
      `You are a ${profile.targetLanguage} role-play partner in this scenario: ${scenario}.
The learner is at ${profile.level}. Stay in character. Reply in one or two short sentences.
Ask one useful follow-up question. Do not correct the learner during the role-play.
Do not answer on the learner's behalf. Use only the target language ${profile.targetLanguage}. Keep vocabulary appropriate for the level.`,
      messages.map((message) => ({
        role: message.role === "coach" ? "assistant" : "user",
        content: message.content
      }))
    );
    response.json({ message: reply, source: "ark" });
  } catch (error) {
    sendApiError(response, error, "角色扮演失败");
  }
});

app.post("/api/scene-image", async (request, response) => {
  try {
    const scene = z.string().min(1).max(300).parse(request.body.scene);
    const url = await generateSceneImage(
      `Editorial mobile learning illustration for an adult English speaking scenario: ${scene}. Warm modern flat shapes, realistic setting, no text, no logos, calm teal and amber palette.`
    );
    response.json({ url });
  } catch (error) {
    sendApiError(response, error, "生成场景图失败");
  }
});

app.use("/api/speech", speechRouter);
app.use("/api/evolution", hermesRouter);

if (process.env.NODE_ENV === "production") {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const distDir = path.resolve(currentDir, "../dist");
  app.use(express.static(distDir));
  app.use((_request, response) => {
    response.sendFile(path.join(distDir, "index.html"));
  });
}

const tlsCertificatePath = process.env.TLS_CERT_PATH;
const tlsKeyPath = process.env.TLS_KEY_PATH;

if (tlsCertificatePath && tlsKeyPath) {
  https
    .createServer(
      {
        cert: fs.readFileSync(tlsCertificatePath),
        key: fs.readFileSync(tlsKeyPath)
      },
      app
    )
    .listen(port, host, () => {
      console.log(`EasySay listening on https://${host}:${port}`);
    });
} else {
  app.listen(port, host, () => {
    console.log(`EasySay listening on http://${host}:${port}`);
  });
}
