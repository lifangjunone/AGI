import { describe, expect, it } from "vitest";
import { scenarios } from "./data";
import {
  getListeningDialogue,
  getListeningProgress,
  listeningRounds
} from "./listening-dialogues";

describe("scene listening practice", () => {
  it("provides a two-speaker bilingual dialogue for every scene", () => {
    for (const scenario of scenarios) {
      const dialogue = getListeningDialogue(scenario.id);
      expect(dialogue.length).toBeGreaterThanOrEqual(20);
      expect(new Set(dialogue.map((line) => line.speaker))).toEqual(
        new Set(["host", "guest"])
      );
      expect(dialogue.every((line) => line.english && line.chinese)).toBe(true);
    }
  });

  it("uses the required four-pass subtitle sequence", () => {
    expect(listeningRounds.map((round) => round.subtitleMode)).toEqual([
      "none",
      "english",
      "en-zh",
      "none"
    ]);
  });

  it("calculates progress across all four passes", () => {
    expect(getListeningProgress(0, 0, 24)).toBe(0);
    expect(getListeningProgress(2, 0, 24)).toBe(50);
    expect(getListeningProgress(3, 23, 24)).toBe(99);
  });
});
