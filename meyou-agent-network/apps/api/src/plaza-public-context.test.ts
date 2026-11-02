import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("./db/client.js", () => ({ pool: { query } }));

import { loadPublicPlazaMemories } from "./plaza-public-context.js";

describe("public plaza model context", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("uses canonical current-circle events instead of editable private memory bodies", async () => {
    query.mockResolvedValueOnce({
      rows: [{
        kind: "verified_current_circle_event",
        title: "此前在当前圈子的公开发言",
        content: "数据库中的公开事件原文",
        occurredAt: new Date("2026-10-30T01:00:00Z")
      }]
    });

    await expect(loadPublicPlazaMemories({
      agentId: "agent", ownerId: "owner", circleId: "circle", limit: 8
    })).resolves.toEqual([expect.objectContaining({
      kind: "verified_current_circle_event",
      content: "数据库中的公开事件原文",
      occurredAt: "2026-10-30T01:00:00.000Z"
    })]);

    const [statement, values] = query.mock.calls[0]!;
    expect(statement).toContain("m.visibility='public'");
    expect(statement).toContain("m.source not like 'plaza-event:%'");
    expect(statement).toContain("m.source='plaza-event:' || e.id::text");
    expect(statement).toContain("m.enabled=true");
    expect(statement).toContain("m.visibility<>'never'");
    expect(statement).toContain("e.circle_id=$2");
    expect(statement).toContain("e.user_id=$3");
    expect(statement).toContain("e.metadata->>'public'='true'");
    expect(statement).not.toContain("select 'verified_current_circle_event'::text as kind,m.title,m.content");
    expect(values).toEqual(["agent", "circle", "owner", 8]);
  });

  it("bounds the public-context query size", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await loadPublicPlazaMemories({
      agentId: "agent", ownerId: "owner", circleId: "circle", limit: 10_000
    });
    expect(query.mock.calls[0]![1]).toEqual(["agent", "circle", "owner", 20]);
  });
});
