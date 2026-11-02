import { afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rows: vi.fn() }));
vi.mock("./db/client.js", () => ({
  db: { select: () => ({ from: () => ({ orderBy: () => ({ limit: state.rows }) }) }) }
}));
vi.mock("./admin.js", () => ({ decryptModelSecret: () => "server-secret" }));
import { assertModelExecutionCurrent, modelExecutionMetadata, modelProvider } from "./model.js";

function configuration(overrides = {}) {
  return {
    enabled: true, provider: "custom-compatible", baseUrl: "https://model.example/api/v3",
    modelId: "actual-model", apiKeyEncrypted: "encrypted", thinkingEnabled: true,
    timeoutMs: 10000, temperatureMilli: 300, updatedAt: new Date("2026-10-30T00:00:00Z"),
    ...overrides
  };
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("model execution boundaries", () => {
  it("routes MaaS requests without reading legacy provider credentials and preserves JSON options", async () => {
    vi.stubEnv("MODEL_PROVIDER_MODE", "maas");
    vi.stubEnv("MEYOU_MAAS_SERVICE_KEY", "test-service-key");
    vi.stubEnv("MEYOU_MAAS_MODEL_ID", "maas-chat");
    vi.stubEnv("MAAS_BASE_URL", "http://gateway.test/v1");
    vi.stubEnv("MODEL_TIMEOUT_MS", "10000");
    state.rows.mockReset();
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }]
    })));
    vi.stubGlobal("fetch", fetch);
    const result = await modelProvider.completeDetailed([{ role: "user", content: "test" }], { json: true, thinking: false });
    expect(state.rows).not.toHaveBeenCalled();
    expect(fetch.mock.calls[0]![0]).toBe("http://gateway.test/v1/chat/completions");
    expect(fetch.mock.calls[0]![1].headers.authorization).toBe("Bearer test-service-key");
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toMatchObject({
      model: "maas-chat", response_format: { type: "json_object" }, thinking: { type: "disabled" }
    });
    expect(modelExecutionMetadata(result).provider).toBe("maas");
    expect(JSON.stringify(result)).not.toContain("test-service-key");
  });
  it("does not call any endpoint when the admin disabled the model", async () => {
    state.rows.mockReset().mockResolvedValue([configuration({ enabled: false })]);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(modelProvider.complete([{ role: "user", content: "hello" }])).rejects.toThrow("model_not_configured");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects a response when disabled during the request", async () => {
    state.rows.mockReset().mockResolvedValueOnce([configuration()])
      .mockResolvedValueOnce([configuration({ enabled: false })]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "old response" } }]
    }))));
    await expect(modelProvider.complete([])).rejects.toThrow("model_not_configured");
  });
  it("rejects configuration changes even if the model name remains the same", async () => {
    state.rows.mockReset().mockResolvedValueOnce([configuration()])
      .mockResolvedValueOnce([configuration({ updatedAt: new Date("2026-10-30T01:00:00Z") })]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "old response" } }]
    }))));
    await expect(modelProvider.complete([])).rejects.toThrow("model_configuration_changed");
  });
  it("returns actual provider/model metadata without exposing credentials or fingerprints", async () => {
    state.rows.mockReset().mockResolvedValue([configuration()]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "real response" } }]
    }))));
    const result = await modelProvider.completeDetailed([]);
    expect(result.content).toBe("real response");
    expect(modelExecutionMetadata(result)).toEqual({
      provider: "custom-compatible", model: "actual-model", configurationSource: "database"
    });
    expect(JSON.stringify(result)).not.toContain("server-secret");
    state.rows.mockResolvedValue([configuration({ modelId: "replacement" })]);
    await expect(assertModelExecutionCurrent(result)).rejects.toThrow("model_configuration_changed");
  });
  it("rejects empty model output rather than treating it as a successful message", async () => {
    state.rows.mockReset().mockResolvedValue([configuration()]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [] }))));
    await expect(modelProvider.complete([])).rejects.toThrow("model_empty_response");
  });
});
