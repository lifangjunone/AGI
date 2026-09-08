import { describe, expect, it } from "vitest";
import {
  buildDailyPracticePlan,
  buildRecommendations,
  initialLearningProfile,
  updateLearningProfile
} from "./recommendations";

describe("adaptive scene recommendations", () => {
  it("ranks the weakest skill first", () => {
    const recommendations = buildRecommendations(
      {
        ...initialLearningProfile,
        accuracy: 43,
        fluency: 86,
        expression: 82,
        vocabulary: 79
      },
      "B1"
    );
    expect(recommendations[0].focus).toBe("accuracy");
    expect(recommendations[0].scenario.title).toBe("The Booking Mix-Up");
    expect(recommendations[0].reason).toContain("43");
  });

  it("updates the learning profile from the latest answer", () => {
    const profile = updateLearningProfile(
      initialLearningProfile,
      { fluency: 70, accuracy: 74, expression: 67 },
      "I agree because the result was clear."
    );
    expect(profile.turns).toBe(1);
    expect(profile.averageWords).toBe(7);
    expect(profile.connectorUses).toBe(1);
    expect(profile.vocabulary).toBeGreaterThan(70);
  });

  it("provides bilingual content and an adaptive difficulty", () => {
    const recommendation = buildRecommendations(initialLearningProfile, "B2")[0];
    expect(recommendation.scenario.openingChinese).toBeTruthy();
    expect(recommendation.scenario.suggestionChinese).toHaveLength(3);
    expect(["B2", "C1"]).toContain(recommendation.difficulty);
  });

  it("builds a daily plan around the weakest skill and selected duration", () => {
    const plan = buildDailyPracticePlan(
      {
        ...initialLearningProfile,
        expression: 48,
        fluency: 81,
        accuracy: 78,
        vocabulary: 74
      },
      "B2",
      30
    );
    expect(plan.focus).toBe("expression");
    expect(plan.duration).toBe(30);
    expect(plan.steps.map((step) => step.minutes)).toEqual([6, 18, 6]);
    expect(plan.steps.reduce((total, step) => total + step.minutes, 0)).toBe(30);
  });
});
