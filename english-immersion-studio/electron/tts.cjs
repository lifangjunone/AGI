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

async function synthesizeSpeech({ text, voiceId, speed }) {
  const cleanText = typeof text === "string" ? text.trim() : "";
  const profile = profileById.get(voiceId);

  if (!cleanText || cleanText.length > MAX_TEXT_LENGTH) {
    throw new Error("Speech text must contain between 1 and 1200 characters.");
  }
  if (!profile) {
    throw new Error("Unknown neural voice.");
  }

  const rate = rateToPercent(speed, profile.rateAdjust);
  const cacheKey = `${profile.id}:${rate}:${cleanText}`;
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
    saveSubtitles: false,
    rate,
    pitch: profile.pitch,
    volume: "+0%",
    timeout: 18000
  });
  let audio;
  try {
    await tts.ttsPromise(cleanText, tempPath);
    audio = await readFile(tempPath);
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }

  const result = {
    audioBase64: audio.toString("base64"),
    mimeType: "audio/mpeg",
    provider: "edge-neural",
    cached: false
  };
  remember(cacheKey, result);
  return result;
}

function registerTtsHandlers(ipcMain) {
  ipcMain.handle("tts:synthesize", (_event, payload) => synthesizeSpeech(payload ?? {}));
}

module.exports = {
  escapeXml,
  rateToPercent,
  registerTtsHandlers,
  synthesizeSpeech
};
