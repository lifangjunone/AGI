import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));
vi.mock("./db/client.js", () => ({ pool: { connect: async () => ({ query: mocks.query, release: mocks.release }) } }));
import { organizationReceptionSchema, setOrganizationReception } from "./organization-reception.js";
it("requires explicit authorization for automatic new inquiries", () => {
  expect(organizationReceptionSchema.safeParse({ mode: "agent" }).success).toBe(false);
  expect(organizationReceptionSchema.safeParse({ mode: "agent", confirmation: "authorize-new-customer-reception" }).success).toBe(true);
  expect(organizationReceptionSchema.safeParse({ mode: "human" }).success).toBe(true);
});
it("does not mutate unrelated organizations", async () => {
  mocks.query.mockReset().mockResolvedValue({ rowCount: 0, rows: [] });
  expect(await setOrganizationReception("outsider", "org", "agent")).toBeNull();
  expect(mocks.query.mock.calls[1]![1]).toEqual(["org", "outsider"]);
  expect(mocks.query).toHaveBeenLastCalledWith("rollback");
});
