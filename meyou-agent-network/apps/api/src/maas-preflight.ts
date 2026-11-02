import { maasConfiguration } from "./maas-config.js";

export type PreflightCode = "invalid_configuration" | "legacy_mode" | "invalid_service_key"
  | "gateway_http_error" | "gateway_unreachable" | "invalid_model_list"
  | "model_not_available" | "model_authorized";

export interface MaasPreflightResult {
  ok: boolean;
  code: PreflightCode;
  inferenceVerified: false;
}

/** Read-only permission check. Never returns credentials, remote bodies or raw errors. */
export async function maasPreflight(
  env: NodeJS.ProcessEnv,
  request: typeof fetch = fetch
): Promise<MaasPreflightResult> {
  const result = (ok: boolean, code: PreflightCode): MaasPreflightResult => ({
    ok, code, inferenceVerified: false
  });
  let config;
  try {
    config = maasConfiguration(env);
  } catch {
    return result(false, "invalid_configuration");
  }
  if (!config) return result(false, "legacy_mode");
  try {
    const response = await request(`${config.baseUrl}/models`, {
      method: "GET",
      headers: { authorization: `Bearer ${config.apiKey}`, accept: "application/json" },
      // Never forward a service key to a redirected endpoint (including SSO).
      redirect: "error",
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      await response.body?.cancel();
      return result(false, response.status === 401 ? "invalid_service_key" : "gateway_http_error");
    }
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !("data" in payload)
      || !Array.isArray(payload.data)) return result(false, "invalid_model_list");
    const available = payload.data.some((entry: unknown) => entry !== null
      && typeof entry === "object" && "id" in entry && entry.id === config.modelId);
    return result(available, available ? "model_authorized" : "model_not_available");
  } catch {
    return result(false, "gateway_unreachable");
  }
}
