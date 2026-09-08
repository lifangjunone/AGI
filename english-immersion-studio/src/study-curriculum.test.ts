import { describe, expect, it } from "vitest";
import { getListeningDialogue } from "./listening-dialogues";
import { buildStudyCurriculum } from "./study-curriculum";

describe("study curriculum", () => {
  const curriculum = buildStudyCurriculum(getListeningDialogue("interview"));

  it("builds all five learning modules from the real scene dialogue", () => {
    expect(curriculum.words.length).toBeGreaterThan(40);
    expect(curriculum.structures.length).toBe(30);
    expect(curriculum.grammar.length).toBeGreaterThan(5);
    expect(curriculum.phrases.length).toBeGreaterThan(10);
    expect(curriculum.collocations.length).toBeGreaterThan(3);
  });

  it("keeps complete vocabulary learning details", () => {
    const opportunity = curriculum.words.find(
      (word) => word.normalized === "opportunity"
    );
    expect(opportunity?.ipa).toBe("/ˌɑpɚˈtunəti/");
    expect(opportunity?.meaning).toBe("机会");
    expect(opportunity?.phrase).toContain("an opportunity to");
    expect(opportunity?.exampleEnglish).toContain("opportunity");
  });

  it("distinguishes sentence phrases from fixed collocations", () => {
    expect(
      curriculum.phrases.some((phrase) => phrase.text === "by telling me about your")
    ).toBe(true);
    expect(
      curriculum.collocations.some((phrase) =>
        phrase.text.includes("an opportunity to do something")
      )
    ).toBe(true);
    expect(
      curriculum.collocations.some((phrase) => phrase.text.includes("本句搭配"))
    ).toBe(false);
  });

  it("extracts grammar rules with authentic scene examples", () => {
    const byGerund = curriculum.grammar.find(
      (item) => item.title === "by + 动名词表示方式"
    );
    expect(byGerund?.formula).toBe("by + V-ing");
    expect(byGerund?.line.english).toContain("begin by telling");
  });

  it("provides every learning module in all six scenarios", () => {
    const scenarioIds = [
      "interview",
      "restaurant",
      "hotel",
      "small-talk",
      "clinic",
      "airport"
    ] as const;
    scenarioIds.forEach((scenarioId) => {
      const scene = buildStudyCurriculum(getListeningDialogue(scenarioId));
      expect(scene.words.length, scenarioId).toBeGreaterThan(0);
      expect(scene.structures.length, scenarioId).toBeGreaterThan(0);
      expect(scene.grammar.length, scenarioId).toBeGreaterThan(0);
      expect(scene.phrases.length, scenarioId).toBeGreaterThan(0);
      expect(scene.collocations.length, scenarioId).toBeGreaterThan(0);
    });
  });
});
