import { describe, expect, it } from "vitest";
import {
  createEstimatedTimeline,
  createSubtitleFocus,
  getActiveBoundaryIndex
} from "./subtitle-playback";

const timeline = [
  { text: "Good", startMs: 0, endMs: 200 },
  { text: "morning.", startMs: 220, endMs: 500 },
  { text: "Shall", startMs: 540, endMs: 720 },
  { text: "we", startMs: 730, endMs: 820 },
  { text: "begin?", startMs: 830, endMs: 1100 }
];

describe("subtitle playback", () => {
  it("tracks the spoken word and holds the latest word between boundaries", () => {
    expect(getActiveBoundaryIndex(timeline, 100)).toBe(0);
    expect(getActiveBoundaryIndex(timeline, 510)).toBe(1);
    expect(getActiveBoundaryIndex(timeline, 900)).toBe(4);
  });

  it("shows the complete current sentence around the active word", () => {
    const focus = createSubtitleFocus(timeline, 3);
    expect(focus.words.map((word) => word.text)).toEqual([
      "Shall",
      "we",
      "begin?"
    ]);
    expect(focus.activeIndex).toBe(1);
    expect(focus.sentenceIndex).toBe(1);
    expect(focus.hasLeadingWords).toBe(false);
  });

  it("never mixes words from adjacent sentences", () => {
    expect(
      createSubtitleFocus(timeline, 1).words.map((word) => word.text)
    ).toEqual(["Good", "morning."]);
    expect(
      createSubtitleFocus(timeline, 2).words.map((word) => word.text)
    ).toEqual(["Shall", "we", "begin?"]);
    expect(createSubtitleFocus(timeline, 1).sentenceIndex).toBe(0);
    expect(createSubtitleFocus(timeline, 2).sentenceIndex).toBe(1);
  });

  it("builds a usable fallback timeline from plain text", () => {
    expect(createEstimatedTimeline("Speak clearly today.")).toHaveLength(3);
  });
});
