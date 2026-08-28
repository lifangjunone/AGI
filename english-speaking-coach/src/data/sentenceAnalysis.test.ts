import { describe, expect, it } from "vitest";
import { analyzeEnglishSentence } from "./sentenceAnalysis";

describe("analyzeEnglishSentence", () => {
  it("separates syntax roles from word-level pronunciation and grammar", () => {
    const analysis = analyzeEnglishSentence(
      "I like to eat fresh apples every morning."
    );

    expect(
      analysis.segments.map((segment) => ({
        role: segment.role,
        text: segment.words.map((word) => word.text).join(" ")
      }))
    ).toEqual([
      { role: "subject", text: "I" },
      { role: "predicate", text: "like to eat" },
      { role: "object", text: "fresh apples" },
      { role: "adverbial", text: "every morning" }
    ]);

    const words = analysis.segments.flatMap((segment) => segment.words);
    expect(words.find((word) => word.normalized === "i")).toMatchObject({
      ipa: "/aɪ/",
      meaning: "我",
      partOfSpeech: "代词"
    });
    expect(words.find((word) => word.normalized === "to")).toMatchObject({
      ipa: "/tə/",
      meaning: "不定式标记",
      partOfSpeech: "助词",
      stress: "弱读"
    });
    expect(words.find((word) => word.normalized === "apples")).toMatchObject({
      ipa: "/ˈæpəlz/",
      meaning: "苹果（复数）",
      partOfSpeech: "名词"
    });
  });

  it("surfaces weak forms and connected speech without inventing IPA", () => {
    const analysis = analyzeEnglishSentence(
      "I like to eat fresh apples every morning."
    );

    expect(
      analysis.pronunciationFeatures.some(
        (feature) =>
          feature.label === "弱读" && feature.detail.includes("to:")
      )
    ).toBe(true);
    expect(
      analysis.pronunciationFeatures.some(
        (feature) =>
          feature.label === "连读" && feature.detail.includes("apples‿every")
      )
    ).toBe(true);

    const unknown = analyzeEnglishSentence("I frobnicate daily.");
    expect(
      unknown.segments
        .flatMap((segment) => segment.words)
        .find((word) => word.normalized === "frobnicate")
    ).toMatchObject({
      ipa: "点按听音",
      partOfSpeech: "待分析"
    });
  });

  it("keeps a long reinforcement sentence in compact, accurate role groups", () => {
    const analysis = analyzeEnglishSentence(
      "I choose fresh apples because they are easy to prepare every morning."
    );

    expect(
      analysis.segments.map((segment) => ({
        role: segment.role,
        text: segment.words.map((word) => word.text).join(" ")
      }))
    ).toEqual([
      { role: "subject", text: "I" },
      { role: "predicate", text: "choose" },
      { role: "object", text: "fresh apples" },
      {
        role: "adverbial",
        text: "because they are easy to prepare every morning"
      }
    ]);
  });
});
