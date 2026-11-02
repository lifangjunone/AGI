import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), read: vi.fn(), release: vi.fn() }));
vi.mock("./db/client.js", () => ({
  pool: { query: mocks.read, connect: async () => ({ query: mocks.query, release: mocks.release }) }
}));
import { customerDirectorySchema, customerHistorySchema, customerMessageSchema, listCustomerChats, readCustomerChat, sendCustomerChat } from "./customer-chat.js";
describe("customer chat boundary", () => {
  it("returns internal citations only to the authorized organization owner", async () => {
    mocks.read.mockReset().mockResolvedValueOnce({ rows: [{ id: "thread", agent_mode: "auto" }] })
      .mockResolvedValueOnce({ rows: [{ id: "message", actor: "agent" }] })
      .mockResolvedValueOnce({ rows: [{ taskId: "task", messageId: "message", sources: [{ quote: "Internal source" }], model: { model: "configured" } }] });
    const owner = await readCustomerChat("owner", "thread", "owner");
    expect(owner?.messages[0].trace.sources[0].quote).toBe("Internal source");
    expect(owner?.thread.agentMode).toBe("auto");
    mocks.read.mockReset().mockResolvedValueOnce({ rows: [{ id: "thread" }] })
      .mockResolvedValueOnce({ rows: [{ id: "message", actor: "agent" }] });
    const customer = await readCustomerChat("customer", "thread", "customer");
    expect(customer?.messages[0].trace).toBeUndefined();
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });
  it("paginates the directory without leaking other customers and validates cursor ownership", async () => {
    expect(customerDirectorySchema.safeParse({ handle: "company", before: "invalid" }).success).toBe(false);
    expect(customerDirectorySchema.safeParse({ handle: "company", limit: 101 }).success).toBe(false);
    mocks.read.mockReset().mockResolvedValueOnce({ rows: [{ id: "new" }, { id: "middle" }, { id: "old" }] });
    expect(await listCustomerChats("customer", "company", { limit: 2 }))
      .toEqual({ threads: [{ id: "new" }, { id: "middle" }], nextCursor: "middle" });
    expect(mocks.read.mock.calls[0]![1]).toEqual(["customer", "company", 3]);
    expect(mocks.read.mock.calls[0]![0]).toContain("order by t.created_at desc");
    mocks.read.mockReset().mockResolvedValueOnce({ rowCount: 0 });
    await expect(listCustomerChats("customer", "company", { limit: 20, before: "foreign" }))
      .rejects.toThrow("invalid_customer_cursor");
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(mocks.read.mock.calls[0]![1]).toEqual(["foreign", "customer", "company"]);
  });
  it("validates pagination and rejects a cursor belonging to another thread", async () => {
    expect(customerHistorySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(customerHistorySchema.safeParse({ before: "invalid" }).success).toBe(false);
    mocks.read.mockReset().mockResolvedValueOnce({ rows: [{ id: "thread" }] })
      .mockResolvedValueOnce({ rowCount: 0 });
    await expect(readCustomerChat("customer", "thread", "customer", {
      limit: 40, before: "903a514c-144e-435b-9460-f2e9ab5b81b8"
    })).rejects.toThrow("invalid_customer_cursor");
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });
  it("returns chronological pages with an older-record cursor", async () => {
    mocks.read.mockReset().mockResolvedValueOnce({ rows: [{ id: "thread" }] })
      .mockResolvedValueOnce({ rows: [{ id: "new" }, { id: "middle" }, { id: "old" }] });
    expect(await readCustomerChat("customer", "thread", "customer", { limit: 2 }))
      .toMatchObject({ messages: [{ id: "middle" }, { id: "new" }], nextCursor: "middle" });
  });
  it("reads forward chronologically and returns a forward-only continuation", async () => {
    const after = "903a514c-144e-435b-9460-f2e9ab5b81b8";
    expect(customerHistorySchema.safeParse({ before: after, after }).success).toBe(false);
    mocks.read.mockReset().mockResolvedValueOnce({ rows: [{ id: "thread" }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "one" }, { id: "two" }, { id: "three" }] });
    expect(await readCustomerChat("customer", "thread", "customer", { limit: 2, after }))
      .toMatchObject({ messages: [{ id: "one" }, { id: "two" }], nextCursor: null, nextAfterCursor: "two" });
    expect(mocks.read.mock.calls[2]![0]).toContain("order by created_at asc,id asc");
    expect(mocks.read.mock.calls[2]![0]).toContain("(created_at,id) >");
    expect(mocks.read.mock.calls[1]![1]).toEqual([after, "thread"]);
  });
  it("rejects a foreign forward cursor before reading messages", async () => {
    mocks.read.mockReset().mockResolvedValueOnce({ rows: [{ id: "thread" }] })
      .mockResolvedValueOnce({ rowCount: 0 });
    await expect(readCustomerChat("owner", "thread", "owner", {
      limit: 40, after: "903a514c-144e-435b-9460-f2e9ab5b81b8"
    })).rejects.toThrow("invalid_customer_cursor");
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });
  it("requires an idempotency key and rejects actor injection", () => {
    expect(customerMessageSchema.safeParse({ content: "hello" }).success).toBe(false);
    expect(customerMessageSchema.safeParse({ content: "hello", requestId: "invalid" }).success).toBe(false);
    expect(customerMessageSchema.safeParse({ content: "hello", requestId: "903a514c-144e-435b-9460-f2e9ab5b81b8", actor: "agent" }).success).toBe(false);
  });
  it("denies unrelated customers before reading message content", async () => {
    mocks.read.mockReset().mockResolvedValue({ rows: [] });
    expect(await readCustomerChat("outsider", "thread", "customer")).toBeNull();
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(mocks.read.mock.calls[0]![0]).toContain("t.customer_id=$2");
  });
  it("does not insert twice when the same request is retried", async () => {
    mocks.query.mockReset().mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ customer_id: "customer", status: "active" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "existing", content: "hello" }] })
      .mockResolvedValue({});
    expect(await sendCustomerChat("customer", "thread", "customer", { content: "hello", requestId: "request" }))
      .toEqual({ id: "existing", delivery: "delivered", duplicate: true });
    expect(mocks.query.mock.calls.map(call => call[0]).join(" ")).not.toContain("insert into");
  });
  it("rejects reuse of an idempotency key for a different message", async () => {
    mocks.query.mockReset().mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ customer_id: "customer", status: "active" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "existing", content: "original" }] })
      .mockResolvedValue({});
    await expect(sendCustomerChat("customer", "thread", "customer", { content: "changed", requestId: "request" }))
      .rejects.toThrow("message_request_conflict");
    expect(mocks.query).toHaveBeenLastCalledWith("rollback");
  });
  it("rejects new messages on resolved threads", async () => {
    mocks.query.mockReset().mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ customer_id: "customer", status: "resolved" }] })
      .mockResolvedValueOnce({ rowCount: 0 }).mockResolvedValue({});
    await expect(sendCustomerChat("customer", "thread", "customer", { content: "hello", requestId: "request" }))
      .rejects.toThrow("customer_thread_resolved");
  });
});
