import { describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ query: vi.fn(), read: vi.fn(), release: vi.fn() }));
vi.mock("./db/client.js", () => ({
  pool: { query: mock.read, connect: async () => ({ query: mock.query, release: mock.release }) }
}));
import { checkKnowledgeSources, knowledgeSourceCheckSchema, knowledgeCreateSchema, knowledgeListSchema, knowledgeUpdateSchema, listOrganizationKnowledge, mutateOrganizationKnowledge } from "./organization-knowledge.js";
describe("organization knowledge", () => {
  it("checks active source versions without returning document bodies", async () => {
    mock.read.mockReset().mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "doc", revision: "new" }] });
    expect(await checkKnowledgeSources("owner", "org", [{ documentId: "doc", revision: "old" }]))
      .toEqual({ valid: false });
    expect(mock.read.mock.calls[1]![0]).toContain("active=true");
    expect(mock.read.mock.calls[1]![0]).not.toContain("content");
    expect(knowledgeSourceCheckSchema.safeParse({ sources: [] }).success).toBe(false);
  });
  it("denies source validation for another organization", async () => {
    mock.read.mockReset().mockResolvedValue({ rowCount: 0 });
    expect(await checkKnowledgeSources("outsider", "org", [{ documentId: "doc", revision: "old" }])).toBeNull();
    expect(mock.read).toHaveBeenCalledTimes(1);
  });
  it("paginates summaries without transmitting document bodies", async () => {
    mock.read.mockReset().mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "a" }, { id: "b" }, { id: "c" }] });
    expect(await listOrganizationKnowledge("owner", "org", { limit: 2 })).toEqual({
      documents: [{ id: "a" }, { id: "b" }], nextCursor: "b"
    });
    expect(mock.read.mock.calls[1]![0]).not.toContain("content");
    expect(mock.read.mock.calls[1]![0]).toContain("order by created_at desc,id desc");
    expect(knowledgeListSchema.safeParse({ limit: 101 }).success).toBe(false);
  });
  it("rejects a cursor from another organization before reading the next page", async () => {
    mock.read.mockReset().mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 0 });
    await expect(listOrganizationKnowledge("owner", "org", {
      limit: 30, before: "903a514c-144e-435b-9460-f2e9ab5b81b8"
    })).rejects.toThrow("invalid_knowledge_cursor");
    expect(mock.read).toHaveBeenCalledTimes(2);
  });
  it("requires a title, content and an explicit revision for edits", () => {
    expect(knowledgeCreateSchema.safeParse({ title: " ", content: "body" }).success).toBe(false);
    expect(knowledgeCreateSchema.safeParse({ title: "title", content: "x".repeat(50001) }).success).toBe(false);
    expect(knowledgeUpdateSchema.safeParse({ active: false }).success).toBe(false);
    expect(knowledgeUpdateSchema.safeParse({ revision: "2026-10-30T00:00:00Z" }).success).toBe(false);
  });
  it("denies list and mutation before reading private document contents", async () => {
    mock.read.mockReset().mockResolvedValue({ rowCount: 0 });
    expect(await listOrganizationKnowledge("outsider", "org")).toBeNull();
    expect(mock.read).toHaveBeenCalledTimes(1);
    mock.query.mockReset().mockResolvedValue({ rowCount: 0 });
    expect(await mutateOrganizationKnowledge("outsider", "org", {
      kind: "create", input: { title: "test", content: "body", active: true }
    })).toBeNull();
    expect(mock.query.mock.calls.map(call => call[0]).join(" ")).not.toContain("insert into knowledge_documents");
  });
  it("rejects a stale revision without changing or deleting a document", async () => {
    mock.query.mockReset().mockResolvedValueOnce({}).mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ title: "original" }] })
      .mockResolvedValueOnce({ rowCount: 0 }).mockResolvedValue({});
    await expect(mutateOrganizationKnowledge("owner", "org", {
      kind: "delete", id: "document", revision: "2026-10-30T00:00:00Z"
    })).rejects.toThrow("knowledge_conflict");
    expect(mock.query).toHaveBeenLastCalledWith("rollback");
    expect(mock.query.mock.calls.map(call => call[0]).join(" ")).not.toContain("delete from");
  });
  it("commits new document and audit without putting content into the audit", async () => {
    mock.query.mockReset().mockResolvedValueOnce({}).mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "doc" }] }).mockResolvedValue({});
    expect(await mutateOrganizationKnowledge("owner", "org", {
      kind: "create", input: { title: "policy", content: "private-source-body", active: true }
    })).toEqual({ id: "doc" });
    expect(JSON.stringify(mock.query.mock.calls[3])).not.toContain("private-source-body");
    expect(mock.query).toHaveBeenLastCalledWith("commit");
  });
});
