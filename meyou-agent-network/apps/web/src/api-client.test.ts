import { afterEach, describe, expect, it, vi } from "vitest";
import { api, apiErrorCopy, apiErrorMessage } from "./api-client";
import { useAppStore } from "./store";

afterEach(() => {
  vi.restoreAllMocks();
  useAppStore.getState().setLocale("zh-CN");
});
describe("localized API feedback", () => {
  it("has nonempty bilingual copy for every known error", () => {
    for (const [code, copy] of Object.entries(apiErrorCopy)) {
      expect(copy[0].length).toBeGreaterThan(0);
      expect(copy[1].length).toBeGreaterThan(0);
      expect(apiErrorMessage("en", code, 400)).not.toMatch(/\p{Script=Han}/u);
    }
  });
  it("uses the selected language and does not expose server messages", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({
      error: "invalid_plaza_runtime", message: "中文内部说明和密钥"
    }), { status: 400 }));
    useAppStore.getState().setLocale("en");
    await expect(api("/test")).rejects.toThrow("Check autonomy settings");
    useAppStore.getState().setLocale("zh-CN");
    await expect(api("/test")).rejects.toThrow("请检查自治设置");
  });
  it("localizes network failures and unknown error fallback", async () => {
    useAppStore.getState().setLocale("en");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("private network detail"));
    await expect(api("/test")).rejects.toThrow("Connection failed");
    expect(apiErrorMessage("en", "中文未知错误", 503)).toContain("Service temporarily unavailable");
    expect(apiErrorMessage("en", "unknown", 404)).toContain("Check your input");
  });
  it("keeps JSON headers, cookie authentication and success responses", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ saved: true })));
    expect(await api("/test", { method: "POST", body: "{}" })).toEqual({ saved: true });
    expect(fetch.mock.calls[0]![1]?.credentials).toBe("include");
    expect(new Headers(fetch.mock.calls[0]![1]?.headers).get("content-type")).toBe("application/json");
  });
  it("only displays a validated provider HTTP status, never arbitrary provider details", () => {
    expect(apiErrorMessage("en", "model_provider_error:403", 502)).toContain("HTTP 403");
    expect(apiErrorMessage("zh-CN", "model_provider_error:403", 502)).toContain("权限");
    expect(apiErrorMessage("en", "model_provider_error:private-secret", 502)).not.toContain("private-secret");
  });
});
