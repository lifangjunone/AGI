import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeAnswerTest } from "./KnowledgeAnswerTest";
describe("internal knowledge answer test", () => {
  it("removes a draft when cited source validity changes and keeps the question", async () => {
    let valid = true;
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async url => new Response(JSON.stringify(
      String(url).endsWith("knowledge-source-check") ? { valid } : {
        status: "draft", answer: "Old answer", confidence: 0.9, runId: "run",
        model: { provider: "test", model: "test" },
        scope: { documentsConsidered: 1, maxDocuments: 12, maxCharactersPerDocument: 6000 },
        citations: [{ documentId: "doc", title: "Policy", quote: "Old policy", revision: "revision" }]
      })));
    try {
      render(<KnowledgeAnswerTest organizationId="org" locale="en" />);
      fireEvent.click(screen.getByText("Test knowledge answers"));
      fireEvent.change(screen.getByLabelText("Test question"), { target: { value: "My question" } });
      fireEvent.click(screen.getByRole("button", { name: "Run test" }));
      await screen.findByText("Old answer");
      await new Promise(resolve => setTimeout(resolve, 0));
      valid = false;
      fireEvent(window, new Event("focus"));
      expect(await screen.findByRole("alert")).toHaveTextContent("old draft was removed");
      expect(screen.queryByText("Old answer")).toBeNull();
      expect(screen.getByLabelText("Test question")).toHaveValue("My question");
    } finally { fetch.mockRestore(); }
  });
  it("invalidates results immediately after a local knowledge mutation", async () => {
    const view = render(<KnowledgeAnswerTest organizationId="org" locale="en" sourceGeneration={0} />);
    fireEvent.click(screen.getByText("Test knowledge answers"));
    fireEvent.change(screen.getByLabelText("Test question"), { target: { value: "Retained" } });
    view.rerender(<KnowledgeAnswerTest organizationId="org" locale="en" sourceGeneration={1} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("previous test result was removed");
    expect(screen.getByLabelText("Test question")).toHaveValue("Retained");
  });
  it("explains missing sources without displaying an answer", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      status: "needs_human", reason: "no_sources"
    })));
    try {
      render(<KnowledgeAnswerTest organizationId="org" locale="en" />);
      fireEvent.click(screen.getByText("Test knowledge answers"));
      fireEvent.change(screen.getByLabelText("Test question"), { target: { value: "Hours?" } });
      fireEvent.click(screen.getByRole("button", { name: "Run test" }));
      expect(await screen.findByText(/No active source documents/)).toBeTruthy();
      expect(screen.queryByText("Internal test draft · Not sent")).toBeNull();
    } finally { fetch.mockRestore(); }
  });
  it("shows a draft with real citations and no customer send action", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async url => new Response(JSON.stringify(
      String(url).endsWith("knowledge-source-check") ? { valid: true } : {
      status: "draft", answer: "Open weekdays.", confidence: 0.9, runId: "test-run",
      model: { provider: "configured", model: "real-model" },
      scope: { documentsConsidered: 1, maxDocuments: 12, maxCharactersPerDocument: 6000 },
      citations: [{ documentId: "doc", title: "Hours", quote: "Monday to Friday", revision: "revision" }]
    })));
    try {
      render(<KnowledgeAnswerTest organizationId="org" locale="en" />);
      fireEvent.click(screen.getByText("Test knowledge answers"));
      fireEvent.change(screen.getByLabelText("Test question"), { target: { value: "Hours?" } });
      fireEvent.click(screen.getByRole("button", { name: "Run test" }));
      expect(await screen.findByText("Internal test draft · Not sent")).toBeTruthy();
      expect(screen.getByText("Monday to Friday")).toBeTruthy();
      expect(screen.getByText(/configured \/ real-model/)).toBeTruthy();
      expect(screen.queryByRole("button", { name: /send/i })).toBeNull();
      expect(fetch.mock.calls[0]![1]?.body).toBe(JSON.stringify({ question: "Hours?", locale: "en" }));
    } finally { fetch.mockRestore(); }
  });
  it("preserves the question after a failed request without showing a fake answer", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("failed", { status: 503 }));
    try {
      render(<KnowledgeAnswerTest organizationId="org" locale="en" />);
      fireEvent.click(screen.getByText("Test knowledge answers"));
      fireEvent.change(screen.getByLabelText("Test question"), { target: { value: "Retained question" } });
      fireEvent.click(screen.getByRole("button", { name: "Run test" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Your question is retained");
      expect(screen.getByLabelText("Test question")).toHaveValue("Retained question");
      expect(screen.queryByText("Internal test draft · Not sent")).toBeNull();
    } finally { fetch.mockRestore(); }
  });
});
