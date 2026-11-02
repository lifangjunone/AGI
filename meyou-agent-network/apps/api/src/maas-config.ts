export function maasConfiguration(env: NodeJS.ProcessEnv) {
  if (!env.MODEL_PROVIDER_MODE || env.MODEL_PROVIDER_MODE === "legacy") return null;
  if (env.MODEL_PROVIDER_MODE !== "maas") throw new Error("invalid_model_provider_mode");
  const endpoint = new URL(env.MAAS_BASE_URL || "https://maas.lifeyoume.icu/v1");
  if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password
    || endpoint.search || endpoint.hash) throw new Error("invalid_maas_base_url");
  const apiKey = env.MEYOU_MAAS_SERVICE_KEY?.trim() || "";
  const modelId = env.MEYOU_MAAS_MODEL_ID?.trim() || "lym-chat-quality";
  const timeoutMs = Number(env.MODEL_TIMEOUT_MS || 120000);
  if (!apiKey || !modelId) throw new Error("maas_not_configured");
  if (!Number.isFinite(timeoutMs) || timeoutMs < 3000 || timeoutMs > 120000) {
    throw new Error("invalid_maas_timeout");
  }
  return {
    source: "environment" as const,
    provider: "maas",
    baseUrl: `${endpoint.origin}${endpoint.pathname.replace(/\/$/, "")}`,
    modelId, apiKey, thinkingEnabled: true, timeoutMs, temperature: 0.35
  };
}
