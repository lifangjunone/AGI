function normalizeBaseUrl(value) {
  const endpoint = new URL(value || "http://127.0.0.1:43280/v1");
  if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error("invalid_maas_base_url");
  }
  return `${endpoint.origin}${endpoint.pathname.replace(/\/$/, "")}`;
}

export function maasConfiguration(env = process.env) {
  const apiKey = env.MAAS_SERVICE_KEY?.trim() || "";
  const modelId = env.MAAS_MODEL_ID?.trim() || "lym-chat-quality";
  const timeoutMs = Number(env.MODEL_TIMEOUT_MS || 120000);
  if (!apiKey) return null;
  if (!modelId) throw new Error("maas_model_not_configured");
  if (!Number.isFinite(timeoutMs) || timeoutMs < 3000 || timeoutMs > 120000) {
    throw new Error("invalid_maas_timeout");
  }
  return {
    baseUrl: normalizeBaseUrl(env.MAAS_BASE_URL || "http://127.0.0.1:43280/v1"),
    modelId,
    apiKey,
    timeoutMs
  };
}

export async function completeWithMaas(configuration, messages, { temperature = 0.72 } = {}) {
  if (!configuration?.apiKey || !configuration?.modelId) throw new Error("maas_not_configured");
  const response = await fetch(`${configuration.baseUrl}/chat/completions`, {
    method: "POST",
    redirect: "error",
    headers: {
      authorization: `Bearer ${configuration.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: configuration.modelId,
      messages,
      temperature,
      thinking: { type: "enabled" }
    }),
    signal: AbortSignal.timeout(configuration.timeoutMs)
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`maas_provider_error:${response.status}`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("maas_invalid_response");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("maas_response_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("maas_invalid_json");
  }
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("maas_empty_response");
  return content.trim();
}
