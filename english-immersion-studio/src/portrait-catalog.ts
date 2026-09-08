import rawCatalog from "./portrait-catalog.json";
import {
  DEFAULT_AVATAR_URL,
  type AvatarAsset
} from "./avatar";
import type { Persona } from "./data";

export type PortraitIdentity = Persona & {
  adultAge: number;
  portrait: string;
  prompt: string;
};

function parsePortraitCatalog(value: unknown): PortraitIdentity[] {
  if (!Array.isArray(value) || value.length !== 26) {
    throw new Error("The 2D portrait catalog must contain exactly 26 identities.");
  }

  const ids = new Set<string>();
  const roles = new Set<string>();
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`portrait[${index}] must be an object`);
    }
    const record = entry as Record<string, unknown>;
    const requireString = (field: string) => {
      const item = record[field];
      if (typeof item !== "string" || !item.trim()) {
        throw new Error(`portrait[${index}].${field} must be a non-empty string`);
      }
      return item;
    };
    const id = requireString("id");
    const role = requireString("role");
    const adultAge = Number(record.adultAge);
    if (!Number.isInteger(adultAge) || adultAge < 21) {
      throw new Error(`portrait[${index}].adultAge must be at least 21`);
    }
    if (ids.has(id) || roles.has(role)) {
      throw new Error(`Duplicate portrait identity or role at index ${index}`);
    }
    ids.add(id);
    roles.add(role);
    return {
      id,
      name: requireString("name"),
      role,
      accent: requireString("accent"),
      trait: requireString("trait"),
      color: requireString("color"),
      appearance: requireString("prompt"),
      adultAge,
      portrait: requireString("portrait"),
      prompt: requireString("prompt")
    };
  });
}

export const portraitIdentities = parsePortraitCatalog(rawCatalog);

export const portraitPersonas: Persona[] = portraitIdentities.map(
  ({ id, name, role, accent, trait, color, appearance }) => ({
    id,
    name,
    role,
    accent,
    trait,
    color,
    appearance
  })
);

export const portraitAvatarAssets: AvatarAsset[] = portraitIdentities.map(
  (identity) => {
    const basename = identity.portrait.split("/").pop() ?? "";
    return {
      id: identity.id,
      label: identity.name,
      modelUrl: DEFAULT_AVATAR_URL,
      photoUrl: `${import.meta.env.BASE_URL}portraits-half/${basename}`,
      stageImageUrl: `${import.meta.env.BASE_URL}portrait-cutouts-half/${basename.replace(/\.[^.]+$/, ".png")}`,
      fullPhotoUrl: `${import.meta.env.BASE_URL}portraits-full/${basename}`,
      fullStageImageUrl: `${import.meta.env.BASE_URL}portrait-cutouts-full/${basename.replace(/\.[^.]+$/, ".png")}`,
      source: "synthetic"
    };
  }
);

export function getPortraitIdentity(id: string) {
  return portraitIdentities.find((identity) => identity.id === id);
}

export { parsePortraitCatalog };
