import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { asiaPortraitIdentities } from "./portrait-catalog-asia";

describe("asia portrait catalog", () => {
  it("contains 26 distinct adult identities", () => {
    expect(asiaPortraitIdentities).toHaveLength(26);
    expect(new Set(asiaPortraitIdentities.map((item) => item.id)).size).toBe(26);
    expect(new Set(asiaPortraitIdentities.map((item) => item.role)).size).toBe(26);
    expect(asiaPortraitIdentities.every((item) => item.adultAge >= 21)).toBe(true);
    expect(
      asiaPortraitIdentities.every((item) =>
        existsSync(resolve("public", item.portrait))
      )
    ).toBe(true);
    expect(
      asiaPortraitIdentities.every((item) =>
        existsSync(
          resolve(
            "public",
            "portrait-cutouts-asia",
            `${item.portrait.split("/").pop()?.replace(/\.[^.]+$/, "")}.png`
          )
        )
      )
    ).toBe(true);
  });
});
