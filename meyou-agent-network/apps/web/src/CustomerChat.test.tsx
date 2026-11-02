import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CustomerChat } from "./CustomerChat";
describe("customer history reading", () => {
  it("retains the message displaced from the polling window instead of dropping the reading anchor", async () => {
    let refreshed = false;
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({
      thread: { subject: "Initial", status: "active" },
      messages: (refreshed ? ["b", "c"] : ["a", "b"]).map((id, index) => ({
        id, actor: "customer", content: `Message ${id}`, createdAt: `2026-10-30T00:00:0${index}Z`
      }))
    })));
    try {
      const client = new QueryClient();
      render(<QueryClientProvider client={client}><CustomerChat id="thread" audience="customer" locale="en" /></QueryClientProvider>);
      await screen.findByText("Message a");
      refreshed = true;
      await act(async () => { await client.invalidateQueries({ queryKey: ["customer-chat", "customer", "thread"] }); });
      await screen.findByText("Message c");
      expect(screen.getByText("Message a")).toBeTruthy();
      expect(screen.getAllByText("Message b")).toHaveLength(1);
    } finally { fetch.mockRestore(); }
  });
  it("labels Agent replies honestly and reveals internal sources only in the owner view", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({
      thread: { subject: "Hours", status: "agent", agentMode: "auto" },
      messages: [{ id: "agent-message", actor: "agent", content: "We open on weekdays.", createdAt: "2026-10-30T00:00:00Z",
        trace: { taskId: "task", sources: [{ documentId: "doc", quote: "Internal source quote", revision: "revision" }],
          model: { provider: "configured", model: "actual-model" } } }]
    })));
    try {
      const view = render(<QueryClientProvider client={new QueryClient()}>
        <CustomerChat id="thread" audience="customer" locale="en" />
      </QueryClientProvider>);
      expect(await screen.findByText("Organization · Agent")).toBeTruthy();
      expect(screen.queryByText("Organization · Person")).toBeNull();
      expect(screen.queryByText("Internal source quote")).toBeNull();
      view.unmount();
      render(<QueryClientProvider client={new QueryClient()}>
        <CustomerChat id="thread" audience="owner" locale="en" />
      </QueryClientProvider>);
      expect(await screen.findByText("Answer sources · Internal only")).toBeTruthy();
      expect(screen.getByText("Internal source quote")).toBeTruthy();
      expect(screen.getByText("configured / actual-model")).toBeTruthy();
    } finally { fetch.mockRestore(); }
  });
  it("loads earlier messages while retaining current messages and draft", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async url => {
      const earlier = String(url).includes("before=cursor");
      return new Response(JSON.stringify({
        thread: { subject: "Initial", status: "active" },
        messages: [{ id: earlier ? "old" : "new", actor: "human",
          content: earlier ? "Earlier message" : "Current message", createdAt: "2026-10-30T00:00:00Z" }],
        nextCursor: earlier ? null : "cursor"
      }));
    });
    try {
      render(<QueryClientProvider client={new QueryClient()}>
        <CustomerChat id="thread" audience="customer" locale="en" />
      </QueryClientProvider>);
      await screen.findByText("Current message");
      fireEvent.change(screen.getByLabelText("Continue inquiry"), { target: { value: "Draft retained" } });
      fireEvent.click(screen.getByRole("button", { name: "Load earlier messages" }));
      await screen.findByText("Earlier message");
      expect(screen.getByText("Current message")).toBeTruthy();
      expect(screen.getByRole("region", { name: "Message history, scroll to read" })).toContainElement(screen.getByText("Earlier message"));
      expect(screen.getByRole("region", { name: "Message history, scroll to read" })).toHaveAttribute("tabindex", "0");
      expect(screen.getByLabelText("Continue inquiry")).toHaveValue("Draft retained");
      expect(screen.queryByRole("button", { name: "Load earlier messages" })).toBeNull();
    } finally { fetch.mockRestore(); }
  });
});
