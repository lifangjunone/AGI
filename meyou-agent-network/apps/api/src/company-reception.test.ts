import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), read: vi.fn(), release: vi.fn() }));
vi.mock("./db/client.js", () => ({
  pool: { query: mocks.read, connect: async () => ({ query: mocks.query, release: mocks.release }) }
}));
import { companyInquirySchema, createCompanyInquiry, getPublicCompany } from "./company-reception.js";
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());
describe("company reception entry", () => {
  it("returns an existing inquiry on retry without duplicating notifications", async () => {
    mocks.query.mockReset().mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: "org", owner_id: "owner" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "thread", subject: "hello", status: "active" }] })
      .mockResolvedValue({});
    expect(await createCompanyInquiry("customer", "company", "hello", "request")).toEqual({
      id: "thread", status: "active", delivery: "delivered"
    });
    expect(mocks.query.mock.calls.map(call => call[0]).join(" ")).not.toContain("insert into");
  });
  it("rejects a reused inquiry key with changed content", async () => {
    mocks.query.mockReset().mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: "org", owner_id: "owner" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "thread", subject: "original" }] })
      .mockResolvedValue({});
    await expect(createCompanyInquiry("customer", "company", "changed", "request"))
      .rejects.toThrow("inquiry_request_conflict");
    expect(mocks.query).toHaveBeenLastCalledWith("rollback");
  });
  it("rejects empty, oversized and forged customer identity payloads", () => {
    expect(companyInquirySchema.safeParse({ content: " " }).success).toBe(false);
    expect(companyInquirySchema.safeParse({ content: "x".repeat(2001) }).success).toBe(false);
    expect(companyInquirySchema.safeParse({ content: "hello", customerId: "forged" }).success).toBe(false);
  });
  it("returns only public company fields", async () => {
    mocks.read.mockResolvedValue({ rows: [{ handle: "company", name: "Company", description: "Info", businessHours: "09:00-18:00" }] });
    expect(await getPublicCompany("company")).toEqual({
      handle: "company", name: "Company", description: "Info", businessHours: "09:00-18:00"
    });
    expect(mocks.read.mock.calls[0]![0]).not.toContain("owner_id");
  });
  it("does not create a customer thread for a nonexistent organization", async () => {
    mocks.query.mockReset().mockResolvedValue({ rows: [] });
    expect(await createCompanyInquiry("customer", "missing", "hello")).toBeNull();
    expect(mocks.query).toHaveBeenLastCalledWith("rollback");
    expect(mocks.query.mock.calls.map(call => call[0]).join(" ")).not.toContain("insert into customer_threads");
  });
  it("commits the independent customer thread, notification and audit atomically", async () => {
    mocks.query.mockReset().mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: "org", owner_id: "owner" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ display_name: "Customer" }] })
      .mockResolvedValueOnce({ rows: [{ id: "thread" }] }).mockResolvedValue({});
    expect(await createCompanyInquiry("trusted-customer", "company", "actual question")).toEqual({
      id: "thread", status: "unassigned", delivery: "delivered"
    });
    expect(mocks.query.mock.calls[3]![1]).toEqual(["org", "trusted-customer", "Customer", "actual question", null]);
    expect(mocks.query.mock.calls[4]![1]).toEqual(["owner", "actual question", "/app/customers?thread=thread", "thread"]);
    expect(mocks.query).toHaveBeenLastCalledWith("commit");
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  for (const [label, enabled, scope, online, automatic] of [
    ["authorized and online", "true", "", true, true],
    ["execution disabled", "false", "", true, false],
    ["outside invite scope", "true", "00000000-0000-4000-8000-000000000001", true, false],
    ["worker offline", "true", "", false, false]
  ] as const) {
    it(`routes new inquiries correctly: ${label}`, async () => {
      vi.stubEnv("CUSTOMER_AGENT_ENABLED", enabled);
      vi.stubEnv("CUSTOMER_AGENT_ORGANIZATIONS", scope);
      mocks.query.mockReset().mockImplementation(async (sql: string) => {
        if (sql.includes("select id,owner_id")) return { rows: [{ id: "org", owner_id: "owner", reception_mode: "agent" }] };
        if (sql.includes("select display_name")) return { rowCount: 1, rows: [{ display_name: "Customer" }] };
        if (sql.includes("insert into customer_threads")) return { rows: [{ id: "thread" }] };
        if (sql.includes("service_heartbeats")) return { rows: [{ available: online }] };
        return { rows: [], rowCount: 1 };
      });
      expect(await createCompanyInquiry("customer", "company", "hello")).toEqual({
        id: "thread", status: automatic ? "agent" : "unassigned", delivery: "delivered"
      });
      const inserts = mocks.query.mock.calls.filter(call => call[0].includes("insert into customer_agent_tasks"));
      expect(inserts).toHaveLength(automatic ? 1 : 0);
      if (automatic) expect(inserts[0]![1]).toEqual(["thread", "thread", 1]);
      expect(mocks.query).toHaveBeenLastCalledWith("commit");
    });
  }
  it("rolls back the inquiry if its authorized task cannot be saved", async () => {
    vi.stubEnv("CUSTOMER_AGENT_ENABLED", "true");
    vi.stubEnv("CUSTOMER_AGENT_ORGANIZATIONS", "");
    mocks.query.mockReset().mockImplementation(async (sql: string) => {
      if (sql.includes("select id,owner_id")) return { rows: [{ id: "org", owner_id: "owner", reception_mode: "agent" }] };
      if (sql.includes("select display_name")) return { rowCount: 1, rows: [{ display_name: "Customer" }] };
      if (sql.includes("insert into customer_threads")) return { rows: [{ id: "thread" }] };
      if (sql.includes("service_heartbeats")) return { rows: [{ available: true }] };
      if (sql.includes("insert into customer_agent_tasks")) throw new Error("task_write_failed");
      return {};
    });
    await expect(createCompanyInquiry("customer", "company", "hello")).rejects.toThrow("task_write_failed");
    expect(mocks.query).toHaveBeenLastCalledWith("rollback");
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});
