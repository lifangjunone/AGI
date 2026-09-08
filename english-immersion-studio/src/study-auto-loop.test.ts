import { describe, expect, it } from "vitest";
import {
  buildStudyLoopSequence,
  findStudyLoopOrdinal,
  nextStudyLoopOrdinal
} from "./study-auto-loop";

describe("study auto loop", () => {
  it("plays every study module in the expected learning order", () => {
    const sequence = buildStudyLoopSequence({
      words: 2,
      structures: 1,
      grammar: 1,
      phrases: 1,
      collocations: 1
    });

    expect(sequence).toEqual([
      { module: "words", index: 0 },
      { module: "words", index: 1 },
      { module: "structures", index: 0 },
      { module: "grammar", index: 0 },
      { module: "phrases", index: 0 },
      { module: "collocations", index: 0 }
    ]);
  });

  it("skips empty modules and starts from the selected item", () => {
    const sequence = buildStudyLoopSequence({
      words: 0,
      structures: 1,
      grammar: 0,
      phrases: 2,
      collocations: 0
    });

    expect(findStudyLoopOrdinal(sequence, "phrases", 1)).toBe(2);
    expect(sequence).toHaveLength(3);
  });

  it("returns to the first item after the final item", () => {
    expect(nextStudyLoopOrdinal(6, 5)).toBe(0);
    expect(nextStudyLoopOrdinal(6, 2)).toBe(3);
    expect(nextStudyLoopOrdinal(0, 0)).toBe(0);
  });
});
