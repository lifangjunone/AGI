import { describe, expect, it, vi } from "vitest";
import { maasPreflight } from "./maas-preflight.js";

const env = {
  MODEL_PROVIDER_MODE: "maas", MEYOU_MAAS_SERVICE_KEY: "private-test-key",
  MAAS_BASE_URL: "https://gateway.test/v1", MEYOU_MAAS_MODEL_ID: "chat-alias"
};
const mockRequest = (response: Response) => vi.fn<typeof fetch>().mockResolvedValue(response);

describe("read-only MaaS preflight", () => {
  it("does not contact a gateway for legacy or invalid configurations", async () => {
    const request = mockRequest(new Response());
    expect((await maasPreflight({}, request)).code).toBe("legacy_mode");
    expect((await maasPreflight({ ...env, MODEL_TIMEOUT_MS: "1800000" }, request)).code)
      .toBe("invalid_configuration");
    expect((await maasPreflight({ ...env, MAAS_BASE_URL: "invalid/private-test-key" }, request)).code)
      .toBe("invalid_configuration");
    expect(request).not.toHaveBeenCalled();
  });
  it("uses only GET models, prohibits redirects and does not claim inference success", async () => {
    const request = mockRequest(Response.json({ data: [{ id: "chat-alias" }] }));
    expect(await maasPreflight(env, request)).toEqual({
      ok: true, code: "model_authorized", inferenceVerified: false
    });
    expect(request).toHaveBeenCalledExactlyOnceWith("https://gateway.test/v1/models", {
      method: "GET", headers: { authorization: "Bearer private-test-key", accept: "application/json" },
      redirect: "error", signal: expect.any(AbortSignal)
    });
  });
  it("fails when a model is missing, disabled or outside application grants", async () => {
    expect((await maasPreflight(env, mockRequest(Response.json({ data: [] })))).code)
      .toBe("model_not_available");
  });
  it.each([401, 403, 500])("returns safe codes for HTTP %s without exposing remote bodies", async (status) => {
    const result = await maasPreflight(env, mockRequest(new Response("private-test-key", { status })));
    expect(result.code).toBe(status === 401 ? "invalid_service_key" : "gateway_http_error");
    expect(JSON.stringify(result)).not.toContain("private-test-key");
    expect(result.ok).toBe(false);
  });
  it("handles HTML, malformed lists and transport errors safely", async () => {
    expect((await maasPreflight(env, mockRequest(new Response("<html>private-test-key</html>")))).ok)
      .toBe(false);
    expect((await maasPreflight(env, mockRequest(Response.json({ data: "private-test-key" })))).code)
      .toBe("invalid_model_list");
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error("private-test-key"));
    expect(await maasPreflight(env, request)).toEqual({
      ok: false, code: "gateway_unreachable", inferenceVerified: false
    });
  });
});
