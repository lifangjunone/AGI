import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { OrganizationReception } from "./OrganizationReception";

function show() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <OrganizationReception id="org" name="Acceptance company" locale="en" />
  </QueryClientProvider>);
}

it("is collapsed by default and requires confirmation before saving with explicit feedback", async () => {
  const writes: unknown[] = [];
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    if (init?.method === "PUT") {
      writes.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ mode: "agent" }));
    }
    return new Response(JSON.stringify({ mode: "human" }));
  });
  try {
    show();
    const summary = screen.getByText(/Default reception for new inquiries/);
    expect(summary.closest("details")).not.toHaveAttribute("open");
    fireEvent.click(summary);
    fireEvent.click(await screen.findByRole("button", { name: "Use Agent reception" }));
    expect(writes).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(writes).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Use Agent reception" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm new-inquiry authorization" }));
    expect(await screen.findByText("Saved. Applies only to future inquiries.")).toBeTruthy();
    expect(writes).toEqual([{ mode: "agent", confirmation: "authorize-new-customer-reception" }]);
    expect(screen.getByRole("button", { name: "Use human reception for new inquiries" })).toBeEnabled();
  } finally { fetch.mockRestore(); }
});

it("retains confirmation after a failed save and supports retry without a success claim", async () => {
  let attempts = 0;
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    if (init?.method === "PUT") {
      attempts++;
      return new Response("unavailable", { status: 503 });
    }
    return new Response(JSON.stringify({ mode: "human" }));
  });
  try {
    show();
    fireEvent.click(screen.getByText(/Default reception for new inquiries/));
    fireEvent.click(await screen.findByRole("button", { name: "Use Agent reception" }));
    const confirm = screen.getByRole("button", { name: "Confirm new-inquiry authorization" });
    fireEvent.click(confirm);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save. Please retry.");
    expect(confirm).toBeEnabled();
    expect(screen.queryByText(/Saved. Applies only/)).toBeNull();
    fireEvent.click(confirm);
    await waitFor(() => expect(attempts).toBe(2));
  } finally { fetch.mockRestore(); }
});
