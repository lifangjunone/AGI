import { describe, expect, it } from "vitest";
import { personas, scenarios } from "./data";
import {
  analyzeStructure,
  analyzeWords,
  createOpening,
  createReplyLine,
  createSuggestions,
  difficultyProfiles,
  splitLocalizedLine,
  subtitleLines,
  subtitleModes
} from "./language";
import { getListeningDialogue } from "./listening-dialogues";

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
    expect(words.every((word) => word.root && word.rootMeaning)).toBe(true);
  });

  it("pairs bilingual content as individual sentence units", () => {
    expect(
      splitLocalizedLine({
        english: "That is clear. Tell me more.",
        chinese: "这很清楚。请再多说一点。"
      })
    ).toEqual([
      { english: "That is clear.", chinese: "这很清楚。" },
      { english: "Tell me more.", chinese: "请再多说一点。" }
    ]);
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
    expect(analysis.segments.map((segment) => segment.role)).toContain(
      "宾语/补充"
    );
    expect(analysis.skeleton).toContain("主语");
    expect(analysis.imitation).toContain("[替换最后的具体信息]");
  });

  it("overrides dictionary meanings for the phrase context", () => {
    const words = analyzeWords("I have been looking forward to meeting you.");
    const forward = words.find((word) => word.normalized === "forward");
    const to = words.find((word) => word.normalized === "to");
    expect(forward?.meaning).toContain("期待");
    expect(forward?.phrase).toContain("look forward to");
    expect(to?.meaning).toContain("动名词");
    expect(forward?.root).toBe("forward");
    expect(words.find((word) => word.normalized === "looking")?.root).toBe(
      "look"
    );
  });

  it("provides real Chinese meanings for every scene-listening word", () => {
    const words = scenarios.flatMap((scenario) =>
      getListeningDialogue(scenario.id).flatMap((line) =>
        analyzeWords(line.english)
      )
    );
    const missing = [
      ...new Set(
        words
          .filter((word) => word.part === "待补充")
          .map((word) => word.normalized)
      )
    ].sort();
    expect(missing).toEqual([]);
    expect(
      words.some((word) => word.meaning.includes("当前句中的语境义"))
    ).toBe(false);
    expect(
      words
        .filter((word) => word.part !== "专有名词")
        .every(
          (word) =>
            /^\/.+\/$/.test(word.ipa) &&
            word.phrase.length > 0 &&
            word.exampleEnglish.length > 0
        )
    ).toBe(true);
  });

  it("explains slightly with its core meaning and word formation", () => {
    const slightly = analyzeWords(
      "I felt slightly nauseous this morning."
    ).find((word) => word.normalized === "slightly");
    expect(slightly?.meaning).toBe("稍微；有点");
    expect(slightly?.part).toBe("副词");
    expect(slightly?.root).toBe("slight");
    expect(slightly?.rootMeaning).toBe("轻微的；少量的");
    expect(slightly?.formation).toContain("-ly");
  });

  it("includes IPA, a useful phrase, and a simple example for opportunity", () => {
    const opportunity = analyzeWords(
      "Thank you for giving me the opportunity."
    ).find((word) => word.normalized === "opportunity");
    expect(opportunity?.ipa).toBe("/ˌɑpɚˈtunəti/");
    expect(opportunity?.part).toBe("名词");
    expect(opportunity?.phrase).toContain("an opportunity to");
    expect(opportunity?.exampleEnglish).toBe(
      "This is a good opportunity to learn."
    );
    expect(opportunity?.exampleChinese).toBe("这是一个很好的学习机会。");
  });
});
