import { desc } from "drizzle-orm";
import { decryptModelSecret } from "./admin.js";
import { db } from "./db/client.js";
import { modelConfigurations } from "./db/schema.js";

export interface ModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelProvider {
  complete(messages: ModelMessage[], options?: { thinking?: boolean; json?: boolean }): Promise<string>;
}

export interface ResolvedModelConfiguration {
  source: "database" | "environment";
  provider: string;
  baseUrl: string;
  modelId: string;
  apiKey: string;
  thinkingEnabled: boolean;
  timeoutMs: number;
  temperature: number;
}

export async function resolveModelConfiguration(): Promise<ResolvedModelConfiguration> {
  const [configured] = await db.select().from(modelConfigurations)
    .orderBy(desc(modelConfigurations.updatedAt)).limit(1);
  if (configured) {
    if (!configured.enabled) throw new Error("model_not_configured");
    return {
      source: "database",
      provider: configured.provider,
      baseUrl: configured.baseUrl.replace(/\/$/, ""),
      modelId: configured.modelId,
      apiKey: decryptModelSecret(configured.apiKeyEncrypted),
      thinkingEnabled: configured.thinkingEnabled,
      timeoutMs: configured.timeoutMs,
      temperature: configured.temperatureMilli / 1000
    };
  }
  const apiKey = process.env.ARK_API_KEY ?? process.env.OPENAI_COMPATIBLE_API_KEY ?? "";
  const modelId = process.env.ARK_MODEL_ID ?? process.env.OPENAI_COMPATIBLE_MODEL ?? "";
  return {
    source: "environment",
    provider: process.env.ARK_API_KEY ? "ark" : "openai-compatible",
    baseUrl: (process.env.OPENAI_COMPATIBLE_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, ""),
    modelId,
    apiKey,
    thinkingEnabled: true,
    timeoutMs: Number(process.env.MODEL_TIMEOUT_MS ?? 1_800_000),
    temperature: 0.35
  };
}

export async function completeWithConfiguration(
  configuration: Omit<ResolvedModelConfiguration, "source">,
  messages: ModelMessage[],
  options: { thinking?: boolean; json?: boolean } = {}
) {
  if (!configuration.apiKey || !configuration.modelId) throw new Error("model_not_configured");
  const response = await fetch(`${configuration.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${configuration.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: configuration.modelId,
      messages,
      temperature: configuration.temperature,
      thinking: { type: (options.thinking ?? configuration.thinkingEnabled) ? "enabled" : "disabled" },
      ...(options.json ? { response_format: { type: "json_object" } } : {})
    }),
    signal: AbortSignal.timeout(configuration.timeoutMs)
  });
  if (!response.ok) throw new Error(`model_provider_error:${response.status}`);
  const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return body.choices?.[0]?.message?.content ?? "";
}

export class OpenAICompatibleProvider implements ModelProvider {
  async complete(messages: ModelMessage[], options: { thinking?: boolean; json?: boolean } = {}): Promise<string> {
    const configuration = await resolveModelConfiguration();
    return completeWithConfiguration(configuration, messages, options);
  }
}

export const modelProvider = new OpenAICompatibleProvider();

export function parseModelJson<T>(value: string): T {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned) as T;
}

const highRisk = /退款|合同|付款|转账|保证|承诺|refund|contract|payment|guarantee/i;

export function guardAgentReply(input: string): { escalate: boolean; reason?: string } {
  if (highRisk.test(input)) return { escalate: true, reason: "涉及付款、合同、退款或承诺，必须由真人处理" };
  return { escalate: false };
}
