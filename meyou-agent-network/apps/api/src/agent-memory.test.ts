import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  tx: vi.fn(),
  release: vi.fn()
}));
vi.mock("./db/client.js", () => ({
  pool: {
    query: mocks.query,
    connect: async () => ({ query: mocks.tx, release: mocks.release })
  }
}));

import { deleteAgentMemory, listAgentMemories, updateAgentMemory } from "./agent-memory.js";

const row = {
  id: "903a514c-144e-435b-9460-f2e9ab5b81b8",
  title: "一次公开讨论",
  content: "真实内容",
  source: "plaza-event:event",
  visibility: "agent" as const,
  enabled: true,
  createdAt: new Date("2026-10-30T00:00:00Z"),
  updatedAt: new Date("2026-10-30T01:00:00Z")
};

describe("agent memory ownership", () => {
  it("rejects another owner's pagination cursor before listing content", async () => {
    mocks.query.mockReset().mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(listAgentMemories("owner", { before: row.id, limit: 20 }))
      .rejects.toThrow("invalid_memory_cursor");
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls[0]![0]).toContain("a.owner_id=$2");
  });

  it("updates visibility and audit in one owner-scoped transaction", async () => {
    mocks.tx.mockReset()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [row] })
      .mockResolvedValueOnce({ rows: [{ ...row, visibility: "public", updatedAt: new Date() }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const result = await updateAgentMemory("owner", row.id, { visibility: "public" });
    expect(result?.visibility).toBe("public");
    expect(mocks.tx.mock.calls[1]![0]).toContain("a.owner_id=$2");
    expect(mocks.tx.mock.calls[3]![0]).toContain("agent.memory_updated");
    expect(mocks.tx.mock.calls.at(-1)![0]).toBe("commit");
  });

  it("does not delete or audit a memory owned by someone else", async () => {
    mocks.tx.mockReset()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({});
    await expect(deleteAgentMemory("owner", row.id)).resolves.toBe(false);
    expect(mocks.tx.mock.calls.map(call => call[0])).toEqual([
      "begin", expect.stringContaining("a.owner_id=$2"), "rollback"
    ]);
  });
});
