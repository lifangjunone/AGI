import { describe, expect, it } from "vitest";
import { personas, scenarios } from "./data";
import { createScenarioDialogueReply } from "./scenario-dialogue";

describe("scenario dialogue engine", () => {
  it("continues a restaurant request with a relevant follow-up", () => {
    const reply = createScenarioDialogueReply(
      "What do you recommend?",
      scenarios.find((scenario) => scenario.id === "restaurant")!,
      personas[0],
      "B2"
    );
    expect(reply.english).toContain("sea bass");
    expect(reply.english).toContain("lighter");
    expect(reply.suggestions).toHaveLength(2);
  });

  it("uses the learner's unsupported answer instead of a generic static reply", () => {
    const reply = createScenarioDialogueReply(
      "I moved to London for the weather.",
      scenarios.find((scenario) => scenario.id === "interview")!,
      personas[0],
      "B2"
    );
    expect(reply.english).toContain("I heard you say");
    expect(reply.english).not.toContain("Tell me a little more");
  });

  it("keeps a bilingual contextual follow-up for booking details", () => {
    const reply = createScenarioDialogueReply(
      "The reservation is under Li.",
      scenarios.find((scenario) => scenario.id === "hotel")!,
      personas[0],
      "B2"
    );
    expect(reply.english).toContain("arrival date");
    expect(reply.chinese).toContain("抵达日期");
  });
});
