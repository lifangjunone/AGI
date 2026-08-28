import { synthesizeSpeech } from "./api";
import { getLanguage } from "../data/languages";
import type { AccentPreference, LanguageCode } from "../types";

let activeAudio: HTMLAudioElement | undefined;
let activeUrl: string | undefined;
let requestSequence = 0;

function clearLocalAudio() {
  activeAudio?.pause();
  activeAudio = undefined;
  if (activeUrl) URL.revokeObjectURL(activeUrl);
  activeUrl = undefined;
}

function speakWithBrowser(
  text: string,
  accent: AccentPreference,
  language: LanguageCode,
  rate: number
) {
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang =
    language === "en"
      ? accent === "british"
        ? "en-GB"
        : "en-US"
      : getLanguage(language).speechTag;
  utterance.rate = rate;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeech() {
  requestSequence += 1;
  clearLocalAudio();
  window.speechSynthesis.cancel();
}

export async function speakText(
  text: string,
  accent: AccentPreference,
  language: LanguageCode = "en",
  options: { rate?: number } = {}
): Promise<"local" | "browser"> {
  const content = text.trim();
  if (!content) return "browser";
  const rate = Math.min(1.25, Math.max(0.6, options.rate ?? 0.92));

  stopSpeech();
  const requestId = requestSequence;
  try {
    const blob = await synthesizeSpeech({
      text: content,
      accent,
      language: getLanguage(language).asrLanguage.toLowerCase()
    });
    if (requestId !== requestSequence) return "local";

    activeUrl = URL.createObjectURL(blob);
    const audio = new Audio(activeUrl);
    activeAudio = audio;
    audio.playbackRate = rate / 0.92;
    audio.preservesPitch = true;
    audio.onended = clearLocalAudio;
    audio.onerror = clearLocalAudio;
    await audio.play();
    return "local";
  } catch {
    if (requestId === requestSequence) {
      clearLocalAudio();
      speakWithBrowser(content, accent, language, rate);
    }
    return "browser";
  }
}
