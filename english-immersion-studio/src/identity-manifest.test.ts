import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { personas } from "./data";
import {
  IDENTITY_GROUPS,
  identityManifest,
  parseIdentityManifest,
  runtimeAvatarAssets,
  runtimeIdentities
} from "./identity-manifest";

const projectRoot = process.cwd();
const rendererContentRoot = join(
  projectRoot,
  "services",
  "metahuman-renderer",
  "Content"
);

describe("identity manifest", () => {
  it("defines exactly 30 unique adult identities in three equal groups", () => {
    expect(identityManifest.identities).toHaveLength(30);
    expect(new Set(identityManifest.identities.map(({ id }) => id)).size).toBe(30);
    expect(new Set(identityManifest.identities.map(({ label }) => label)).size).toBe(30);

    for (const group of IDENTITY_GROUPS) {
      expect(
        identityManifest.identities.filter((identity) => identity.group === group)
      ).toHaveLength(10);
    }

    for (const identity of identityManifest.identities) {
      expect(Number.parseInt(identity.adultAgeBand, 10)).toBeGreaterThanOrEqual(21);
    }
  });

  it("exposes only the three identities with complete runtime evidence", () => {
    expect(runtimeIdentities.map(({ id }) => id)).toEqual([
      "sophia-tuya",
      "amara-aera",
      "vivian-voss"
    ]);
    expect(runtimeAvatarAssets.map(({ id }) => id)).toEqual(
      runtimeIdentities.map(({ id }) => id)
    );
    expect(runtimeAvatarAssets).toHaveLength(3);
    expect(new Set(runtimeIdentities.map(({ hairId }) => hairId)).size).toBe(3);

    for (const identity of runtimeIdentities) {
      expect(identity.unrealCharacter).toBeTruthy();
      expect(identity.blueprint).toMatch(/^\/Game\/MetaHumans\//);
      expect(identity.portrait).toMatch(/^identities\/.+\.png$/);
      expect(identity.hairId).toBeTruthy();
      expect(identity.groom).toMatch(/^\/Game\/MetaHumans\//);
      expect(identity.groomBinding).toMatch(/^\/Game\/MetaHumans\//);
      expect(identity.outfitId).toBeTruthy();

      const portraitPath = join(projectRoot, "public", identity.portrait);
      const unrealAssetPaths = [
        identity.blueprint,
        identity.groom,
        identity.groomBinding
      ].map(
        (assetPath) =>
          `${join(
            rendererContentRoot,
            ...assetPath.replace(/^\/Game\//, "").split("/")
          )}.uasset`
      );
      expect(existsSync(portraitPath), portraitPath).toBe(true);
      for (const assetPath of unrealAssetPaths) {
        expect(existsSync(assetPath), assetPath).toBe(true);
      }
    }
  });

  it("keeps planned identities out of runtime UI data", () => {
    const plannedIds = new Set(
      identityManifest.identities
        .filter((identity) => identity.status === "planned")
        .map((identity) => identity.id)
    );
    expect(plannedIds.size).toBe(27);
    expect(runtimeAvatarAssets.every((avatar) => !plannedIds.has(avatar.id))).toBe(true);
  });

  it("keeps runtime identity labels aligned with selectable personas", () => {
    const personaById = new Map(personas.map((persona) => [persona.id, persona]));
    for (const identity of runtimeIdentities) {
      expect(personaById.get(identity.id)?.name).toBe(identity.label);
    }
  });

  it("rejects underage ranges and unverified runtime fields", () => {
    const underage = structuredClone(identityManifest);
    underage.identities[0].adultAgeBand = "18-20";
    expect(() => parseIdentityManifest(underage)).toThrow(/age 21 or older/);

    const leakedRuntimeField = structuredClone(identityManifest) as unknown as {
      identities: Array<Record<string, unknown>>;
    };
    const planned = leakedRuntimeField.identities.find(
      (identity) => identity.status === "planned"
    );
    if (!planned) throw new Error("Expected a planned identity fixture");
    planned.blueprint = "/Game/MetaHumans/Unverified/BP_Unverified";
    expect(() => parseIdentityManifest(leakedRuntimeField)).toThrow(
      /cannot exist before runtime verification/
    );
  });
});
