import { describe, expect, it } from "vitest";
import { maasConfiguration } from "./maas-config.js";

describe("explicit MaaS configuration boundary", () => {
  it("leaves default and legacy database resolution intact", () => {
    expect(maasConfiguration({})).toBeNull();
    expect(maasConfiguration({ MODEL_PROVIDER_MODE: "legacy" })).toBeNull();
  });
  it("uses logical model and server-side service key without legacy provider values", () => {
    const config = maasConfiguration({
      MODEL_PROVIDER_MODE: "maas", MAAS_BASE_URL: "http://gateway:43280/v1/",
      MEYOU_MAAS_SERVICE_KEY: "test-service-key", MEYOU_MAAS_MODEL_ID: "chat-alias",
      ARK_API_KEY: "legacy-key"
    });
    expect(config).toMatchObject({
      provider: "maas", baseUrl: "http://gateway:43280/v1", modelId: "chat-alias",
      apiKey: "test-service-key", timeoutMs: 120000
    });
  });
  it("fails closed instead of silently falling back when MaaS is misconfigured", () => {
    expect(() => maasConfiguration({ MODEL_PROVIDER_MODE: "maas" })).toThrow("maas_not_configured");
    expect(() => maasConfiguration({ MODEL_PROVIDER_MODE: "typo" })).toThrow("invalid_model_provider_mode");
    expect(() => maasConfiguration({ MODEL_PROVIDER_MODE: "maas", MEYOU_MAAS_SERVICE_KEY: "test",
      MAAS_BASE_URL: "https://user:secret@example.test/v1" })).toThrow("invalid_maas_base_url");
    expect(() => maasConfiguration({ MODEL_PROVIDER_MODE: "maas", MEYOU_MAAS_SERVICE_KEY: "test",
      MODEL_TIMEOUT_MS: "1800000" })).toThrow("invalid_maas_timeout");
  });
});
