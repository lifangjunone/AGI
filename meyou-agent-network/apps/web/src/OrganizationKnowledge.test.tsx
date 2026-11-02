import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OrganizationKnowledge } from "./OrganizationKnowledge";
function mount() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <OrganizationKnowledge organizations={[{ id: "org", name: "Test organization" }]} locale="en" />
  </QueryClientProvider>);
}
describe("knowledge management experience", () => {
  it("loads older documents without replacing the first page", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async url => {
      const older = String(url).includes("before=older-cursor");
      return new Response(JSON.stringify({
        documents: [{ id: older ? "older" : "newer", title: older ? "Earlier policy" : "Current policy",
          active: true, revision: "2026-10-30T00:00:00Z", updatedAt: "2026-10-30T00:00:00Z" }],
        nextCursor: older ? null : "older-cursor"
      }));
    });
    try {
      mount();
      await screen.findByRole("button", { name: /Current policy/ });
      fireEvent.click(screen.getByRole("button", { name: "Load more documents" }));
      await screen.findByRole("button", { name: /Earlier policy/ });
      expect(screen.getByRole("button", { name: /Current policy/ })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Load more documents" })).toBeNull();
    } finally { fetchMock.mockRestore(); }
  });
  it("preserves editing content on conflict and requires confirmation before deleting", async () => {
    const document = {
      id: "doc", title: "Service policy", content: "Original", active: false,
      revision: "2026-10-30T00:00:00.000001Z", updatedAt: "2026-10-30T00:00:00Z"
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) =>
      init?.method ? new Response(JSON.stringify({ error: "knowledge_conflict" }), { status: 409 })
        : new Response(JSON.stringify(String(url).endsWith("/doc") ? { document }
          : { documents: [document], nextCursor: null })));
    try {
      mount();
      fireEvent.click(await screen.findByRole("button", { name: /Service policy/ }));
      await screen.findByLabelText("Document content");
      expect(screen.getByLabelText("Enable this document")).not.toBeChecked();
      fireEvent.change(screen.getByLabelText("Document content"), { target: { value: "My retained edit" } });
      fireEvent.click(screen.getByRole("button", { name: "Save document" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Your draft is retained");
      expect(screen.getByLabelText("Document content")).toHaveValue("My retained edit");
      expect(screen.getByRole("button", { name: "Save document" })).toBeDisabled();
      const calls = fetchMock.mock.calls.length;
      fireEvent.click(screen.getByRole("button", { name: "Delete document" }));
      expect(screen.getByRole("button", { name: "Confirm delete" })).toBeTruthy();
      expect(fetchMock.mock.calls.length).toBe(calls);
      fireEvent.click(screen.getByRole("button", { name: "Cancel deletion" }));
      expect(screen.queryByRole("button", { name: "Confirm delete" })).toBeNull();
    } finally { fetchMock.mockRestore(); }
  });
  it("creates actual documents through the API and closes the editor after success", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ documents: [] })));
    try {
      mount();
      fireEvent.click(await screen.findByRole("button", { name: "New document" }));
      fireEvent.change(screen.getByLabelText("Document title"), { target: { value: "FAQ" } });
      fireEvent.change(screen.getByLabelText("Document content"), { target: { value: "Authorized FAQ" } });
      fetchMock.mockImplementation(async (_url, init) => init?.method === "POST"
        ? new Response(JSON.stringify({ id: "created" }), { status: 201 })
        : new Response(JSON.stringify({ documents: [] })));
      fireEvent.click(screen.getByRole("button", { name: "Save document" }));
      expect(await screen.findByText("Document saved")).toBeTruthy();
      expect(screen.queryByLabelText("Document title")).toBeNull();
      expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("/org/knowledge") && init?.method === "POST")).toBe(true);
    } finally { fetchMock.mockRestore(); }
  });
});
