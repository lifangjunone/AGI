import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { asia3PortraitIdentities } from "./portrait-catalog-asia3";

describe("third Asian portrait catalog", () => {
  it("contains 26 complete adult identities", () => {
    expect(asia3PortraitIdentities).toHaveLength(26);
    expect(asia3PortraitIdentities.every((item) => item.adultAge >= 21)).toBe(true);
    expect(
      asia3PortraitIdentities.every((item) =>
        existsSync(
          resolve(
            "public",
            "portraits-asia3-half",
            `${item.portrait.split("/").pop()?.replace(/\.[^.]+$/, "")}.jpg`
          )
        )
      )
    ).toBe(true);
    expect(
      asia3PortraitIdentities.every((item) =>
        existsSync(
          resolve(
            "public",
            "portrait-cutouts-asia3-half",
            `${item.portrait.split("/").pop()?.replace(/\.[^.]+$/, "")}.png`
          )
        )
      )
    ).toBe(true);
    expect(
      asia3PortraitIdentities.every((item) =>
        existsSync(
          resolve(
            "public",
            "portraits-asia3-full",
            `${item.portrait.split("/").pop()?.replace(/\.[^.]+$/, "")}.jpg`
          )
        )
      )
    ).toBe(true);
  });
});
