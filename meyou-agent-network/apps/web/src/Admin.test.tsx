import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { AdminConsole } from "./Admin";
import { useAppStore } from "./store";

it("MaaS mode presents the active logical alias without legacy controls or supplier masks", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
    const body = String(input).endsWith("/session")
      ? { admin: { email: "test@example.invalid" }, modelProviderMode: "maas" }
      : { configuration: { provider: "maas", modelId: "lym-chat-quality", source: "environment",
        apiKeyMasked: "should-not-display-provider-mask", hasApiKey: true, enabled: true } };
    return Response.json(body);
  });
  try {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><AdminConsole /></MemoryRouter>
    </QueryClientProvider>);
    expect(await screen.findByText("lym-chat-quality")).toBeTruthy();
    expect(screen.getByText("MaaS · 服务端配置")).toBeTruthy();
    expect(screen.getByText(/尚不能据此判断模型可调用/)).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("button", { name: "查看已保存密钥" })).toBeNull();
    expect(screen.queryByText("模型连接配置")).toBeNull();
    expect(screen.queryByText("should-not-display-provider-mask")).toBeNull();
    expect(screen.getByRole("link", { name: "查看 MaaS 模型列表" })).toHaveAttribute("href", "https://maas.lifeyoume.icu/#view=models");
  } finally { fetchMock.mockRestore(); }
});

it("mode-specific query identity prevents old provider data surviving a legacy-to-MaaS switch", async () => {
  let maas = false;
  let release: (() => void) | undefined;
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
    if (String(input).endsWith("/session")) return Response.json({
      admin: { email: "test@example.invalid" }, modelProviderMode: maas ? "maas" : "legacy"
    });
    if (maas) await new Promise<void>(resolve => { release = resolve; });
    return Response.json({ configuration: {
      provider: maas ? "maas" : "custom", modelId: maas ? "active-alias" : "legacy-id",
      apiKeyMasked: "legacy-mask", enabled: true, source: "database",
      baseUrl: "https://gateway.test/v1", thinkingEnabled: true, timeoutMs: 120000, temperature: .35
    } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    render(<QueryClientProvider client={client}><MemoryRouter><AdminConsole /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText("legacy-id")).toBeTruthy();
    maas = true;
    await client.invalidateQueries({ queryKey: ["admin-session"] });
    await waitFor(() => expect(screen.queryByText("legacy-id")).toBeNull());
    expect(screen.queryByText("legacy-mask")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    await waitFor(() => expect(release).toBeTruthy());
    release!();
    expect(await screen.findByText("active-alias")).toBeTruthy();
  } finally { release?.(); fetchMock.mockRestore(); }
});

it("reveals a saved key only after confirmation and clears it on window blur", async () => {
  useAppStore.getState().setLocale("zh-CN");
  const secret = "test-only-secret-never-real";
  const previousFetch = global.fetch;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    const body = path.endsWith("/session") ? { admin: { email: "test@example.invalid" } }
      : path.endsWith("/reveal-key") ? { apiKey: secret }
        : { configuration: { provider: "custom", modelId: "test-model", baseUrl: "https://example.invalid/v1", apiKeyMasked: "test••••real", hasApiKey: true, enabled: true, thinkingEnabled: true, timeoutMs: 120000, temperature: .35, source: "database" } };
    return new Response(JSON.stringify(body), { status: 200 });
  });
  global.fetch = fetchMock;
  try {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><AdminConsole /></MemoryRouter>
    </QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "查看已保存密钥" }));
    expect(screen.getByRole("link", { name: "打开 MaaS 应用与凭证" }).getAttribute("href"))
      .toBe("https://maas.lifeyoume.icu/#view=apps");
    expect(screen.getByText(/当前仍使用本地模型配置/)).toBeTruthy();
    expect(screen.queryByText(secret)).toBeNull();
    expect(fetchMock.mock.calls.some(([path]) => String(path).endsWith("/reveal-key"))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "确认查看，30 秒后隐藏" }));
    expect(await screen.findByText(secret)).toBeTruthy();
    fireEvent(window, new Event("blur"));
    expect(screen.queryByText(secret)).toBeNull();
  } finally {
    global.fetch = previousFetch;
  }
});

it("shows a localized model configuration failure and successfully retries", async () => {
  useAppStore.getState().setLocale("en");
  let attempts = 0;
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
    if (String(input).endsWith("/session")) return new Response(JSON.stringify({ admin: { email: "test@example.invalid" } }));
    attempts++;
    if (attempts === 1) return new Response(JSON.stringify({ error: "model_timeout", message: "内部中文错误" }), { status: 503 });
    return new Response(JSON.stringify({ configuration: {
      modelId: "retried-model", source: "database", enabled: false, provider: "custom",
      baseUrl: "https://example.invalid/v1", thinkingEnabled: true, timeoutMs: 120000, temperature: .35
    } }));
  });
  try {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><AdminConsole /></MemoryRouter>
    </QueryClientProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Model request timed out");
    expect(screen.queryByText("内部中文错误")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("retried-model")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(attempts).toBe(2);
  } finally {
    fetchMock.mockRestore();
    useAppStore.getState().setLocale("zh-CN");
  }
});
