import { describe, expect, it } from "vitest";
import {
  createReply,
  outfits,
  personas,
  scenarios,
  scoreUtterance
} from "./data";

describe("immersion content", () => {
  it("covers the requested real-world scenarios", () => {
    expect(scenarios.map((scenario) => scenario.id)).toEqual(
      expect.arrayContaining(["interview", "restaurant", "hotel", "small-talk"])
    );
  });

  it("provides a varied cosplay wardrobe", () => {
    expect(outfits.map((outfit) => outfit.id)).toEqual(
      expect.arrayContaining([
        "doctor",
        "nurse",
        "cabin",
        "hanfu",
        "teacher",
        "academy",
        "turtleneck",
        "editorial",
        "anime"
      ])
    );
    expect(outfits.find((outfit) => outfit.id === "academy")?.prompt).toContain("21 or older");
  });

  it("generates a contextual follow-up", () => {
    const reply = createReply("Could I request a quiet room?", scenarios[2], personas[0]);
    expect(reply).toContain("away from the elevators");
  });

  it("rewards longer connected and polite responses", () => {
    const shortScore = scoreUtterance("Yes");
    const detailedScore = scoreUtterance(
      "Could you recommend this dish because I would prefer something light?"
    );
    expect(detailedScore.fluency).toBeGreaterThan(shortScore.fluency);
    expect(detailedScore.expression).toBeGreaterThan(shortScore.expression);
  });

  it("uses bundled scene images without runtime generation requests", () => {
    scenarios.forEach((scenario) => {
      expect(scenario.image).toMatch(/scenes\/[a-z-]+\.jpg$/);
      expect(scenario.image).not.toMatch(/^https?:/);
    });
  });
});
