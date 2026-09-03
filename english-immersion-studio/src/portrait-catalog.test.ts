import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  portraitAvatarAssets,
  portraitIdentities,
  portraitPersonas
} from "./portrait-catalog";

describe("2D portrait catalog", () => {
  it("contains 26 distinct adult professional identities", () => {
    expect(portraitIdentities).toHaveLength(26);
    expect(new Set(portraitIdentities.map((item) => item.id)).size).toBe(26);
    expect(new Set(portraitIdentities.map((item) => item.role)).size).toBe(26);
    expect(portraitIdentities.every((item) => item.adultAge >= 21)).toBe(true);
  });

  it("maps every identity to a local portrait and persona", () => {
    expect(portraitAvatarAssets).toHaveLength(26);
    expect(portraitPersonas).toHaveLength(26);

    const hashes = portraitIdentities.map((identity) => {
      const file = resolve("public", identity.portrait);
      const bytes = readFileSync(file);
      expect(bytes.length).toBeGreaterThan(20_000);
      const cutout = resolve(
        "public",
        "portrait-cutouts",
        `${identity.id}.png`
      );
      const cutoutBytes = readFileSync(cutout);
      expect(cutoutBytes.subarray(1, 4).toString("ascii")).toBe("PNG");
      expect(cutoutBytes[25]).toBe(6);
      return createHash("sha256").update(bytes).digest("hex");
    });
    expect(new Set(hashes).size).toBe(26);
  });
});
