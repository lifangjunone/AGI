import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));
vi.mock("./db/client.js", () => ({ pool: { connect: async () => mocks } }));
import { withPlazaLease } from "./plaza-lease.js";

describe("plaza cross-process lease", () => {
  it("does not execute the model task when another process owns the lease", async () => {
    mocks.query.mockReset().mockResolvedValue({ rows: [{ locked: false }] });
    mocks.release.mockClear();
    const task = vi.fn();
    expect(await withPlazaLease("circle", task, null)).toBeNull();
    expect(task).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalled();
  });
  it("unlocks on task failure", async () => {
    mocks.query.mockReset().mockResolvedValue({ rows: [{ locked: true }] });
    await expect(withPlazaLease("circle", async () => { throw new Error("failed"); }, null)).rejects.toThrow("failed");
    expect(mocks.query).toHaveBeenLastCalledWith(
      "select pg_advisory_unlock(hashtextextended($1, 0))", ["meyou:plaza:circle"]
    );
  });
});
