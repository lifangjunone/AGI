import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { z } from "zod";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const configPath =
  process.env.HERMES_INFERENCE_CONFIG_PATH ??
  path.join(projectRoot, ".local", "hermes-inference.json");
export const easysayHermesHome =
  process.env.HERMES_RUNTIME_HOME ??
  path.join(projectRoot, ".local", "hermes-runtime");

const configSchema = z.object({
  version: z.literal(1),
  provider: z.literal("custom"),
  mode: z.enum(["cloud", "local"]).default("cloud"),
  baseUrl: z.string().url().max(500),
  model: z.string().min(1).max(200),
  apiKey: z.string().max(1000),
  updatedAt: z.string()
});

export type HermesInferenceConfig = z.infer<typeof configSchema>;

export interface HermesInferencePublicConfig {
  provider: "custom";
  mode: "cloud" | "local";
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
  source: "easysay-local" | "current-model-default";
}

function defaultConfig(): HermesInferenceConfig {
  return {
    version: 1,
    provider: "custom",
    mode: "cloud",
    baseUrl:
      process.env.ARK_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3",
    model: process.env.ARK_REASONING_MODEL ?? "doubao-seed-evolving",
    apiKey: process.env.ARK_API_KEY ?? "",
    updatedAt: new Date(0).toISOString()
  };
}

export async function loadHermesInferenceConfig(): Promise<{
  config: HermesInferenceConfig;
  source: HermesInferencePublicConfig["source"];
}> {
  try {
    const stored = configSchema.parse(
      JSON.parse(await fs.readFile(configPath, "utf8"))
    );
    return { config: stored, source: "easysay-local" };
  } catch {
    return { config: defaultConfig(), source: "current-model-default" };
  }
}

export function publicHermesInferenceConfig(
  config: HermesInferenceConfig,
  source: HermesInferencePublicConfig["source"]
): HermesInferencePublicConfig {
  return {
    provider: config.provider,
    mode: config.mode,
    baseUrl: config.baseUrl,
    model: config.model,
    apiKeyConfigured: config.mode === "local" || Boolean(config.apiKey),
    source
  };
}

export async function saveHermesInferenceConfig(input: {
  mode?: "cloud" | "local";
  baseUrl: string;
  model: string;
  apiKey?: string;
  clearApiKey?: boolean;
}): Promise<HermesInferenceConfig> {
  const current = await loadHermesInferenceConfig();
  const apiKey = input.clearApiKey
    ? ""
    : input.apiKey?.trim() || current.config.apiKey;
  const next = configSchema.parse({
    version: 1,
    provider: "custom",
    mode: input.mode ?? current.config.mode,
    baseUrl: input.baseUrl.trim().replace(/\/$/, ""),
    model: input.model.trim(),
    apiKey,
    updatedAt: new Date().toISOString()
  });

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  await fs.chmod(configPath, 0o600);
  return next;
}

export async function testHermesInferenceConfig(
  config: HermesInferenceConfig
): Promise<void> {
  if (config.mode === "cloud" && !config.apiKey) {
    throw new Error("请先填写推理模型 API Key");
  }
  const client = new OpenAI({
    apiKey:
      config.mode === "local"
        ? "local-easysay"
        : config.apiKey,
    baseURL: config.baseUrl,
    maxRetries: 0,
    timeout: 20_000
  });
  const result = await client.chat.completions.create({
    model: config.model,
    messages: [{ role: "user", content: "Reply with exactly: OK" }],
    max_tokens: 8,
    temperature: 0
  });
  if (!result.choices[0]?.message?.content?.trim()) {
    throw new Error("推理模型返回空结果");
  }
}

export async function completeWithHermesInference(input: {
  system: string;
  prompt: string;
}): Promise<string> {
  const { config } = await loadHermesInferenceConfig();
  const client = new OpenAI({
    apiKey: config.mode === "local" ? "local-easysay" : config.apiKey,
    baseURL: config.baseUrl,
    maxRetries: 0,
    timeout: 60_000
  });
  const result = await client.chat.completions.create({
    model: config.model,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.prompt }
    ],
    max_tokens: 500,
    temperature: 0.35
  });
  const content = result.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("推理模型返回空结果");
  return content;
}

export async function syncHermesRuntimeConfig(
  config: HermesInferenceConfig
): Promise<void> {
  const runtimeApiKey =
    config.mode === "local" ? "local-easysay" : config.apiKey;
  const yaml = [
    "model:",
    `  default: ${JSON.stringify(config.model)}`,
    '  provider: "custom"',
    `  base_url: ${JSON.stringify(config.baseUrl)}`,
    `  api_key: ${JSON.stringify(runtimeApiKey)}`,
    '  api_mode: "chat_completions"',
    "agent:",
    "  max_turns: 1",
    "tools:",
    "  cli: []",
    ""
  ].join("\n");
  await fs.mkdir(easysayHermesHome, { recursive: true });
  const runtimeConfigPath = path.join(easysayHermesHome, "config.yaml");
  await fs.writeFile(runtimeConfigPath, yaml, {
    encoding: "utf8",
    mode: 0o600
  });
  await fs.chmod(runtimeConfigPath, 0o600);
}
