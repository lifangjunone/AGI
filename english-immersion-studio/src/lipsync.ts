import {
  createLipSyncCues,
  type FaceAnimationPayload,
  type LipShape,
  type SpeechWordBoundary
} from "./metahuman-protocol";

export type LipSyncMode = "neural" | "viseme" | "envelope";
export type LipSyncHealth = "checking" | "ready" | "unavailable";

export const lipSyncModes: Array<{
  id: LipSyncMode;
  label: string;
  detail: string;
}> = [
  { id: "neural", label: "Neural 61", detail: "Audio2Lipsync model" },
  { id: "viseme", label: "Viseme 8", detail: "Timed phoneme shapes" },
  { id: "envelope", label: "Audio RMS", detail: "Signal-driven baseline" }
];

const channels = [
  "JawOpen",
  "MouthClose",
  "MouthFunnel",
  "MouthPucker",
  "MouthSmileLeft",
  "MouthSmileRight",
  "MouthLowerDownLeft",
  "MouthLowerDownRight",
  "MouthPressLeft",
  "MouthPressRight",
  "MouthRollLower",
  "TongueOut"
] as const;

type ChannelName = (typeof channels)[number];
type FacePose = Partial<Record<ChannelName, number>>;

const poses: Record<LipShape, FacePose> = {
  sil: {},
  closed: {
    JawOpen: 0.03,
    MouthClose: 0.92,
    MouthPressLeft: 0.38,
    MouthPressRight: 0.38
  },
  teeth: {
    JawOpen: 0.18,
    MouthRollLower: 0.68
  },
  tongue: {
    JawOpen: 0.28,
    MouthLowerDownLeft: 0.2,
    MouthLowerDownRight: 0.2,
    TongueOut: 0.14
  },
  wide: {
    JawOpen: 0.32,
    MouthSmileLeft: 0.5,
    MouthSmileRight: 0.5
  },
  open: {
    JawOpen: 0.74,
    MouthLowerDownLeft: 0.25,
    MouthLowerDownRight: 0.25
  },
  round: {
    JawOpen: 0.46,
    MouthFunnel: 0.68,
    MouthPucker: 0.22
  },
  purse: {
    JawOpen: 0.2,
    MouthPucker: 0.76,
    MouthFunnel: 0.3
  }
};

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function emptyCurves(frameCount: number) {
  return Object.fromEntries(
    channels.map((channel) => [channel, Array<number>(frameCount).fill(0)])
  ) as Record<ChannelName, number[]>;
}

export function createVisemeFaceAnimation(
  boundaries: SpeechWordBoundary[],
  fps = 60
): FaceAnimationPayload | null {
  if (!boundaries.length || !Number.isFinite(fps) || fps <= 0) return null;

  const cues = createLipSyncCues(boundaries);
  const duration = (cues.at(-1)?.atMs ?? 0) / 1000 + 0.12;
  const frameCount = Math.max(2, Math.ceil(duration * fps));
  const curves = emptyCurves(frameCount);
  let cueIndex = 0;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const atMs = (frame / fps) * 1000;
    while (
      cueIndex + 1 < cues.length &&
      cues[cueIndex + 1].atMs <= atMs
    ) {
      cueIndex += 1;
    }

    const from = cues[cueIndex];
    const to = cues[Math.min(cueIndex + 1, cues.length - 1)];
    const span = Math.max(1, to.atMs - from.atMs);
    const linear = clamp((atMs - from.atMs) / span);
    const alpha = linear * linear * (3 - 2 * linear);
    const fromPose = poses[from.shape];
    const toPose = poses[to.shape];

    for (const channel of channels) {
      const value =
        (fromPose[channel] ?? 0) * (1 - alpha) +
        (toPose[channel] ?? 0) * alpha;
      curves[channel][frame] = clamp(value);
    }
  }

  return {
    fps,
    duration: frameCount / fps,
    n_frames: frameCount,
    arkit_raw: curves
  };
}

export function createEnvelopeFaceAnimation(
  samples: Float32Array,
  sampleRate: number,
  fps = 60
): FaceAnimationPayload | null {
  if (
    samples.length === 0 ||
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0 ||
    !Number.isFinite(fps) ||
    fps <= 0
  ) {
    return null;
  }

  const frameCount = Math.max(2, Math.ceil((samples.length / sampleRate) * fps));
  const windowSize = Math.max(16, Math.round(sampleRate * 0.02));
  const rmsValues = Array<number>(frameCount).fill(0);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const center = Math.floor((frame / fps) * sampleRate);
    const start = Math.max(0, center - Math.floor(windowSize / 2));
    const end = Math.min(samples.length, start + windowSize);
    let energy = 0;
    for (let index = start; index < end; index += 1) {
      energy += samples[index] * samples[index];
    }
    rmsValues[frame] = Math.sqrt(energy / Math.max(1, end - start));
  }

  const sorted = [...rmsValues].sort((left, right) => left - right);
  const noiseFloor = sorted[Math.floor(sorted.length * 0.15)] ?? 0;
  const speechPeak = Math.max(
    noiseFloor + 0.01,
    sorted[Math.floor(sorted.length * 0.95)] ?? 0.1
  );
  const curves = emptyCurves(frameCount);
  let smoothed = 0;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const normalized = clamp(
      (rmsValues[frame] - noiseFloor) / (speechPeak - noiseFloor)
    );
    const target = Math.pow(normalized, 0.62) * 0.78;
    smoothed = smoothed * 0.55 + target * 0.45;
    curves.JawOpen[frame] = smoothed;
    curves.MouthClose[frame] = clamp((0.08 - smoothed) * 7);
    curves.MouthFunnel[frame] = smoothed * 0.08;
  }

  return {
    fps,
    duration: frameCount / fps,
    n_frames: frameCount,
    arkit_raw: curves
  };
}

export async function decodeAudioEnvelope(
  audioBase64: string,
  mimeType: string
) {
  const binary = window.atob(audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const AudioContextClass =
    window.AudioContext ??
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;
  if (!AudioContextClass) return null;

  const context = new AudioContextClass();
  try {
    const decoded = await context.decodeAudioData(bytes.buffer.slice(0));
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const source = decoded.getChannelData(channel);
      for (let index = 0; index < source.length; index += 1) {
        mono[index] += source[index] / decoded.numberOfChannels;
      }
    }
    return createEnvelopeFaceAnimation(mono, decoded.sampleRate);
  } finally {
    await context.close();
    void mimeType;
  }
}
