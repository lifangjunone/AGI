import express, { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "..");
const defaultConfigPath = path.join(projectRoot, "config", "speech-models.json");
const localConfigPath = path.join(projectRoot, ".local", "speech-models.json");

const serviceSchema = z.object({
  baseUrl: z
    .string()
    .url()
    .refine((value) => {
      const hostname = new URL(value).hostname;
      return ["127.0.0.1", "localhost", "[::1]"].includes(hostname);
    }, "语音服务必须使用本机回环地址"),
  host: z.enum(["127.0.0.1", "localhost", "::1"]),
  port: z.number().int().min(1024).max(65535),
  requestTimeoutMs: z.number().int().min(10_000).max(600_000)
});

const speechConfigSchema = z.object({
  version: z.literal(1),
  service: serviceSchema,
  runtime: z.object({
    engine: z.literal("mlx"),
    lazyLoad: z.boolean(),
    maxConcurrentRequests: z.number().int().min(1).max(2)
  }),
  asr: z.object({
    enabled: z.boolean(),
    modelId: z.string().min(1).max(200),
    modelPath: z.string().min(1).max(500),
    language: z.string().min(1).max(40),
    maxTokens: z.number().int().min(64).max(8192)
  }),
  tts: z.object({
    enabled: z.boolean(),
    modelId: z.string().min(1).max(200),
    modelPath: z.string().min(1).max(500),
    language: z.string().min(1).max(40),
    americanVoice: z.string().min(1).max(80),
    britishVoice: z.string().min(1).max(80),
    speed: z.number().min(0.7).max(1.3),
    temperature: z.number().min(0.1).max(1.5),
    styleInstruction: z.string().max(500)
  })
});

export type SpeechConfig = z.infer<typeof speechConfigSchema>;

function mergeConfig(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = merged[key];
    merged[key] =
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      baseValue &&
      typeof baseValue === "object" &&
      !Array.isArray(baseValue)
        ? mergeConfig(
            baseValue as Record<string, unknown>,
            value as Record<string, unknown>
          )
        : value;
  }
  return merged;
}

async function loadJson(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>;
}

export async function loadSpeechConfig(): Promise<SpeechConfig> {
  const defaults = await loadJson(defaultConfigPath);
  let merged = defaults;
  try {
    merged = mergeConfig(defaults, await loadJson(localConfigPath));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }
  return speechConfigSchema.parse(merged);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function proxyError(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => undefined)) as
    | { detail?: string; message?: string }
    | undefined;
  return payload?.detail ?? payload?.message ?? `语音服务返回 ${response.status}`;
}

async function getServiceStatus(config: SpeechConfig): Promise<unknown> {
  try {
    const response = await fetchWithTimeout(
      `${config.service.baseUrl}/health`,
      { method: "GET" },
      3_000
    );
    if (!response.ok) throw new Error(await proxyError(response));
    return response.json();
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "本地语音服务当前不可连接"
    };
  }
}

async function applyServiceConfig(config: SpeechConfig): Promise<unknown> {
  try {
    const response = await fetchWithTimeout(
      `${config.service.baseUrl}/v1/reload`,
      { method: "POST" },
      10_000
    );
    if (!response.ok) throw new Error(await proxyError(response));
    return response.json();
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "配置已保存，语音服务尚未运行"
    };
  }
}

export const speechRouter: Router = Router();

speechRouter.get("/config", async (_request, response) => {
  try {
    const config = await loadSpeechConfig();
    response.json({
      config,
      service: await getServiceStatus(config)
    });
  } catch (error) {
    console.error("读取语音配置失败", error);
    response.status(500).json({ message: "读取语音配置失败" });
  }
});

