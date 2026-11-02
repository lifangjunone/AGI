import { describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), read: vi.fn() }));
vi.mock("./db/client.js", () => ({
  pool: { query: mock.read, connect: async () => ({ query: mock.query, release: mock.release }) }
}));
import { customerReceptionReadiness, customerUpdateSchema, getCustomerThread, updateCustomerThread } from "./customer-desk.js";
describe("customer desk ownership and updates", () => {
  it("returns bounded task outcomes only after owner-scoped thread access", async () => {
    mock.read.mockReset().mockResolvedValueOnce({ rows: [{
      id: "thread", organization_id: "org", status: "waiting_human", agent_mode: "paused",
      agent_revision: 2, created_at: new Date("2026-10-30"), updated_at: new Date("2026-10-30")
    }] }).mockResolvedValueOnce({ rows: [{
      id: "task", state: "failed", outcome: "no_sources", authorityRevision: 1
    }] });
    expect(await getCustomerThread("owner", "thread")).toMatchObject({
      agentMode: "paused", agentRevision: 2,
      agentTasks: [{ id: "task", outcome: "no_sources" }]
    });
    expect(mock.read.mock.calls[1]![0]).toContain("limit 5");
    expect(mock.read.mock.calls[1]![1]).toEqual(["thread"]);
  });
  it.each([
    { action: "resume_agent" as const, status: "agent", agent_mode: "auto", assignee_id: null },
    { action: "takeover" as const, status: "active", agent_mode: "paused", assignee_id: "owner" },
    { action: "reopen" as const, status: "active", agent_mode: "paused", assignee_id: "owner" },
    { action: "resolve" as const, status: "resolved", agent_mode: "paused", assignee_id: null }
  ])("does not rotate authority or cancel tasks when repeating $action", async target => {
    mock.query.mockReset().mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ ...target, agent_revision: 7, priority: "normal" }] })
      .mockResolvedValue({});
    expect(await updateCustomerThread("owner", "thread", { action: target.action })).toEqual({ updated: true });
    expect(mock.query).toHaveBeenCalledTimes(3);
    expect(mock.query).toHaveBeenLastCalledWith("commit");
    expect(mock.query.mock.calls.some(call => /^\s*(update|insert)\b/i.test(call[0]))).toBe(false);
  });
  it("saves a note alongside repeated resume without disrupting the active task", async () => {
    mock.query.mockReset().mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{
        organization_id: "org", status: "agent", agent_mode: "auto", agent_revision: 7,
        priority: "normal", assignee_id: null, internal_notes: []
      }] }).mockResolvedValue({});
    await updateCustomerThread("owner", "thread", { action: "resume_agent", note: "New internal note" });
    const sql = mock.query.mock.calls.map(call => call[0]).join(" ");
    expect(sql).not.toContain("agent_revision=agent_revision+1");
    expect(sql).not.toContain("update customer_agent_tasks");
    expect(mock.query.mock.calls[2]![1]).toEqual(["thread", "agent", "normal", null, '["New internal note"]']);
  });
  it("rechecks automatic business permission inside the resume transaction", async () => {
    mock.query.mockReset().mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ organization_id: "org", customer_id: "customer", status: "active" }] })
      .mockResolvedValueOnce({ rows: [{ modes: { business: "paused" } }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "document" }] })
      .mockResolvedValue({});
    await expect(updateCustomerThread("owner", "thread", { action: "resume_agent" }))
      .rejects.toThrow("customer_agent_not_ready");
    expect(mock.query).toHaveBeenLastCalledWith("rollback");
    expect(mock.query.mock.calls.map(call => call[0]).join(" ")).not.toContain("update customer_threads");
  });
  it("does not inspect model or knowledge for an unrelated customer thread", async () => {
    mock.read.mockReset().mockResolvedValue({ rows: [] });
    expect(await customerReceptionReadiness("outsider", "thread")).toBeNull();
    expect(mock.read).toHaveBeenCalledTimes(1);
    expect(mock.read.mock.calls[0]![1]).toEqual(["thread", "outsider"]);
  });
  it("rejects empty, unknown and oversized updates", () => {
    expect(customerUpdateSchema.safeParse({}).success).toBe(false);
    expect(customerUpdateSchema.safeParse({ action: "resume_agent" }).success).toBe(true);
    expect(customerUpdateSchema.safeParse({ action: "unknown" }).success).toBe(false);
    expect(customerUpdateSchema.safeParse({ note: " " }).success).toBe(false);
    expect(customerUpdateSchema.safeParse({ note: "x".repeat(2001) }).success).toBe(false);
  });
  it("scopes reads to the organization owner", async () => {
    mock.read.mockResolvedValue({ rows: [] });
    expect(await getCustomerThread("outsider", "thread")).toBeNull();
    expect(mock.read).toHaveBeenCalledWith(expect.stringContaining("o.owner_id=$2"), ["thread", "outsider"]);
  });
  it("denies updates before mutating threads belonging to another organization", async () => {
    mock.query.mockReset().mockResolvedValue({ rows: [] });
    expect(await updateCustomerThread("outsider", "thread", { action: "resolve" })).toBeNull();
    expect(mock.query.mock.calls.map(call => call[0])).not.toContain(expect.stringContaining("update customer_threads"));
    expect(mock.query).toHaveBeenLastCalledWith("rollback");
  });
  it("locks the real thread and commits takeover, note and audit together", async () => {
    mock.query.mockReset().mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{
        organization_id: "org", status: "waiting_human", priority: "normal",
        assignee_id: null, internal_notes: ["earlier"]
      }] });
    expect(await updateCustomerThread("owner", "thread", { action: "takeover", note: "new" })).toEqual({ updated: true });
    expect(mock.query.mock.calls[1]![0]).toContain("for update of t");
    expect(mock.query.mock.calls[2]![1]).toEqual(["thread", "active", "normal", "owner", '["earlier","new"]']);
    expect(mock.query).toHaveBeenLastCalledWith("commit");
  });
});
