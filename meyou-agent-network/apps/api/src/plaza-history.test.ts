import { describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./db/client.js", () => ({ pool: mock }));
import { listPlazaHistory, listPlazaTopics, plazaHistoryQuery, plazaTopicQuery } from "./plaza-history.js";

const circleId = "903a514c-144e-435b-9460-f2e9ab5b81b8";
describe("plaza history boundary", () => {
  it("rejects invalid cursor IDs and excessive page sizes", () => {
    expect(plazaHistoryQuery.safeParse({ circleId, before: "sql text" }).success).toBe(false);
    expect(plazaHistoryQuery.safeParse({ circleId, limit: 101 }).success).toBe(false);
  });
  it("checks private circle access before retrieving any cursor or history", async () => {
    mock.query.mockReset().mockResolvedValue({ rowCount: 0, rows: [] });
    await expect(listPlazaHistory("user", plazaHistoryQuery.parse({ circleId }))).rejects.toThrow("circle_access_denied");
    expect(mock.query).toHaveBeenCalledTimes(1);
    expect(mock.query.mock.calls[0]![0]).toContain("memberships");
  });
  it("uses parameterized literal search and timestamp-plus-ID cursor ordering", async () => {
    mock.query.mockReset()
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [1, 2, 3].map(id => ({ id: String(id), createdAt: new Date("2026-10-30T00:00:00Z") })) });
    const result = await listPlazaHistory("user", plazaHistoryQuery.parse({
      circleId, before: circleId, q: "%_'", limit: 2, threadId: circleId
    }));
    expect(result.events).toHaveLength(2);
    expect(result.nextCursor).toBe("2");
    expect(result.hasMore).toBe(true);
    const [query, params] = mock.query.mock.calls[2]!;
    expect(query).toContain("(e.created_at,e.id) <");
    expect(query).toContain("order by e.created_at desc,e.id desc");
    expect(query).not.toContain("%_'");
    expect(params).toContain("%\\%\\_'%");
  });
  it("rejects a cursor from another circle before reading messages", async () => {
    mock.query.mockReset().mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 0 });
    await expect(listPlazaHistory("user", plazaHistoryQuery.parse({ circleId, before: circleId })))
      .rejects.toThrow("invalid_history_cursor");
    expect(mock.query).toHaveBeenCalledTimes(2);
    expect(mock.query.mock.calls[1]![1]).toEqual([circleId, circleId]);
  });
  it("protects topic titles with the same circle permission check", async () => {
    mock.query.mockReset().mockResolvedValue({ rowCount: 0 });
    await expect(listPlazaTopics("outsider", plazaTopicQuery.parse({ circleId })))
      .rejects.toThrow("circle_access_denied");
    expect(mock.query).toHaveBeenCalledTimes(1);
  });
  it("paginates topics by immutable root creation order, including ended threads", async () => {
    mock.query.mockReset().mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [1, 2, 3].map(id => ({
        rootEventId: `topic-${id}`, title: `真实话题${id}`, status: "ended",
        createdAt: new Date("2026-10-30T00:00:00Z"), updatedAt: new Date("2026-10-30T01:00:00Z")
      })) });
    const result = await listPlazaTopics("member", plazaTopicQuery.parse({ circleId, before: circleId, limit: 2 }));
    expect(result.topics).toHaveLength(2);
    expect(result.nextCursor).toBe("topic-2");
    expect(result.topics[0]!.title).toBe("真实话题1");
    expect(mock.query.mock.calls[2]![0]).toContain("order by e.created_at desc,e.id desc");
  });
});
