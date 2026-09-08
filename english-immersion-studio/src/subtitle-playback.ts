import type { SpeechWordBoundary } from "./metahuman-protocol";

export type SubtitleFocus = {
  words: SpeechWordBoundary[];
  activeIndex: number;
  sentenceIndex: number;
  hasLeadingWords: boolean;
  hasTrailingWords: boolean;
};

export function getActiveBoundaryIndex(
  timeline: SpeechWordBoundary[],
  currentMs: number
) {
  if (!timeline.length || !Number.isFinite(currentMs) || currentMs < 0) {
    return -1;
  }
  const direct = timeline.findIndex(
    (boundary) =>
      currentMs >= boundary.startMs && currentMs <= boundary.endMs
  );
  if (direct >= 0) return direct;
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    if (currentMs >= timeline[index].startMs) return index;
  }
  return -1;
}

export function createSubtitleFocus(
  timeline: SpeechWordBoundary[],
  activeIndex: number
): SubtitleFocus {
  if (!timeline.length || activeIndex < 0) {
    return {
      words: [],
      activeIndex: -1,
      sentenceIndex: 0,
      hasLeadingWords: false,
      hasTrailingWords: false
    };
  }
  const sentenceEndPattern = /[.!?]["'”’)]?$/;
  let sentenceStart = 0;
  let sentenceIndex = 0;
  for (let index = activeIndex - 1; index >= 0; index -= 1) {
    if (sentenceEndPattern.test(timeline[index].text)) {
      sentenceStart = index + 1;
      break;
    }
  }
  for (let index = 0; index < sentenceStart; index += 1) {
    if (sentenceEndPattern.test(timeline[index].text)) sentenceIndex += 1;
  }
  let sentenceEnd = timeline.length;
  for (let index = activeIndex; index < timeline.length; index += 1) {
    if (sentenceEndPattern.test(timeline[index].text)) {
      sentenceEnd = index + 1;
      break;
    }
  }
  const words = timeline.slice(sentenceStart, sentenceEnd);
  return {
    words,
    activeIndex: activeIndex - sentenceStart,
    sentenceIndex,
    hasLeadingWords: false,
    hasTrailingWords: false
  };
}

export function createEstimatedTimeline(text: string, wordsPerMinute = 150) {
  const words = text.match(/\S+/g) ?? [];
  const wordMs = 60_000 / Math.max(80, wordsPerMinute);
  return words.map((word, index) => ({
    text: word,
    startMs: Math.round(index * wordMs),
    endMs: Math.round((index + 0.9) * wordMs)
  }));
}
