import { desc } from "drizzle-orm";
import { decryptModelSecret } from "./admin.js";
import { db } from "./db/client.js";
import { modelConfigurations } from "./db/schema.js";
import { createHash } from "node:crypto";
import { maasConfiguration } from "./maas-config.js";
import { modelCompletion } from "./model-transport.js";

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
  revision?: string;
}

export interface ModelExecution {
  content: string;
  provider: string;
  model: string;
  source: ResolvedModelConfiguration["source"];
  /** Internal opaque configuration identity, never exposed as a credential. */
  configurationId: string;
}

function configurationIdentity(configuration: ResolvedModelConfiguration) {
  return createHash("sha256").update(JSON.stringify(configuration)).digest("hex");
}

export async function assertModelExecutionCurrent(execution: ModelExecution) {
  const current = await resolveModelConfiguration();
  if (configurationIdentity(current) !== execution.configurationId) {
    throw new Error("model_configuration_changed");
  }
}

export function modelExecutionMetadata(execution: ModelExecution) {
  return { provider: execution.provider, model: execution.model, configurationSource: execution.source };
}

export async function resolveModelConfiguration(): Promise<ResolvedModelConfiguration> {
  const maas = maasConfiguration(process.env);
  if (maas) return maas;
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
      temperature: configured.temperatureMilli / 1000,
      revision: configured.updatedAt.toISOString()
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
  return modelCompletion(configuration, messages, options);
}

export class OpenAICompatibleProvider implements ModelProvider {
  async complete(messages: ModelMessage[], options: { thinking?: boolean; json?: boolean } = {}): Promise<string> {
    return (await this.completeDetailed(messages, options)).content;
  }

  async completeDetailed(messages: ModelMessage[], options: { thinking?: boolean; json?: boolean } = {}): Promise<ModelExecution> {
    const configuration = await resolveModelConfiguration();
    const content = await completeWithConfiguration(configuration, messages, options);
    if (!content.trim()) throw new Error("model_empty_response");
    const execution: ModelExecution = {
      content, provider: configuration.provider, model: configuration.modelId,
      source: configuration.source, configurationId: configurationIdentity(configuration)
    };
    // The admin may have disabled or replaced a model while the request was in flight.
    await assertModelExecutionCurrent(execution);
    return execution;
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
