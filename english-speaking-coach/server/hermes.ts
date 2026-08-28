import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import {
  easysayHermesHome,
  loadHermesInferenceConfig,
  publicHermesInferenceConfig,
  saveHermesInferenceConfig,
  syncHermesRuntimeConfig,
  testHermesInferenceConfig
} from "./hermesConfig.ts";

const hermesHome = process.env.HERMES_HOME ?? easysayHermesHome;
const hermesBin =
  process.env.HERMES_AGENT_BIN ??
  path.join(os.homedir(), ".local", "bin", "hermes");
const localModelId = "mlx-community/Qwen3.5-9B-MLX-8bit";
const localModelPath =
  process.env.EASYSAY_LLM_MODEL_PATH ??
  path.join(process.cwd(), ".models", "Qwen3.5-9B-MLX-8bit");
const localBaseUrl =
  process.env.EASYSAY_LLM_BASE_URL ?? "http://127.0.0.1:8800/v1";

async function getLocalModelStatus() {
  const downloaded =
    fs.existsSync(path.join(localModelPath, "config.json")) &&
    fs.existsSync(path.join(localModelPath, "model-00001-of-00002.safetensors"));
  try {
    const response = await fetch(`${localBaseUrl}/models`, {
      headers: { Authorization: "Bearer local-easysay" },
      signal: AbortSignal.timeout(2000)
    });
    return {
      modelId: localModelId,
      modelPath: localModelPath,
      baseUrl: localBaseUrl,
      downloaded,
      online: response.ok
    };
  } catch {
    return {
      modelId: localModelId,
      modelPath: localModelPath,
      baseUrl: localBaseUrl,
      downloaded,
      online: false
    };
  }
}

const languageCodeSchema = z.enum(["zh-CN", "en", "ja", "ko", "es", "fr"]);
const profileSchema = z.object({
  level: z.enum(["A1", "A2", "B1", "B2"]),
  goal: z.enum(["daily", "travel", "work", "interview"]),
  minutesPerDay: z.union([z.literal(30), z.literal(45), z.literal(60)]),
  nativeLanguage: languageCodeSchema,
  targetLanguage: languageCodeSchema,
  createdAt: z.string()
});
const feedbackSchema = z.object({
  intelligibility: z.number().min(1).max(5),
  fluency: z.number().min(1).max(5),
  expression: z.number().min(1).max(5),
  interaction: z.number().min(1).max(5),
  priorityIssue: z.string().max(500),
  grammarFix: z.string().max(500)
});
const recordSchema = z.object({
  createdAt: z.string(),
  durationSeconds: z.number().min(0).max(3600),
  transcript: z.string().max(5000),
  completionMode: z.enum(["recommended", "user-confirmed"]).optional(),
  feedback: feedbackSchema.optional()
});
const weekSchema = z.object({
  week: z.number().int().min(1).max(24),
  phase: z.string().max(100),
  theme: z.string().max(200),
  outcome: z.string().max(500),
  chunks: z.array(z.string().max(300)).min(3).max(6)
});
const requestSchema = z.object({
  profile: profileSchema,
  currentWeek: z.number().int().min(1).max(24),
  baseline: z
    .object({
      focusAreas: z.array(z.string().max(300)).max(10),
      scores: z.object({
        intelligibility: z.number(),
        fluency: z.number(),
        expression: z.number(),
        interaction: z.number()
      })
    })
    .optional(),
  records: z.array(recordSchema).max(30),
  weeks: z.array(weekSchema).length(24),
  previousInsight: z
    .object({
      summary: z.string().max(2000),
      focusAreas: z.array(
        z.object({
          area: z.string().max(300),
          evidence: z.string().max(1000),
          priority: z.enum(["high", "medium", "low"])
        })
      )
    })
    .optional()
});

const resultSchema = z.object({
  summary: z.string().min(1).max(1200),
  strengths: z.array(z.string().min(1).max(300)).min(1).max(4),
  focusAreas: z
    .array(
      z.object({
        area: z.string().min(1).max(200),
        evidence: z.string().min(1).max(600),
        priority: z.enum(["high", "medium", "low"])
      })
    )
    .min(1)
    .max(4),
  nextActions: z.array(z.string().min(1).max(300)).min(1).max(4),
  weekAdjustments: z
    .array(
      z.object({
        week: z.number().int().min(1).max(24),
        theme: z.string().min(1).max(200),
        outcome: z.string().min(1).max(500),
        chunks: z.array(z.string().min(1).max(300)).min(3).max(6),
        reason: z.string().min(1).max(500)
      })
    )
    .max(6)
});

