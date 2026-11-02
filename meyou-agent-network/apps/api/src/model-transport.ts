export interface ModelTransportConfiguration {
  baseUrl: string;
  modelId: string;
  apiKey: string;
  temperature: number;
  thinkingEnabled: boolean;
  timeoutMs: number;
}

/** Shared by production inference and isolated migration probes. No database dependencies. */
export async function modelCompletion(
  configuration: ModelTransportConfiguration,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options: { thinking?: boolean; json?: boolean } = {}
): Promise<string> {
  if (!configuration.apiKey || !configuration.modelId) throw new Error("model_not_configured");
  const response = await fetch(`${configuration.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    redirect: "error",
    headers: { authorization: `Bearer ${configuration.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: configuration.modelId, messages, temperature: configuration.temperature,
      thinking: { type: (options.thinking ?? configuration.thinkingEnabled) ? "enabled" : "disabled" },
      ...(options.json ? { response_format: { type: "json_object" } } : {})
    }),
    signal: AbortSignal.timeout(configuration.timeoutMs)
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`model_provider_error:${response.status}`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("model_invalid_response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("model_response_too_large");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("model_invalid_response"); }
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("model_empty_response");
  return content;
}
