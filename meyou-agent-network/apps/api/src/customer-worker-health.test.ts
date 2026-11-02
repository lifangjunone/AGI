import { afterEach, expect, it, vi } from "vitest";
const query = vi.hoisted(() => vi.fn());
vi.mock("./db/client.js", () => ({ pool: { query } }));
import { customerWorkerAvailable, recordCustomerWorkerHeartbeat } from "./customer-worker-health.js";
afterEach(() => { vi.unstubAllEnvs(); query.mockReset(); });
it("does not call the datastore when execution is disabled", async () => {
  vi.stubEnv("CUSTOMER_AGENT_ENABLED", "false");
  expect(await customerWorkerAvailable()).toBe(false);
  expect(query).not.toHaveBeenCalled();
});
it("requires recent authoritative liveness, not only the feature flag", async () => {
  vi.stubEnv("CUSTOMER_AGENT_ENABLED", "true");
  query.mockResolvedValueOnce({ rows: [{ available: false }] });
  expect(await customerWorkerAvailable()).toBe(false);
  query.mockResolvedValueOnce({ rows: [{ available: true }] });
  expect(await customerWorkerAvailable()).toBe(true);
  expect(query.mock.calls[0]![0]).toContain("interval '30 seconds'");
});
it("updates shared liveness with the database clock", async () => {
  query.mockResolvedValue({});
  await recordCustomerWorkerHeartbeat();
  expect(query).toHaveBeenCalledWith(expect.stringContaining("seen_at=excluded.seen_at"));
});
