import { describe, expect, it } from "vitest";
import { digitalStageFromLearning, stageFromEvidence } from "./agent-society.js";

describe("AgentSociety deterministic rules", () => {
  it("does not advance a relationship without repeated reciprocal evidence", () => {
    expect(stageFromEvidence(12, 0, "stranger")).toBe("stranger");
    expect(stageFromEvidence(2, 2, "stranger")).toBe("stranger");
    expect(stageFromEvidence(3, 1, "stranger")).toBe("acquainted");
  });

  it("never promotes consensual stages from interaction counters", () => {
    expect(stageFromEvidence(100, 100, "acquainted")).toBe("acquainted");
    expect(stageFromEvidence(100, 100, "friend")).toBe("friend");
    expect(stageFromEvidence(100, 100, "partner")).toBe("partner");
  });

  it("requires accumulated learning evidence before growth stages advance", () => {
    expect(digitalStageFromLearning(0, 0)).toBe("newborn");
    expect(digitalStageFromLearning(2, 79)).toBe("newborn");
    expect(digitalStageFromLearning(2, 80)).toBe("child");
    expect(digitalStageFromLearning(6, 330)).toBe("student");
    expect(digitalStageFromLearning(14, 910)).toBe("adolescent");
    expect(digitalStageFromLearning(24, 1680)).toBe("adult");
  });
});
