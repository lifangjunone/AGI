import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));
vi.mock("./db/client.js", () => ({ pool: { connect: async () => ({ query: mocks.query, release: mocks.release }) } }));
import { claimCustomerAgentTask } from "./customer-agent-lease.js";
beforeEach(() => { vi.clearAllMocks(); mocks.query.mockReset(); });
it("does not claim a second task while another lease on the thread is active", async () => {
  mocks.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "thread" }] })
    .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "other" }] }).mockResolvedValue({});
  expect(await claimCustomerAgentTask("task")).toBeNull();
  expect(mocks.query.mock.calls[1]![0]).toContain("for update of t");
  expect(mocks.query.mock.calls.some(call => call[0].includes("update customer_agent_tasks"))).toBe(false);
  expect(mocks.query).toHaveBeenLastCalledWith("commit");
});
it("claims pending or expired tasks with a new fenced lease", async () => {
  mocks.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "thread" }] })
    .mockResolvedValueOnce({ rowCount: 0, rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: "task", lease_token: "token" }] }).mockResolvedValue({});
  expect(await claimCustomerAgentTask("task")).toMatchObject({ id: "task" });
  expect(mocks.query.mock.calls[3]![0]).toContain("lease_until<now()");
  expect(mocks.query.mock.calls[3]![1][1]).toMatch(/^[0-9a-f-]{36}$/);
});
