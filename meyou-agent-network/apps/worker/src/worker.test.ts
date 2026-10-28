import { describe, expect, it } from "vitest";
import { retryDelay } from "./worker.js";

describe("worker polling backoff", () => {
  it("keeps the normal interval before failures", () => {
    expect(retryDelay(5_000, 0)).toBe(5_000);
  });

  it("backs off exponentially and caps prolonged outages", () => {
    expect(retryDelay(5_000, 1)).toBe(10_000);
    expect(retryDelay(5_000, 4)).toBe(80_000);
    expect(retryDelay(5_000, 20)).toBe(300_000);
  });
});
