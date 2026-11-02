import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CustomerReceptionReadiness } from "./CustomerReceptionReadiness";

it("explains missing requirements without offering a nonfunctional enable button", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({
    ready: false, checks: { customerChannel: true, threadOpen: true, businessPermission: false,
      activeKnowledge: false, modelConfigured: true, quotaAvailable: true, executionEnabled: false }
  })));
  try {
    render(<QueryClientProvider client={new QueryClient()}>
      <CustomerReceptionReadiness id="thread" locale="en" />
    </QueryClientProvider>);
    fireEvent.click(screen.getByText("Agent reception requirements"));
    await screen.findByText("My Agent permits automatic business replies");
    expect(screen.getAllByText("Not ready")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /Enable/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(fetch.mock.calls.length).toBeGreaterThan(1);
  } finally { fetch.mockRestore(); }
});

it("requires explicit confirmation before authorizing a ready conversation", async () => {
  const requests: unknown[] = [];
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    if (init?.method === "PATCH") {
      requests.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ updated: true }));
    }
    return new Response(JSON.stringify({
      ready: true, checks: { customerChannel: true, threadOpen: true, businessPermission: true,
        activeKnowledge: true, modelConfigured: true, quotaAvailable: true, executionEnabled: true }
    }));
  });
  try {
    render(<QueryClientProvider client={new QueryClient()}>
      <CustomerReceptionReadiness id="thread" locale="en" />
    </QueryClientProvider>);
    fireEvent.click(screen.getByText("Agent reception requirements"));
    fireEvent.click(await screen.findByRole("button", { name: "Authorize Agent reception" }));
    expect(requests).toHaveLength(0);
    expect(screen.getByText(/Real model calls consume reply quota/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(requests).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Authorize Agent reception" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm authorization" }));
    expect(await screen.findByText(/Agent reception authorized for this conversation/)).toBeTruthy();
    expect(requests).toEqual([{ action: "resume_agent" }]);
  } finally { fetch.mockRestore(); }
});
