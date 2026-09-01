import type { PerformanceState } from "./data";
import type { ViewMode } from "./ImmersiveStage";

export const METAHUMAN_PROTOCOL_VERSION = 1;

export type MetaHumanState = {
  actorName: string;
  avatarId: string;
  outfitId: string;
  performance: PerformanceState;
  sceneId: string;
  speaking: boolean;
  viewMode: ViewMode;
};

export type MetaHumanCommand = {
  version: typeof METAHUMAN_PROTOCOL_VERSION;
  type: "avatar.state";
  payload: MetaHumanState & {
    hairId: string;
  };
};

const hairVariants = {
  "k-stage": ["long-wave", "high-ponytail", "layered-wave", "sleek-long"],
  "j-fashion": ["long-straight", "soft-bob", "layered-long", "low-ponytail"],
  executive: ["polished-bob", "low-bun", "shoulder-wave", "sleek-long"]
} as const;

export function getMetaHumanHairId(avatarId: string) {
  const match = /^(k-stage|j-fashion|executive)-(\d{2})$/.exec(avatarId);
  if (!match) return "sleek-long";
  const style = match[1] as keyof typeof hairVariants;
  const index = Math.max(0, Number(match[2]) - 1);
  const variants = hairVariants[style];
  return variants[index % variants.length];
}

export function createMetaHumanCommand(state: MetaHumanState): MetaHumanCommand {
  return {
    version: METAHUMAN_PROTOCOL_VERSION,
    type: "avatar.state",
    payload: {
      ...state,
      hairId: getMetaHumanHairId(state.avatarId)
    }
  };
}
