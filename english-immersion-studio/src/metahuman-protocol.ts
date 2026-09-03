import type { PerformanceState } from "./data";
import type { ViewMode } from "./ImmersiveStage";
import { getRuntimeIdentity } from "./identity-manifest";

export const METAHUMAN_PROTOCOL_VERSION = 1;

export type SpeechWordBoundary = {
  text: string;
  startMs: number;
  endMs: number;
};

export type LipShape =
  | "sil"
  | "closed"
  | "teeth"
  | "tongue"
  | "wide"
  | "open"
  | "round"
  | "purse";

export type LipSyncCue = {
  atMs: number;
  shape: LipShape;
};

export type MetaHumanState = {
  actorName: string;
  avatarId: string;
  outfitId: string;
  performance: PerformanceState;
  sceneId: string;
  speaking: boolean;
  viewMode: ViewMode;
};

export type MetaHumanStateCommand = {
  version: typeof METAHUMAN_PROTOCOL_VERSION;
  type: "avatar.state";
  payload: MetaHumanState & {
    hairId: string;
  };
};

export type MetaHumanSpeechCommand = {
  version: typeof METAHUMAN_PROTOCOL_VERSION;
  type: "speech.timeline";
  payload: {
    utteranceId: string;
    offsetMs: number;
    cues: LipSyncCue[];
  };
};

export type MetaHumanSpeechStopCommand = {
  version: typeof METAHUMAN_PROTOCOL_VERSION;
  type: "speech.stop";
  payload: {
    utteranceId: string;
  };
};

export type FaceAnimationPayload = {
  fps: number;
  duration: number;
  n_frames: number;
  arkit_raw: Record<string, number[]>;
};

export type MetaHumanFaceCommand = {
  version: typeof METAHUMAN_PROTOCOL_VERSION;
  type: "speech.face";
  payload: FaceAnimationPayload;
};

export type MetaHumanPerformanceCommand = {
  version: typeof METAHUMAN_PROTOCOL_VERSION;
  type: "renderer.performance";
  payload: {
    mode: "inference" | "interactive";
  };
};

export type MetaHumanCommand =
  | MetaHumanStateCommand
  | MetaHumanSpeechCommand
  | MetaHumanFaceCommand
  | MetaHumanPerformanceCommand
  | MetaHumanSpeechStopCommand;

export function getMetaHumanHairId(avatarId: string) {
  return getRuntimeIdentity(avatarId)?.hairId ?? "sleek-long";
}

export function createMetaHumanCommand(
  state: MetaHumanState
): MetaHumanStateCommand {
  return {
    version: METAHUMAN_PROTOCOL_VERSION,
    type: "avatar.state",
    payload: {
      ...state,
      hairId: getMetaHumanHairId(state.avatarId)
    }
  };
}

const graphemeRules: Array<[RegExp, LipShape]> = [
  [/^(?:th)/, "tongue"],
  [/^(?:ch|sh|zh|j)/, "round"],
  [/^(?:oo|ou|ow|o|u|w)/, "round"],
  [/^(?:ee|ea|ie|i|e|y)/, "wide"],
  [/^(?:p|b|m)/, "closed"],
  [/^(?:f|v)/, "teeth"],
  [/^(?:r)/, "purse"],
  [/^(?:a)/, "open"],
  [/^(?:t|d|s|z|n|l)/, "tongue"],
  [/^(?:k|g|c|q|x|h)/, "open"]
];

function wordShapes(word: string) {
  const shapes: LipShape[] = [];
  let remaining = word.toLowerCase().replace(/[^a-z]/g, "");
  while (remaining) {
    const rule = graphemeRules.find(([pattern]) => pattern.test(remaining));
    if (!rule) {
      remaining = remaining.slice(1);
      continue;
    }
    const match = rule[0].exec(remaining);
    if (!match) break;
    if (shapes.at(-1) !== rule[1]) shapes.push(rule[1]);
    remaining = remaining.slice(match[0].length);
  }
  return shapes.length ? shapes : (["open"] satisfies LipShape[]);
}

export function createLipSyncCues(boundaries: SpeechWordBoundary[]) {
  const cues: LipSyncCue[] = [{ atMs: 0, shape: "sil" }];
  for (const boundary of boundaries) {
    const startMs = Math.max(0, Math.round(boundary.startMs));
    const endMs = Math.max(startMs + 1, Math.round(boundary.endMs));
    const shapes = wordShapes(boundary.text);
    const leadMs = Math.min(45, Math.max(15, (endMs - startMs) * 0.12));
    const activeStart = Math.max(0, startMs - leadMs);
    shapes.forEach((shape, index) => {
      cues.push({
        atMs: Math.round(
          activeStart + ((endMs - activeStart) * (index + 0.35)) / shapes.length
        ),
        shape
      });
    });
    cues.push({ atMs: endMs + 35, shape: "sil" });
  }
  return cues
    .sort((left, right) => left.atMs - right.atMs)
    .filter(
      (cue, index, all) =>
        index === 0 ||
        cue.atMs !== all[index - 1].atMs ||
        cue.shape !== all[index - 1].shape
    );
}

export function createSpeechTimelineCommand(
  utteranceId: string,
  boundaries: SpeechWordBoundary[],
  offsetMs = 0
): MetaHumanSpeechCommand {
  return {
    version: METAHUMAN_PROTOCOL_VERSION,
    type: "speech.timeline",
    payload: {
      utteranceId,
      offsetMs: Math.max(0, Math.round(offsetMs)),
      cues: createLipSyncCues(boundaries)
    }
  };
}

export function createSpeechStopCommand(
  utteranceId: string
): MetaHumanSpeechStopCommand {
  return {
    version: METAHUMAN_PROTOCOL_VERSION,
    type: "speech.stop",
    payload: { utteranceId }
  };
}

export function createSpeechFaceCommand(
  payload: FaceAnimationPayload
): MetaHumanFaceCommand {
  return {
    version: METAHUMAN_PROTOCOL_VERSION,
    type: "speech.face",
    payload
  };
}

export function createRendererPerformanceCommand(
  mode: "inference" | "interactive"
): MetaHumanPerformanceCommand {
  return {
    version: METAHUMAN_PROTOCOL_VERSION,
    type: "renderer.performance",
    payload: { mode }
  };
}
