import { maasConfiguration } from "./maas-config.js";
import { modelCompletion, type ModelTransportConfiguration } from "./model-transport.js";

export type ShadowCode = "invalid_configuration" | "legacy_mode" | "not_confirmed"
  | "invalid_service_key" | "model_not_authorized" | "inference_failed"
  | "invalid_json" | "contract_mismatch" | "contract_verified";
export interface ShadowCheck {
  thinking: boolean;
  ok: boolean;
  code: ShadowCode;
  latencyMs: number;
}
export interface ShadowResult {
  ok: boolean;
  code: ShadowCode;
  inferenceVerified: boolean;
  checks: ShadowCheck[];
}

/** Two synthetic paid inference requests, no business jobs/DB access or returned model content. */
export async function maasShadow(
  env: NodeJS.ProcessEnv,
  confirmed = false,
  complete: typeof modelCompletion = modelCompletion
): Promise<ShadowResult> {
  const fail = (code: ShadowCode): ShadowResult => ({ ok: false, code, inferenceVerified: false, checks: [] });
  if (!confirmed) return fail("not_confirmed");
  let configuration: ModelTransportConfiguration | null;
  try { configuration = maasConfiguration(env); }
  catch { return fail("invalid_configuration"); }
  if (!configuration) return fail("legacy_mode");
  const checks: ShadowCheck[] = [];
  for (const thinking of [false, true]) {
    const started = performance.now();
    let code: ShadowCode = "contract_verified";
    try {
      const content = await complete(configuration, [{
        role: "user",
        content: 'Migration synthetic JSON test. Return exactly {"probe":"meyou-maas","ok":true,"values":[2,4]}. No markdown or extra fields.'
      }], { json: true, thinking });
      let data;
      try { data = JSON.parse(content); }
      catch { code = "invalid_json"; }
      if (code === "contract_verified" && (!data || data.probe !== "meyou-maas" || data.ok !== true
        || !Array.isArray(data.values) || JSON.stringify(data.values) !== "[2,4]"
        || Object.keys(data).sort().join(",") !== "ok,probe,values")) code = "contract_mismatch";
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      code = message === "model_provider_error:401" ? "invalid_service_key"
        : message === "model_provider_error:403" ? "model_not_authorized" : "inference_failed";
    }
    checks.push({ thinking, ok: code === "contract_verified", code, latencyMs: Math.round(performance.now() - started) });
    // Do not send a second paid request after a failure.
    if (code !== "contract_verified") break;
  }
  const ok = checks.length === 2 && checks.every(check => check.ok);
  return { ok, code: ok ? "contract_verified" : checks.at(-1)!.code, inferenceVerified: ok, checks };
}
