import rawManifest from "./identity-manifest.json";
import {
  DEFAULT_AVATAR_URL,
  type AvatarAsset
} from "./avatar";

export const IDENTITY_GROUPS = [
  "korean-stage",
  "japanese-adult-fashion",
  "mature-professional"
] as const;

export type IdentityGroup = (typeof IDENTITY_GROUPS)[number];
export type IdentityStatus = "planned" | "runtime-ready";

type IdentityBase = {
  id: string;
  label: string;
  group: IdentityGroup;
  adultAgeBand: string;
};

export type RuntimeIdentity = IdentityBase & {
  status: "runtime-ready";
  unrealCharacter: string;
  blueprint: string;
  portrait: string;
  hairId: string;
  groom: string;
  groomBinding: string;
  outfitId: string;
};

export type PlannedIdentity = IdentityBase & {
  status: "planned";
  desiredHairId: string;
  desiredOutfitId: string;
};

export type Identity = RuntimeIdentity | PlannedIdentity;

export type IdentityManifest = {
  version: 1;
  identities: Identity[];
};

export const DEFAULT_RUNTIME_IDENTITY_ID = "sophia-tuya";

const runtimeOnlyFields = [
  "unrealCharacter",
  "blueprint",
  "portrait",
  "hairId",
  "groom",
  "groomBinding",
  "outfitId"
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(
  record: Record<string, unknown>,
  field: string,
  context: string
) {
  const value = record[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${context}.${field} must be a non-empty string`);
  }
  return value;
}

function parseIdentity(value: unknown, index: number): Identity {
  const context = `identity[${index}]`;
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object`);
  }

  const id = requireString(value, "id", context);
  const label = requireString(value, "label", context);
  const group = requireString(value, "group", context);
  const adultAgeBand = requireString(value, "adultAgeBand", context);
  const status = requireString(value, "status", context);

  if (!IDENTITY_GROUPS.includes(group as IdentityGroup)) {
    throw new Error(`${context}.group is not supported`);
  }

  const minimumAge = Number.parseInt(adultAgeBand.split("-")[0], 10);
  if (!Number.isFinite(minimumAge) || minimumAge < 21) {
    throw new Error(`${context}.adultAgeBand must begin at age 21 or older`);
  }

  const base = {
    id,
    label,
    group: group as IdentityGroup,
    adultAgeBand
  };

  if (status === "runtime-ready") {
    const blueprint = requireString(value, "blueprint", context);
    const portrait = requireString(value, "portrait", context);
    if (!blueprint.startsWith("/Game/MetaHumans/")) {
      throw new Error(`${context}.blueprint must reference a MetaHuman asset`);
    }
    if (!portrait.startsWith("identities/") || !portrait.endsWith(".png")) {
      throw new Error(`${context}.portrait must reference a bundled PNG`);
    }
    const groom = requireString(value, "groom", context);
    const groomBinding = requireString(value, "groomBinding", context);
    if (!groom.startsWith("/Game/MetaHumans/")) {
      throw new Error(`${context}.groom must reference a MetaHuman asset`);
    }
    if (!groomBinding.startsWith("/Game/MetaHumans/")) {
      throw new Error(`${context}.groomBinding must reference a MetaHuman asset`);
    }
    return {
      ...base,
      status,
      unrealCharacter: requireString(value, "unrealCharacter", context),
      blueprint,
      portrait,
      hairId: requireString(value, "hairId", context),
      groom,
      groomBinding,
      outfitId: requireString(value, "outfitId", context)
    };
  }

  if (status !== "planned") {
    throw new Error(`${context}.status is not supported`);
  }
  for (const field of runtimeOnlyFields) {
    if (field in value) {
      throw new Error(`${context}.${field} cannot exist before runtime verification`);
    }
  }
  return {
    ...base,
    status,
    desiredHairId: requireString(value, "desiredHairId", context),
    desiredOutfitId: requireString(value, "desiredOutfitId", context)
  };
}

export function parseIdentityManifest(value: unknown): IdentityManifest {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.identities)) {
    throw new Error("Identity manifest must contain version 1 and an identities array");
  }

  const identities = value.identities.map(parseIdentity);
  if (identities.length !== 30) {
    throw new Error(`Identity manifest must contain exactly 30 entries, found ${identities.length}`);
  }

  const ids = new Set<string>();
  const labels = new Set<string>();
  for (const identity of identities) {
    if (ids.has(identity.id)) {
      throw new Error(`Duplicate identity id: ${identity.id}`);
    }
    if (labels.has(identity.label)) {
      throw new Error(`Duplicate identity label: ${identity.label}`);
    }
    ids.add(identity.id);
    labels.add(identity.label);
  }

  for (const group of IDENTITY_GROUPS) {
    const count = identities.filter((identity) => identity.group === group).length;
    if (count !== 10) {
      throw new Error(`Identity group ${group} must contain exactly 10 entries, found ${count}`);
    }
  }

  return { version: 1, identities };
}

export const identityManifest = parseIdentityManifest(rawManifest);

const runtimeIdentityList = identityManifest.identities.filter(
  (identity): identity is RuntimeIdentity => identity.status === "runtime-ready"
);

export const runtimeIdentities = [
  ...runtimeIdentityList.filter(
    (identity) => identity.id === DEFAULT_RUNTIME_IDENTITY_ID
  ),
  ...runtimeIdentityList.filter(
    (identity) => identity.id !== DEFAULT_RUNTIME_IDENTITY_ID
  )
];

export const runtimeAvatarAssets: AvatarAsset[] = runtimeIdentities.map(
  (identity) => ({
    id: identity.id,
    label: identity.label,
    modelUrl: DEFAULT_AVATAR_URL,
    photoUrl: `${import.meta.env.BASE_URL}${identity.portrait}`,
    source: "bundled"
  })
);

export function getRuntimeIdentity(id: string) {
  return runtimeIdentities.find((identity) => identity.id === id);
}

export function formatIdentityHair(hairId: string) {
  return hairId
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
