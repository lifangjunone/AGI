const { randomUUID } = require("node:crypto");
const { readFile, unlink } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { EdgeTTS } = require("node-edge-tts");
const voiceProfiles = require("./voice-profiles.json");

const profileById = new Map(voiceProfiles.map((profile) => [profile.id, profile]));
const audioCache = new Map();
const MAX_CACHE_ENTRIES = 40;
const MAX_TEXT_LENGTH = 1200;
const DEFAULT_LIPSYNC_URL = "http://127.0.0.1:8765";
const TEACHER_VOICE_ID = "ava-sweet";
const teachingDirections = {
  meaning: { rateAdjust: -4, pitch: "+0Hz" },
  usage: { rateAdjust: -2, pitch: "+0Hz" },
  example: { rateAdjust: 1, pitch: "+2Hz" },
  repeat: { rateAdjust: -9, pitch: "-2Hz" }
};

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function rateToPercent(speed, adjustment) {
  const safeSpeed = Math.min(1.3, Math.max(0.7, Number(speed) || 1));
  const percentage = Math.round((safeSpeed - 1) * 100 + adjustment);
  return `${percentage >= 0 ? "+" : ""}${percentage}%`;
}

function remember(key, value) {
  if (audioCache.size >= MAX_CACHE_ENTRIES) {
    audioCache.delete(audioCache.keys().next().value);
  }
  audioCache.set(key, value);
}

function createSpeechCacheKey(
  profileId,
  rate,
  text,
  includeFaceAnimation,
  purpose = "default",
  teachingCue = ""
) {
  const animationMode = includeFaceAnimation ? "face" : "audio";
  return `${profileId}:${rate}:${animationMode}:${purpose}:${teachingCue}:${text}`;
}

function resolveSpeechDirection(voiceId, speed, purpose, teachingCue) {
  const requestedProfile = profileById.get(voiceId);
  if (!requestedProfile) throw new Error("Unknown neural voice.");

  if (purpose !== "teaching") {
    return {
      profile: requestedProfile,
      rate: rateToPercent(speed, requestedProfile.rateAdjust),
      pitch: requestedProfile.pitch,
      purpose: "default",
      teachingCue: ""
    };
  }

  const teacherProfile = profileById.get(TEACHER_VOICE_ID) || requestedProfile;
  const cue = Object.hasOwn(teachingDirections, teachingCue)
    ? teachingCue
    : "meaning";
  const direction = teachingDirections[cue];
  return {
    profile: teacherProfile,
    rate: rateToPercent(speed, direction.rateAdjust),
    pitch: direction.pitch,
    purpose: "teaching",
    teachingCue: cue
  };
}

function normalizeTimeline(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((cue) => {
    const text = typeof cue?.part === "string" ? cue.part.trim() : "";
    const startMs = Math.max(0, Math.round(Number(cue?.start)));
    const endMs = Math.max(startMs, Math.round(Number(cue?.end)));
    return text && Number.isFinite(startMs) && Number.isFinite(endMs)
      ? [{ text, startMs, endMs }]
      : [];
  });
}

function normalizeFaceAnimation(value) {
  const frameCount = Number(value?.n_frames);
  const fps = Number(value?.fps);
  const duration = Number(value?.duration);
  const channels =
    value?.arkit_raw && typeof value.arkit_raw === "object"
      ? Object.entries(value.arkit_raw)
      : [];
  if (
    !Number.isInteger(frameCount) ||
    frameCount <= 0 ||
    frameCount > 60 * 120 ||
    !Number.isFinite(fps) ||
    fps <= 0 ||
    fps > 120 ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    channels.length === 0 ||
    channels.length > 81 ||
    !channels.every(
      ([name, values]) =>
        typeof name === "string" &&
        Array.isArray(values) &&
        values.length === frameCount &&
        values.every(Number.isFinite)
    )
  ) {
    return null;
  }
  return {
    fps,
    duration,
    n_frames: frameCount,
    arkit_raw: Object.fromEntries(channels)
  };
}