function parseJson(value: string): unknown {
  const normalized = value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const first = normalized.indexOf("{");
  const last = normalized.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("Hermes returned no JSON");
  return JSON.parse(normalized.slice(first, last + 1));
}

function normalizeStringList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Fall through to readable delimiter parsing.
  }
  return value
    .split(/\n|[;；]/)
    .map((item) => item.replace(/^\s*[-*\d.)、]+\s*/, "").trim())
    .filter(Boolean);
}

function normalizeHermesResult(value: unknown) {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const summary =
    typeof raw.summary === "string" ? raw.summary.trim() : "";
  const strengths = normalizeStringList(raw.strengths);
  const nextActions = normalizeStringList(raw.nextActions);
  const focusAreas = normalizeStringList(raw.focusAreas).map((item) => {
    if (item && typeof item === "object") return item;
    return {
      area: String(item),
      evidence: summary || "来自本轮练习轨迹分析",
      priority: "high"
    };
  });
  const primaryFocus =
    focusAreas[0] && typeof focusAreas[0] === "object"
      ? String((focusAreas[0] as Record<string, unknown>).area ?? "")
      : "";
  const weekAdjustments = Array.isArray(raw.weekAdjustments)
    ? raw.weekAdjustments.map((item) => {
        const week =
          item && typeof item === "object"
            ? (item as Record<string, unknown>)
            : {};
        const theme = String(week.theme ?? "定向口语强化");
        return {
          ...week,
          outcome:
            typeof week.outcome === "string"
              ? week.outcome
              : `围绕“${theme}”完成可理解的连续表达`,
          reason:
            typeof week.reason === "string"
              ? week.reason
              : primaryFocus
                ? `定向补强：${primaryFocus}`
                : "根据最新练习证据调整"
        };
      })
    : [];
  return {
    ...raw,
    summary,
    strengths,
    focusAreas,
    nextActions,
    weekAdjustments
  };
}

function runHermes(
  prompt: string,
  _learnerId: string,
  inference: {
    mode: "cloud" | "local";
    baseUrl: string;
    model: string;
    apiKey: string;
  }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      hermesBin,
      [
        "-z",
        prompt,
        "--provider",
        "custom",
        "--model",
        inference.model
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          HERMES_HOME: hermesHome,
          HERMES_INFERENCE_MODEL: inference.model,
          HERMES_INFERENCE_PROVIDER: "custom",
          CUSTOM_BASE_URL: inference.baseUrl,
          OPENAI_API_KEY:
            inference.mode === "local"
              ? "local-easysay"
              : inference.apiKey
        },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Hermes analysis timed out"));
    }, 120_000);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > 4_000_000) child.kill("SIGTERM");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0 && stdout.trim()) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(stderr.trim() || `Hermes exited with code ${code}`));
    });
  });
}

export const hermesRouter: Router = Router();

hermesRouter.get("/status", async (_request, response) => {
  const installed = fs.existsSync(hermesBin);
  const inference = await loadHermesInferenceConfig();
  const localModel = await getLocalModelStatus();
  const configured =
    installed &&
    (inference.config.mode === "local"
      ? localModel.online
      : Boolean(inference.config.apiKey));
  response.json({
    available: configured,
    installed,
    configured,
    runtime: hermesBin,
    model: inference.config.model,
    inference: publicHermesInferenceConfig(
      inference.config,
      inference.source
    ),
    localModel,
    privacy: "只发送转写、评分与课程结构，不发送录音文件"
  });
});

