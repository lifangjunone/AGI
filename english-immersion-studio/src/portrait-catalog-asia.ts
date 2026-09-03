import rawCatalog from "./portrait-catalog-asia.json";
import { DEFAULT_AVATAR_URL, type AvatarAsset } from "./avatar";
import type { Persona } from "./data";
import { parsePortraitCatalog, type PortraitIdentity } from "./portrait-catalog";

export const asiaPortraitIdentities: PortraitIdentity[] =
  parsePortraitCatalog(rawCatalog);

export const asiaPortraitPersonas: Persona[] = asiaPortraitIdentities.map(
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

export const asiaPortraitAvatarAssets: AvatarAsset[] =
  asiaPortraitIdentities.map((identity) => {
    const filename = identity.portrait.split("/").pop() ?? "";
    const basename = filename.replace(/\.[^.]+$/, "");
    return {
      id: identity.id,
      label: identity.name,
      modelUrl: DEFAULT_AVATAR_URL,
      photoUrl: `${import.meta.env.BASE_URL}${identity.portrait}`,
      stageImageUrl: `${import.meta.env.BASE_URL}portrait-cutouts-asia/${basename}.png`,
      source: "synthetic"
    };
  });

export function getAsiaPortraitIdentity(id: string) {
  return asiaPortraitIdentities.find((identity) => identity.id === id);
}
