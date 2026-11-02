import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  query: vi.fn(), current: vi.fn(), complete: vi.fn(), reserve: vi.fn(),
  transactionQuery: vi.fn(), release: vi.fn()
}));
vi.mock("./db/client.js", () => ({
  pool: { query: mocks.query, connect: async () => ({ query: mocks.transactionQuery, release: mocks.release }) }
}));
vi.mock("./plaza-budget.js", () => ({ reservePlazaCall: mocks.reserve }));
vi.mock("./model.js", async original => ({
  ...await original<typeof import("./model.js")>(),
  modelProvider: { completeDetailed: mocks.complete },
  resolveModelConfiguration: async () => ({ apiKey: "unit-test-only", modelId: "configured" }),
  assertModelExecutionCurrent: mocks.current
}));
import { testKnowledgeAnswer, validateKnowledgeAnswer } from "./knowledge-answer.js";
const id = "903a514c-144e-435b-9460-f2e9ab5b81b8";
const source = { id, title: "Opening hours", content: "Open Monday to Friday, 09:00–18:00.", revision: "version" };
const valid = { answer: "Open weekdays.", confidence: 0.95, needsHuman: false,
  citations: [{ documentId: id, quote: "Monday to Friday" }] };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.reserve.mockResolvedValue("reserved");
  mocks.current.mockResolvedValue(undefined);
  mocks.complete.mockResolvedValue({ content: JSON.stringify(valid), provider: "configured", model: "actual", source: "database" });
  mocks.transactionQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});
describe("source-grounded internal answer tests", () => {
  it("withholds low-confidence content rather than returning it as a usable draft", async () => {
    mocks.query.mockReset().mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rows: [source] }).mockResolvedValue({});
    mocks.complete.mockResolvedValueOnce({ content: JSON.stringify({ ...valid, confidence: 0.4 }),
      provider: "configured", model: "actual", source: "database" });
    expect(await testKnowledgeAnswer("owner", "org", { question: "Hours?", locale: "en" }))
      .toEqual({ status: "needs_human", reason: "human_review" });
    expect(mocks.transactionQuery).not.toHaveBeenCalled();
  });
  it("rejects nonexistent citations and fabricated quotes", () => {
    expect(validateKnowledgeAnswer(JSON.stringify(valid), [source])).toEqual(valid);
    expect(() => validateKnowledgeAnswer(JSON.stringify(valid), [])).toThrow("knowledge_invalid_citation");
    expect(() => validateKnowledgeAnswer(JSON.stringify({ ...valid,
      citations: [{ documentId: id, quote: "Open on Sunday" }] }), [source])).toThrow("knowledge_invalid_citation");
  });
  it("rejects non-owner access without model execution", async () => {
    mocks.query.mockReset().mockResolvedValue({ rowCount: 0 });
    expect(await testKnowledgeAnswer("outsider", "org", { question: "Hours?", locale: "en" })).toBeNull();
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("does not call the model without active sources or for high-risk questions", async () => {
    mocks.query.mockReset().mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rows: [] });
    expect(await testKnowledgeAnswer("owner", "org", { question: "Hours?", locale: "en" }))
      .toEqual({ status: "needs_human", reason: "no_sources" });
    mocks.query.mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rows: [source] });
    expect(await testKnowledgeAnswer("owner", "org", { question: "Guarantee my refund", locale: "en" }))
      .toEqual({ status: "needs_human", reason: "high_risk" });
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("does not execute a model beyond quota", async () => {
    mocks.query.mockReset().mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rows: [source] });
    mocks.reserve.mockResolvedValueOnce("exhausted");
    expect(await testKnowledgeAnswer("owner", "org", { question: "Hours?", locale: "en" }))
      .toEqual({ status: "needs_human", reason: "quota_unavailable" });
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it("does not release a draft if a source was disabled during generation", async () => {
    mocks.query.mockReset().mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rows: [source] });
    mocks.transactionQuery.mockResolvedValueOnce({}).mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValue({});
    expect(await testKnowledgeAnswer("owner", "org", { question: "Hours?", locale: "en" }))
      .toEqual({ status: "needs_human", reason: "sources_changed" });
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("rollback");
  });
  it("returns an internal draft with real source revisions and provider metadata", async () => {
    mocks.query.mockReset().mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rows: [source] });
    mocks.transactionQuery.mockResolvedValueOnce({}).mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id, revision: "version" }] }).mockResolvedValue({});
    const result = await testKnowledgeAnswer("owner", "org", { question: "Hours?", locale: "en" });
    expect(result).toMatchObject({ status: "draft", answer: valid.answer,
      citations: [{ documentId: id, title: "Opening hours", revision: "version" }],
      model: { provider: "configured", model: "actual" } });
    expect(mocks.transactionQuery).toHaveBeenLastCalledWith("commit");
  });
});
