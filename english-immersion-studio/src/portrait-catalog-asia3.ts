import rawCatalog from "./portrait-catalog-asia3.json";
import { DEFAULT_AVATAR_URL, type AvatarAsset } from "./avatar";
import type { Persona } from "./data";
import { parsePortraitCatalog, type PortraitIdentity } from "./portrait-catalog";

export const asia3PortraitIdentities: PortraitIdentity[] =
  parsePortraitCatalog(rawCatalog);

export const asia3PortraitPersonas: Persona[] = asia3PortraitIdentities.map(
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

export const asia3PortraitAvatarAssets: AvatarAsset[] =
  asia3PortraitIdentities.map((identity) => {
    const filename = identity.portrait.split("/").pop() ?? "";
    const basename = filename.replace(/\.[^.]+$/, "");
    return {
      id: identity.id,
      label: identity.name,
      modelUrl: DEFAULT_AVATAR_URL,
      photoUrl: `${import.meta.env.BASE_URL}${identity.portrait}`,
      stageImageUrl: `${import.meta.env.BASE_URL}portrait-cutouts-asia3/${basename}.png`,
      source: "synthetic"
    };
  });

export function getAsia3PortraitIdentity(id: string) {
  return asia3PortraitIdentities.find((identity) => identity.id === id);
}
