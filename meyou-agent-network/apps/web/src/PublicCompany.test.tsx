import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PublicCompany } from "./PublicCompany";
import { useAppStore } from "./store";
describe("public organization entry", () => {
  it("loads earlier inquiries, retains entries and marks the selected conversation", async () => {
    useAppStore.getState().setLocale("en");
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async url => {
      const path = String(url);
      if (path.endsWith("/session")) return new Response(JSON.stringify({ user: { name: "Customer" } }));
      if (path.includes("/company-chats?")) return new Response(JSON.stringify(
        path.includes("before=recent")
          ? { threads: [{ id: "older", subject: "Earlier inquiry", status: "resolved" }], nextCursor: null }
          : { threads: [{ id: "recent", subject: "Recent inquiry", status: "active" }], nextCursor: "recent" }));
      if (path.includes("/messages?")) return new Response(JSON.stringify({ thread: { subject: "Earlier inquiry", status: "resolved" }, messages: [] }));
      return new Response(JSON.stringify({ company: { name: "Studio", description: "Service", businessHours: "09:00-18:00" } }));
    });
    try {
      render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/company/studio"]}><Routes><Route path="/company/:handle" element={<PublicCompany />} /></Routes></MemoryRouter>
      </QueryClientProvider>);
      fireEvent.click(await screen.findByRole("button", { name: "Load earlier inquiries" }));
      const earlier = await screen.findByRole("button", { name: /Earlier inquiry/ });
      expect(earlier).toHaveTextContent("Resolved");
      expect(screen.getByRole("button", { name: /Recent inquiry/ })).toHaveTextContent("In progress");
      fireEvent.click(earlier);
      expect(earlier).toHaveAttribute("aria-pressed", "true");
      expect(screen.queryByRole("button", { name: "Load earlier inquiries" })).toBeNull();
    } finally { fetch.mockRestore(); useAppStore.getState().setLocale("zh-CN"); }
  });
  it("reuses the same inquiry request ID after a delivery failure", async () => {
    useAppStore.getState().setLocale("en");
    const submitted: string[] = [];
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (init?.method === "POST") {
        submitted.push(String(init.body));
        return new Response("unavailable", { status: 503 });
      }
      if (String(url).endsWith("/session")) return new Response(JSON.stringify({ user: { name: "Customer" } }));
      if (String(url).includes("/company-chats?")) return new Response(JSON.stringify({ threads: [] }));
      return new Response(JSON.stringify({ company: { handle: "studio", name: "Studio", description: "Service", businessHours: "09:00-18:00" } }));
    });
    try {
      render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/company/studio"]}><Routes><Route path="/company/:handle" element={<PublicCompany />} /></Routes></MemoryRouter>
      </QueryClientProvider>);
      const input = await screen.findByLabelText("Your inquiry");
      fireEvent.change(input, { target: { value: "Retry this inquiry" } });
      fireEvent.click(await screen.findByRole("button", { name: "Submit inquiry" }));
      await screen.findByRole("alert");
      expect(input).toHaveValue("Retry this inquiry");
      fireEvent.click(screen.getByRole("button", { name: "Submit inquiry" }));
      await screen.findByRole("alert");
      expect(submitted).toHaveLength(2);
      expect(submitted[0]).toBe(submitted[1]);
    } finally { fetch.mockRestore(); }
  });
  it("creates an inquiry without claiming that an Agent has replied", async () => {
    useAppStore.getState().setLocale("en");
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      if (init?.method === "POST") return new Response(JSON.stringify({ inquiry: { id: "thread", delivery: "delivered" } }), { status: 201 });
      if (String(url).includes("/company-chats?")) return new Response(JSON.stringify({ threads: [] }));
      if (String(url).includes("/messages?")) return new Response(JSON.stringify({ thread: { subject: "Question", status: "unassigned" }, messages: [] }));
      if (String(url).endsWith("/session")) return new Response(JSON.stringify({ user: { name: "Customer" } }));
      return new Response(JSON.stringify({ company: { handle: "studio", name: "Studio", description: "Service", businessHours: "09:00-18:00" } }));
    });
    try {
      render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/company/studio"]}><Routes><Route path="/company/:handle" element={<PublicCompany />} /></Routes></MemoryRouter>
      </QueryClientProvider>);
      await screen.findByText("Studio");
      fireEvent.change(screen.getByLabelText("Your inquiry"), { target: { value: "Question" } });
      fireEvent.click(await screen.findByRole("button", { name: "Submit inquiry" }));
      expect(await screen.findByText("Inquiry delivered to the organization inbox")).toBeTruthy();
      expect(screen.getByText(/View organization replies and continue below/)).toBeTruthy();
      const submitted = fetch.mock.calls.find(([, init]) => init?.method === "POST")?.[1];
      expect(JSON.parse(String(submitted?.body))).toEqual({ content: "Question", requestId: expect.any(String) });
    } finally { fetch.mockRestore(); }
  });
});