async function createFaceAnimation(audio, mimeType) {
  const endpoint =
    process.env.EIS_LIPSYNC_URL?.trim() || DEFAULT_LIPSYNC_URL;
  const form = new FormData();
  form.append(
    "audio",
    new Blob([audio], { type: mimeType }),
    mimeType === "audio/mpeg" ? "speech.mp3" : "speech.wav"
  );
  form.append("gain", "1.5");
  form.append("smooth_window", "3");
  form.append("include_audio", "false");
  form.append("mouth_only", "true");
  const response = await fetch(`${endpoint}/upload`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(60000)
  });
  if (!response.ok) {
    throw new Error(`Lip sync service returned HTTP ${response.status}.`);
  }
  const animation = normalizeFaceAnimation(await response.json());
  if (!animation) {
    throw new Error("Lip sync service returned invalid ARKit data.");
  }
  return animation;
}

async function getLipSyncHealth() {
  const endpoint =
    process.env.EIS_LIPSYNC_URL?.trim() || DEFAULT_LIPSYNC_URL;
  try {
    const response = await fetch(`${endpoint}/health`, {
      signal: AbortSignal.timeout(2500)
    });
    if (!response.ok) return { ready: false };
    const status = await response.json();
    return {
      ready: status?.status === "ready",
      device:
        typeof status?.device === "string" ? status.device : undefined,
      modelParams:
        Number.isFinite(status?.model_params_m)
          ? status.model_params_m
          : undefined
    };
  } catch {
    return { ready: false };
  }
}

async function synthesizeSpeech({
  text,
  voiceId,
  speed,
  includeFaceAnimation = true,
  purpose = "default",
  teachingCue = ""
}) {
  const cleanText = typeof text === "string" ? text.trim() : "";

  if (!cleanText || cleanText.length > MAX_TEXT_LENGTH) {
    throw new Error("Speech text must contain between 1 and 1200 characters.");
  }

  const direction = resolveSpeechDirection(
    voiceId,
    speed,
    purpose,
    teachingCue
  );
  const { profile, rate, pitch } = direction;
  const cacheKey = createSpeechCacheKey(
    profile.id,
    rate,
    cleanText,
    includeFaceAnimation,
    direction.purpose,
    direction.teachingCue
  );
  const cached = audioCache.get(cacheKey);
  if (cached) return { ...cached, cached: true };

  const tempPath = path.join(
    os.tmpdir(),
    `english-immersion-voice-${randomUUID()}.mp3`
  );
  const tts = new EdgeTTS({
    voice: profile.voice,
    lang: profile.voice.slice(0, 5),
    outputFormat: "audio-24khz-96kbitrate-mono-mp3",
    saveSubtitles: true,
    rate,
    pitch,
    volume: "+0%",
    timeout: 18000
  });
  let audio;
  let timeline = [];
  const subtitlePath = `${tempPath}.json`;
  try {
    await tts.ttsPromise(cleanText, tempPath);
    const [audioBuffer, subtitleBuffer] = await Promise.all([
      readFile(tempPath),
      readFile(subtitlePath, "utf8")
    ]);
    audio = audioBuffer;
    timeline = normalizeTimeline(JSON.parse(subtitleBuffer));
  } finally {
    await Promise.all([
      unlink(tempPath).catch(() => undefined),
      unlink(subtitlePath).catch(() => undefined)
    ]);
  }

  let faceAnimation = null;
  if (includeFaceAnimation) {
    try {
      faceAnimation = await createFaceAnimation(audio, "audio/mpeg");
    } catch (error) {
      console.warn(
        "Audio-driven face animation unavailable:",
        error instanceof Error ? error.message : error
      );
    }
  }

  const result = {
    audioBase64: audio.toString("base64"),
    mimeType: "audio/mpeg",
    provider: "edge-neural",
    timeline,
    faceAnimation,
    cached: false
  };
  remember(cacheKey, result);
  return result;
}

function registerTtsHandlers(ipcMain) {
  ipcMain.handle("tts:synthesize", (_event, payload) => synthesizeSpeech(payload ?? {}));
  ipcMain.handle("tts:lipsync-health", () => getLipSyncHealth());
}

module.exports = {
  createSpeechCacheKey,
  createFaceAnimation,
  escapeXml,
  getLipSyncHealth,
  normalizeFaceAnimation,
  normalizeTimeline,
  rateToPercent,
  registerTtsHandlers,
  resolveSpeechDirection,
  synthesizeSpeech
};
