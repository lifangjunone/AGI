import { describe, expect, it } from "vitest";
import { getSentenceFrame, isSentenceFrame } from "./sentenceFrames";

describe("sentence frames", () => {
  it("turns an open frame into a complete bilingual usage example", () => {
    expect(getSentenceFrame("I work in ...")).toEqual({
      frame: "I work in ...",
      example: "I work in product design for a technology company.",
      translation: "我在一家科技公司从事产品设计工作。",
      slot: "行业 / 职能 / 工作领域",
      usage: "自我介绍时说明职业领域"
    });
  });

  it("recognizes both three-dot and ellipsis placeholders", () => {
    expect(isSentenceFrame("The main reason is ...")).toBe(true);
    expect(isSentenceFrame("我的意思是……")).toBe(true);
    expect(isSentenceFrame("Could you say that again?")).toBe(false);
  });
});
