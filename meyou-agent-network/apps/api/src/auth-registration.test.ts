import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  insert: vi.fn(), accountInsert: vi.fn(), transaction: vi.fn(), preflight: vi.fn()
}));
vi.mock("./db/client.js", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: mocks.preflight }) }) }),
    transaction: mocks.transaction
  }
}));
import { registerLocalAccount } from "./auth.js";

it("writes the user and password account through the same transaction", async () => {
  mocks.preflight.mockResolvedValue([]);
  mocks.insert.mockReset().mockReturnValueOnce({
    values: () => ({ returning: async () => [{ id: "database-id", displayName: "Test user" }] })
  }).mockReturnValueOnce({ values: mocks.accountInsert.mockResolvedValue(undefined) });
  mocks.transaction.mockImplementation(async work => work({ insert: mocks.insert }));
  expect(await registerLocalAccount("  TEST@example.invalid  ", "test-password", "Test user")).toEqual({
    id: "local:test@example.invalid", name: "Test user", email: "test@example.invalid"
  });
  expect(mocks.transaction).toHaveBeenCalledOnce();
  expect(mocks.accountInsert).toHaveBeenCalledWith(expect.objectContaining({
    userId: "database-id", email: "test@example.invalid"
  }));
  expect(mocks.accountInsert.mock.calls[0]![0].passwordHash).not.toContain("test-password");
});

it("propagates the account insert failure so the transaction rolls back", async () => {
  mocks.preflight.mockResolvedValue([]);
  mocks.insert.mockReset().mockReturnValueOnce({
    values: () => ({ returning: async () => [{ id: "database-id", displayName: "Test user" }] })
  }).mockReturnValueOnce({ values: async () => { throw new Error("account_write_failed"); } });
  mocks.transaction.mockImplementation(async work => work({ insert: mocks.insert }));
  await expect(registerLocalAccount("test@example.invalid", "test-password", "Test user"))
    .rejects.toThrow("account_write_failed");
});