speechRouter.put("/config", async (request, response) => {
  try {
    const config = speechConfigSchema.parse(request.body);
    await fs.mkdir(path.dirname(localConfigPath), { recursive: true });
    const temporaryPath = `${localConfigPath}.tmp`;
    await fs.writeFile(
      temporaryPath,
      `${JSON.stringify(config, null, 2)}\n`,
      "utf8"
    );
    await fs.rename(temporaryPath, localConfigPath);
    response.json({
      config,
      service: await applyServiceConfig(config)
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      response.status(400).json({
        message: error.issues[0]?.message ?? "语音配置不正确"
      });
      return;
    }
    console.error("保存语音配置失败", error);
    response.status(500).json({ message: "保存语音配置失败" });
  }
});

speechRouter.post("/models/load", async (_request, response) => {
  try {
    const config = await loadSpeechConfig();
    const upstream = await fetchWithTimeout(
      `${config.service.baseUrl}/v1/models/load`,
      { method: "POST" },
      config.service.requestTimeoutMs
    );
    if (!upstream.ok) {
      response.status(503).json({ message: await proxyError(upstream) });
      return;
    }
    response.json(await upstream.json());
  } catch (error) {
    console.error("加载本地模型失败", error);
    response.status(503).json({ message: "本地模型加载失败" });
  }
});

speechRouter.post(
  "/asr",
  express.raw({
    type: ["audio/*", "video/webm", "application/octet-stream"],
    limit: "25mb"
  }),
  async (request, response) => {
    try {
      // #region debug-point A:B:C:gateway-request
      fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"iphone-asr-transcription",runId:"post-fix",hypothesisId:"A,B,C",location:"server/speech.ts:asr",msg:"[DEBUG] Gateway received ASR request",data:{contentType:request.get("Content-Type"),isBuffer:Buffer.isBuffer(request.body),bodyLength:Buffer.isBuffer(request.body)?request.body.length:null,contentLength:request.get("Content-Length")},ts:Date.now()})}).catch(()=>{});
      // #endregion
      if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
        response.status(400).json({ message: "没有收到录音数据" });
        return;
      }
      const config = await loadSpeechConfig();
      if (!config.asr.enabled) {
        response.status(503).json({ message: "本地 ASR 已关闭" });
        return;
      }
      const url = new URL("/v1/asr", config.service.baseUrl);
      const requestedLanguage = z
        .string()
        .min(1)
        .max(40)
        .catch(config.asr.language)
        .parse(request.query.language);
      url.searchParams.set("language", requestedLanguage);
      const upstream = await fetchWithTimeout(
        url.toString(),
        {
          method: "POST",
          headers: {
            "Content-Type": request.get("Content-Type") ?? "audio/webm"
          },
          body: request.body
        },
        config.service.requestTimeoutMs
      );
      // #region debug-point C:D:E:upstream-response
      fetch("http://127.0.0.1:7777/event",{method:"POST",body:JSON.stringify({sessionId:"iphone-asr-transcription",runId:"post-fix",hypothesisId:"C,D,E",location:"server/speech.ts:asr",msg:"[DEBUG] Speech service responded",data:{status:upstream.status,ok:upstream.ok,contentType:upstream.headers.get("content-type")},ts:Date.now()})}).catch(()=>{});
      // #endregion
      if (!upstream.ok) {
        response.status(503).json({ message: await proxyError(upstream) });
        return;
      }
      response.json(await upstream.json());
    } catch (error) {
      console.error("本地 ASR 失败", error);
      response.status(503).json({ message: "本地 ASR 暂时不可用" });
    }
  }
);

speechRouter.post("/tts", async (request, response) => {
  try {
    const payload = z
      .object({
        text: z.string().min(1).max(2_000),
        accent: z.enum(["american", "british"]).default("american"),
        voice: z.string().max(80).optional(),
        language: z.string().max(40).optional(),
        styleInstruction: z.string().max(500).optional()
      })
      .parse(request.body);
    const config = await loadSpeechConfig();
    if (!config.tts.enabled) {
      response.status(503).json({ message: "本地 TTS 已关闭" });
      return;
    }
    const upstream = await fetchWithTimeout(
      `${config.service.baseUrl}/v1/tts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      },
      config.service.requestTimeoutMs
    );
    if (!upstream.ok) {
      response.status(503).json({ message: await proxyError(upstream) });
      return;
    }
    response.status(200);
    response.setHeader("Content-Type", "audio/wav");
    response.setHeader("Cache-Control", "no-store");
    const latency = upstream.headers.get("x-latency-ms");
    if (latency) response.setHeader("X-Latency-Ms", latency);
    response.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    if (error instanceof z.ZodError) {
      response.status(400).json({ message: "朗读参数不正确" });
      return;
    }
    console.error("本地 TTS 失败", error);
    response.status(503).json({ message: "本地 TTS 暂时不可用" });
  }
});
