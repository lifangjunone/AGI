import { describe, expect, it, vi } from "vitest";
import { maasShadow } from "./maas-shadow.js";
import { modelCompletion } from "./model-transport.js";

const env = { MODEL_PROVIDER_MODE: "maas", MEYOU_MAAS_SERVICE_KEY: "isolated-shadow-key",
  MAAS_BASE_URL: "https://gateway.test/v1", MODEL_TIMEOUT_MS: "10000" };
describe("synthetic MaaS shadow verification", () => {
  it("requires explicit paid inference confirmation and valid opt-in", async () => {
    const complete = vi.fn<typeof modelCompletion>();
    expect((await maasShadow(env, false, complete)).code).toBe("not_confirmed");
    expect((await maasShadow({}, true, complete)).code).toBe("legacy_mode");
    expect((await maasShadow({ ...env, MODEL_TIMEOUT_MS: "1800000" }, true, complete)).code).toBe("invalid_configuration");
    expect(complete).not.toHaveBeenCalled();
  });
  it("checks both thinking variants using the real client's JSON contract", async () => {
    const complete = vi.fn<typeof modelCompletion>().mockResolvedValue('{"probe":"meyou-maas","ok":true,"values":[2,4]}');
    const result = await maasShadow(env, true, complete);
    expect(result).toMatchObject({ ok: true, code: "contract_verified", inferenceVerified: true });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls.map(call => call[2])).toEqual([
      { json: true, thinking: false }, { json: true, thinking: true }
    ]);
    expect(JSON.stringify(result)).not.toContain("isolated-shadow-key");
    expect(JSON.stringify(result)).not.toContain('"probe"');
  });
  it.each([
    ["private model text", "invalid_json"],
    ['{"ok":true}', "contract_mismatch"],
    ['{"probe":"meyou-maas","ok":true,"values":[2,4],"extra":1}', "contract_mismatch"]
  ])("rejects invalid contract without outputting content", async (content, code) => {
    const complete = vi.fn<typeof modelCompletion>().mockResolvedValue(content);
    expect((await maasShadow(env, true, complete)).code).toBe(code);
    expect(complete).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["model_provider_error:401", "invalid_service_key"],
    ["model_provider_error:403", "model_not_authorized"],
    ["isolated-shadow-key", "inference_failed"]
  ])("sanitizes failures and stops further calls", async (message, code) => {
    const complete = vi.fn<typeof modelCompletion>().mockRejectedValue(new Error(message));
    const result = await maasShadow(env, true, complete);
    expect(result.code).toBe(code);
    expect(result.inferenceVerified).toBe(false);
    expect(JSON.stringify(result)).not.toContain("isolated-shadow-key");
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
