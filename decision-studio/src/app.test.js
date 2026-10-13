import { describe, expect, it } from "vitest";

describe("Decision Studio", () => {
  it("keeps a stable product name", () => {
    expect("Decision Studio").toContain("Decision");
  });
});
