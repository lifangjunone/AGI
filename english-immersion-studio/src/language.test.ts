import { describe, expect, it } from "vitest";
import { personas, scenarios } from "./data";
import {
  analyzeStructure,
  analyzeWords,
  createOpening,
  createReplyLine,
  createSuggestions,
  difficultyProfiles,
  subtitleLines,
  subtitleModes
} from "./language";

describe("adaptive language learning", () => {
  it("supports all CEFR difficulty levels", () => {
    const a1 = createOpening(scenarios[0], "A1");
    const c2 = createOpening(scenarios[0], "C2");
    expect(a1.english.split(/\s+/).length).toBeLessThan(c2.english.split(/\s+/).length);
    expect(c2.english).toContain("challenge your assumptions");
  });

  it("provides five subtitle arrangements", () => {
    expect(subtitleModes).toHaveLength(5);
    const line = { english: "Good morning.", chinese: "早上好。" };
    expect(subtitleLines(line, "none")).toEqual([]);
    expect(subtitleLines(line, "en-zh").map((item) => item.lang)).toEqual(["en", "zh"]);
    expect(subtitleLines(line, "zh-en").map((item) => item.lang)).toEqual(["zh", "en"]);
  });

  it("returns contextual bilingual replies", () => {
    const reply = createReplyLine(
      "Could I request a quiet room?",
      scenarios[2],
      personas[0],
      "B2"
    );
    expect(reply.english).toContain("away from the elevators");
    expect(reply.chinese).toContain("远离电梯");
  });

  it("analyzes every token with pronunciation and meaning", () => {
    const words = analyzeWords("Could you explain the project?");
    expect(words.map((word) => word.word)).toEqual([
      "Could",
      "you",
      "explain",
      "the",
      "project"
    ]);
    expect(words.every((word) => word.ipa !== "/—/" && word.meaning)).toBe(true);
  });

  it("covers every word used by the scripted openings and prompts", () => {
    const lines = difficultyProfiles.flatMap((profile) =>
      scenarios.flatMap((scenario) => [
        createOpening(scenario, profile.id).english,
        ...createSuggestions(scenario, profile.id).map((line) => line.english)
      ])
    );
    const missing = [
      ...new Set(
        lines.flatMap((line) =>
          analyzeWords(line)
            .filter((word) => word.ipa === "/—/")
            .map((word) => word.word.toLowerCase())
        )
      )
    ].sort();
    expect(missing).toEqual([]);
  });

  it("identifies sentence structure", () => {
    const analysis = analyzeStructure("Could you explain the project?");
    expect(analysis.sentenceType).toBe("疑问句");
    expect(analysis.pattern).toContain("情态动词");
    expect(analysis.segments.map((segment) => segment.role)).toContain("主语");
  });

  it("overrides dictionary meanings for the phrase context", () => {
    const words = analyzeWords("I have been looking forward to meeting you.");
    const forward = words.find((word) => word.normalized === "forward");
    const to = words.find((word) => word.normalized === "to");
    expect(forward?.meaning).toContain("期待");
    expect(forward?.phrase).toContain("look forward to");
    expect(to?.meaning).toContain("动名词");
  });
});
