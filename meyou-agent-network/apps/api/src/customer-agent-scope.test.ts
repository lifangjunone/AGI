import { afterEach, expect, it, vi } from "vitest";
import { customerAgentInScope, customerAgentOrganizations } from "./customer-agent-scope.js";
afterEach(() => vi.unstubAllEnvs());
it("supports an explicitly scoped beta and fails closed for an invalid list", () => {
  const org = "903a514c-144e-435b-9460-f2e9ab5b81b8";
  vi.stubEnv("CUSTOMER_AGENT_ORGANIZATIONS", org);
  expect(customerAgentInScope(org)).toBe(true);
  expect(customerAgentInScope("other")).toBe(false);
  vi.stubEnv("CUSTOMER_AGENT_ORGANIZATIONS", "invalid");
  expect(customerAgentOrganizations()).toEqual([]);
  expect(customerAgentInScope(org)).toBe(false);
});
