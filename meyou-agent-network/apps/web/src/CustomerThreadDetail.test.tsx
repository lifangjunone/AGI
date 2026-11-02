import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CustomerThreadDetail } from "./CustomerThreadDetail";
describe("customer thread detail", () => {
  it("shows real detail and preserves a note when saving fails", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) =>
      init?.method === "PATCH" ? new Response("failed", { status: 503 })
        : String(url).includes("/messages?") ? new Response(JSON.stringify({ thread: { subject: "A real inquiry", status: "active" }, messages: [] }))
        : new Response(JSON.stringify({ thread: {
          id: "thread", organizationName: "Test organization", customerName: "Customer",
          subject: "A real inquiry", status: "waiting_human", priority: "normal",
          assigneeName: null, internalNotes: ["Previous internal note"], updatedAt: new Date().toISOString(),
          agentRevision: 2, agentTasks: [{ id: "task", state: "failed", outcome: "no_sources", authorityRevision: 1, updatedAt: new Date().toISOString() }]
        } })));
    try {
      render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CustomerThreadDetail id="thread" locale="en" />
      </QueryClientProvider>);
      expect(await screen.findByText("A real inquiry")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Take over" })).toBeEnabled();
      expect(screen.getByRole("complementary", { name: "Reception management" })).toContainElement(screen.getByRole("button", { name: "Take over" }));
      expect(screen.getByRole("region", { name: "Conversation workspace" })).toContainElement(screen.getByRole("region", { name: "Customer conversation" }));
      expect(screen.getByText("Agent execution & handoff log").closest("details")).not.toHaveAttribute("open");
      expect(screen.getByText("No active knowledge sources. Add organization knowledge.")).toBeTruthy();
      expect(screen.getByText(/Earlier permission/)).toBeTruthy();
      const management = screen.getByText("Internal management & notes");
      expect(management.closest("details")).not.toHaveAttribute("open");
      fireEvent.click(management);
      const input = screen.getByLabelText("Add internal note");
      fireEvent.change(input, { target: { value: "Keep my note" } });
      fireEvent.click(screen.getByRole("button", { name: "Save note" }));
      expect(await screen.findByText(/Could not save/)).toBeTruthy();
      expect(input).toHaveValue("Keep my note");
      expect(screen.getByText(/Agent replies require authorization and reception readiness/)).toBeTruthy();
    } finally { fetchMock.mockRestore(); }
  });
});
