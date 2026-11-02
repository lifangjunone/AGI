import { expect, it, vi } from "vitest";
import { queueCustomerAgentTask } from "./customer-agent-authority.js";

it("does not schedule paused or resolved threads", async () => {
  const query = vi.fn();
  expect(await queueCustomerAgentTask({ query }, { id: "thread", agent_mode: "paused", agent_revision: 3, status: "active" }, "message")).toBe(false);
  expect(await queueCustomerAgentTask({ query }, { id: "thread", agent_mode: "auto", agent_revision: 3, status: "resolved" }, "message")).toBe(false);
  expect(query).not.toHaveBeenCalled();
});

it("binds a durable task to the current authority revision and deduplicates source retries", async () => {
  const query = vi.fn().mockResolvedValue({});
  expect(await queueCustomerAgentTask({ query }, { id: "thread", agent_mode: "auto", agent_revision: 3, status: "agent" }, "message")).toBe(true);
  expect(query).toHaveBeenCalledWith(expect.stringContaining("on conflict"), ["thread", "message", 3]);
});
