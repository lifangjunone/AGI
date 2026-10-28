import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { AdminConsole } from "./Admin";

it("reveals a saved key only after confirmation and clears it on window blur", async () => {
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
