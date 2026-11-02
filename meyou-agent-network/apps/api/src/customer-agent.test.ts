import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn(), release: vi.fn(), complete: vi.fn(), reserve: vi.fn(), current: vi.fn(), claim: vi.fn() }));
vi.mock("./customer-agent-lease.js", () => ({ claimCustomerAgentTask: mocks.claim }));
vi.mock("./db/client.js", () => ({ pool: { query: mocks.query, connect: async () => ({ query: mocks.tx, release: mocks.release }) } }));
vi.mock("./plaza-budget.js", () => ({ reservePlazaCall: mocks.reserve }));
vi.mock("./model.js", async original => ({
  ...await original<typeof import("./model.js")>(),
  modelProvider: { completeDetailed: mocks.complete },
  resolveModelConfiguration: async () => ({ apiKey: "fixture-only", modelId: "fixture-model" }),
  assertModelExecutionCurrent: mocks.current
}));
import { customerAgentAuthorized, customerAgentRisk, customerSourceCurrent, runCustomerAgentTask } from "./customer-agent.js";
const documentId = "903a514c-144e-435b-9460-f2e9ab5b81b8";
beforeEach(() => {
  vi.stubEnv("CUSTOMER_AGENT_ENABLED", "true");
  vi.clearAllMocks();
  mocks.query.mockReset();
  mocks.claim.mockReset();
  mocks.tx.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
  mocks.reserve.mockResolvedValue("reserved");
  mocks.current.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
it("does not claim or charge a task while execution is disabled", async () => {
  vi.stubEnv("CUSTOMER_AGENT_ENABLED", "false");
  expect(await runCustomerAgentTask("task")).toEqual({ status: "skipped" });
  expect(mocks.claim).not.toHaveBeenCalled();
  expect(mocks.reserve).not.toHaveBeenCalled();
  expect(mocks.complete).not.toHaveBeenCalled();
});
it("requires matching authority and rejects paused or resolved threads", () => {
  expect(customerAgentAuthorized({ agent_mode: "auto", agent_revision: 3, status: "agent" }, { authority_revision: 3 })).toBe(true);
  expect(customerAgentAuthorized({ agent_mode: "paused", agent_revision: 3, status: "agent" }, { authority_revision: 3 })).toBe(false);
  expect(customerAgentAuthorized({ agent_mode: "auto", agent_revision: 4, status: "agent" }, { authority_revision: 3 })).toBe(false);
  expect(customerAgentAuthorized({ agent_mode: "auto", agent_revision: 3, status: "resolved" }, { authority_revision: 3 })).toBe(false);
});
it("escalates prices, complaints and payment commitments", () => {
  for (const input of ["退款", "投诉", "price discount", "payment guarantee"]) expect(customerAgentRisk(input)).toBe(true);
  expect(customerAgentRisk("What are your business hours?")).toBe(false);
});
it("only answers the latest customer turn, never a superseded inquiry or human reply", () => {
  expect(customerSourceCurrent("thread", "thread")).toBe(true);
  expect(customerSourceCurrent("old", "thread", { id: "new", actor: "customer" })).toBe(false);
  expect(customerSourceCurrent("thread", "thread", { id: "new", actor: "customer" })).toBe(false);
  expect(customerSourceCurrent("new", "thread", { id: "new", actor: "human" })).toBe(false);
  expect(customerSourceCurrent("new", "thread", { id: "new", actor: "customer" })).toBe(true);
});
it("cancels superseded tasks before consuming quota or calling the provider", async () => {
  mocks.claim.mockResolvedValueOnce({ id: "task", thread_id: "thread", source_id: "old", authority_revision: 1 });
  mocks.query.mockResolvedValueOnce({ rows: [{ agent_mode: "auto", agent_revision: 1, status: "agent", owner_id: "owner" }] })
    .mockResolvedValueOnce({ rows: [{ modes: { business: "auto" } }] })
    .mockResolvedValueOnce({ rows: [{ id: "new", actor: "customer", content: "New question" }] });
  expect(await runCustomerAgentTask("task")).toEqual({ status: "cancelled" });
  expect(mocks.reserve).not.toHaveBeenCalled();
  expect(mocks.complete).not.toHaveBeenCalled();
});
it("does not invoke the model for unclaimable or revoked tasks", async () => {
  mocks.claim.mockResolvedValueOnce(null);
  expect(await runCustomerAgentTask("task")).toEqual({ status: "skipped" });
  mocks.claim.mockResolvedValueOnce({ id: "task", thread_id: "thread", authority_revision: 1 });
  mocks.query.mockResolvedValueOnce({ rows: [{ agent_mode: "paused", agent_revision: 2 }] });
  expect(await runCustomerAgentTask("task")).toEqual({ status: "cancelled" });
  expect(mocks.complete).not.toHaveBeenCalled();
});
it("escalates a source-free inquiry without consuming model quota", async () => {
  mocks.claim.mockResolvedValueOnce({ id: "task", thread_id: "thread", source_id: "thread", authority_revision: 1 });
  mocks.query.mockResolvedValueOnce({ rows: [{ agent_mode: "auto", agent_revision: 1, status: "agent", subject: "Hours?", owner_id: "owner", organization_id: "org" }] })
    .mockResolvedValueOnce({ rows: [{ modes: { business: "auto" } }] })
    .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
  expect(await runCustomerAgentTask("task")).toEqual({ status: "needs_human" });
  expect(mocks.complete).not.toHaveBeenCalled();
  expect(mocks.reserve).not.toHaveBeenCalled();
});
it.each([
  { advanced: false, failed: false },
  { advanced: true, failed: false },
  { advanced: true, failed: true },
  { advanced: false, failed: false, disabled: true },
  { advanced: false, failed: false, disabledBeforeCall: true }
])("does not publish or escalate an obsolete generation ($advanced, failed=$failed, disabled=$disabled)", async ({ advanced, failed, disabled, disabledBeforeCall }) => {
  const token = "lease-token";
  const task = { id: "task", thread_id: "thread", source_id: "thread", authority_revision: 1 };
  const thread = { agent_mode: "auto", agent_revision: 1, status: "agent", subject: "Hours?", owner_id: "owner", organization_id: "org", internal_notes: ["SECRET NOTE"] };
  mocks.claim.mockResolvedValue({ ...task, lease_token: token });
  mocks.query.mockResolvedValueOnce({ rows: [thread] })
    .mockResolvedValueOnce({ rows: [{ modes: { business: "auto" } }] }).mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: documentId, title: "Hours", content: "Open weekdays.", revision: "v1" }] });
  mocks.complete.mockResolvedValue({ content: JSON.stringify({ answer: "Open weekdays.", confidence: .95, needsHuman: false, citations: [{ documentId, quote: "Open weekdays." }] }),
    provider: "fixture", model: "fixture-model", source: "database" });
  if (failed) mocks.complete.mockRejectedValueOnce(new Error("provider_unavailable"));
  if (disabledBeforeCall) mocks.reserve.mockImplementationOnce(async () => {
    vi.stubEnv("CUSTOMER_AGENT_ENABLED", "false");
    return "reserved";
  });
  if (disabled) mocks.complete.mockImplementationOnce(async () => {
    vi.stubEnv("CUSTOMER_AGENT_ENABLED", "false");
    return { content: JSON.stringify({ answer: "Open weekdays.", confidence: .95, needsHuman: false,
      citations: [{ documentId, quote: "Open weekdays." }] }), provider: "fixture", model: "fixture-model", source: "database" };
  });
  mocks.tx.mockImplementation(async sql => {
    if (sql.includes("select * from customer_threads")) return { rows: [thread] };
    if (sql.includes("select * from customer_agent_tasks")) return { rows: [{ state: "running", lease_token: token }] };
    if (sql.includes("select id,actor from customer_messages")) return { rows: advanced ? [{ id: "new-question", actor: "customer" }] : [] };
    if (sql.includes("from knowledge_documents")) return { rows: [{ id: documentId, revision: "v1" }] };
    if (sql.includes("from agents")) return { rows: [{ modes: { business: "auto" } }] };
    if (sql.includes("insert into customer_messages")) return { rows: [{ id: "message" }] };
    return { rows: [], rowCount: 1 };
  });
  expect(await runCustomerAgentTask("task")).toEqual({ status: failed ? "needs_human" : advanced || disabled || disabledBeforeCall ? "cancelled" : "sent" });
  expect(JSON.stringify(mocks.complete.mock.calls)).not.toContain("SECRET NOTE");
  const sql = mocks.tx.mock.calls.map(call => call[0]).join(" ");
  if (advanced || disabled || disabledBeforeCall) {
    expect(sql).not.toContain("insert into customer_messages");
    expect(sql).not.toContain("update customer_threads");
  } else expect(sql).toContain("insert into customer_agent_outputs");
  if (disabledBeforeCall) expect(mocks.complete).not.toHaveBeenCalled();
  expect(mocks.current).toHaveBeenCalledTimes(failed || disabledBeforeCall ? 0 : advanced || disabled ? 1 : 2);
  expect(mocks.tx).toHaveBeenLastCalledWith("commit");
});