hermesRouter.post("/inference", async (request, response) => {
  try {
    const input = z
      .object({
        mode: z.enum(["cloud", "local"]).default("cloud"),
        baseUrl: z.string().url().max(500),
        model: z.string().min(1).max(200),
        apiKey: z.string().max(1000).optional(),
        clearApiKey: z.boolean().optional(),
        test: z.boolean().default(true)
      })
      .parse(request.body);
    const current = await loadHermesInferenceConfig();
    const selectedBaseUrl =
      input.mode === "local" ? localBaseUrl : input.baseUrl.trim().replace(/\/$/, "");
    const selectedModel =
      input.mode === "local" ? localModelPath : input.model.trim();
    const candidate = {
      version: 1 as const,
      provider: "custom" as const,
      mode: input.mode,
      baseUrl: selectedBaseUrl,
      model: selectedModel,
      apiKey: input.clearApiKey
        ? ""
        : input.apiKey?.trim() || current.config.apiKey,
      updatedAt: new Date().toISOString()
    };
    if (input.test) await testHermesInferenceConfig(candidate);
    const config = await saveHermesInferenceConfig({
      ...input,
      baseUrl: selectedBaseUrl,
      model: selectedModel
    });
    await syncHermesRuntimeConfig(config);
    response.json({
      ok: true,
      inference: publicHermesInferenceConfig(config, "easysay-local")
    });
  } catch (error) {
    console.error("Hermes inference configuration failed", error);
    response.status(400).json({
      message:
        error instanceof Error
          ? error.message
          : "推理模型配置验证失败"
    });
  }
});

hermesRouter.post("/analyze", async (request, response) => {
  try {
    const input = requestSchema.parse(request.body);
    if (input.records.length === 0) {
      response.status(400).json({ message: "至少完成一次口语练习后再启动进化" });
      return;
    }

    const learnerId = createHash("sha256")
      .update(input.profile.createdAt)
      .digest("hex")
      .slice(0, 16);
    const payload = {
      ...input,
      profile: { ...input.profile, createdAt: undefined }
    };
    const prompt = `你是 EasySay 的学习路线进化代理。请分析这个匿名学习者的真实练习轨迹，找出反复出现的沟通问题和已经形成的优势，并重排当前周起最多6周的训练路线。

硬性规则：
1. 不追求消除口音，优先保证可理解、流利、表达和互动。
2. 用户确认通过的记录代表“待补强”，不能当作标准掌握，也不能因此阻塞学习。
3. 证据必须来自转写、评分、练习时长或历史诊断，不得臆测音素问题。
4. 只调整第 ${input.currentWeek} 周及之后的路线；已完成历史不可改写。
5. weekAdjustments 最多6项，每项保留3到6个可直接说出的目标语言表达块。
6. 反馈使用学习者母语，chunks 使用目标语言。
7. 只输出合法 JSON，不要 Markdown。字段必须为 summary, strengths, focusAreas, nextActions, weekAdjustments。

学习数据：
${JSON.stringify(payload)}`;

    const inference = await loadHermesInferenceConfig();
    const localModel = await getLocalModelStatus();
    const inferenceReady =
      inference.config.mode === "local"
        ? localModel.online
        : Boolean(inference.config.apiKey);
    if (!fs.existsSync(hermesBin) || !inferenceReady) {
      response.status(503).json({
        message:
          inference.config.mode === "local"
            ? "本地 Qwen3.5 模型服务尚未启动"
            : "Hermes Agent 尚未配置推理模型，请在设置中填写 API Key"
      });
      return;
    }

    await syncHermesRuntimeConfig(inference.config);
    const content = await runHermes(prompt, learnerId, inference.config);
    const result = resultSchema.parse(
      normalizeHermesResult(parseJson(content))
    );
    const validAdjustments = result.weekAdjustments.filter(
      (item) => item.week >= input.currentWeek
    );
    const previousThemes = new Map(
      input.weeks.map((week) => [week.week, week.theme])
    );
    const generatedAt = new Date().toISOString();

    response.json({
      insight: {
        id: `hermes-${Date.now()}`,
        generatedAt,
        source: "hermes-agent",
        summary: result.summary,
        strengths: result.strengths,
        focusAreas: result.focusAreas,
        nextActions: result.nextActions,
        routeChanges: validAdjustments.map((item) => ({
          week: item.week,
          previousTheme: previousThemes.get(item.week) ?? "",
          newTheme: item.theme,
          reason: item.reason
        })),
        analyzedRecordCount: input.records.length
      },
      weekAdjustments: validAdjustments
    });
  } catch (error) {
    console.error("Hermes evolution failed", error);
    const message =
      error instanceof z.ZodError
        ? "Hermes 返回的路线结构不完整，请重试"
        : "赫尔墨斯进化引擎暂时不可用";
    response.status(503).json({ message });
  }
});
