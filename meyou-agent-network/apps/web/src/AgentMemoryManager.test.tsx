import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentMemoryManager } from "./AgentMemoryManager";

const record = {
  id: "903a514c-144e-435b-9460-f2e9ab5b81b8", title: "在创业者圈的一次讨论",
  content: "讨论了真实的产品方向。", sourceType: "plaza_event", visibility: "agent", enabled: true,
  createdAt: "2026-10-30T00:00:00.000Z", updatedAt: "2026-10-30T01:00:00.000Z"
};
describe("Agent memory controls", () => {
  it("keeps content collapsed, saves visibility, and confirms deletion", async () => {
    const requests: Array<{ path: string; method?: string; body?: Record<string, unknown> }> = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const path = String(input);
      requests.push({ path, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (path.includes("/memories?")) return new Response(JSON.stringify({ memories: [record], nextCursor: null, hasMore: false }));
      if (init?.method === "PATCH") return new Response(JSON.stringify({ memory: { ...record, visibility: "public" } }));
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return new Response("{}", { status: 404 });
    });
    try {
      render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AgentMemoryManager locale="zh-CN" />
      </QueryClientProvider>);
      expect(await screen.findByText(record.title)).toBeTruthy();
      expect(screen.getByText(record.content)).not.toBeVisible();
      fireEvent.click(screen.getByText(record.title));
      expect(screen.getByText(record.content)).toBeVisible();
      fireEvent.change(screen.getByLabelText("允许使用的范围"), { target: { value: "public" } });
      await waitFor(() => expect(requests.some(request => request.method === "PATCH" && request.body?.visibility === "public")).toBe(true));
      fireEvent.click(screen.getByRole("button", { name: "永久删除" }));
      expect(screen.getByRole("alertdialog")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "确认永久删除" }));
      await waitFor(() => expect(requests.some(request => request.method === "DELETE")).toBe(true));
    } finally { fetchMock.mockRestore(); }
  });
});
