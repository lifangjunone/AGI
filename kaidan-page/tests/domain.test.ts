import { describe, expect, it } from "vitest";
import {
  emptyOffer,
  exportHtml,
  readiness,
  revenueProjection,
  shareCopy,
  templates,
} from "../src/domain";

describe("offer readiness", () => {
  it("marks a complete template ready to publish", () => {
    expect(readiness(templates.career)).toEqual({ score: 100, missing: [] });
  });

  it("lists missing content for an empty offer", () => {
    const result = readiness(emptyOffer);
    expect(result.score).toBe(0);
    expect(result.missing).toContain("服务名称");
    expect(result.missing).toContain("至少两项交付");
  });
});

describe("revenue projection", () => {
  it("calculates free-plan transaction fees", () => {
    const result = revenueProjection(templates.career, 10, false);
    expect(result.gross).toBe(1990);
    expect(result.platformFee).toBe(59.7);
    expect(result.net).toBe(1930.3);
    expect(result.overCapacity).toBe(false);
  });

  it("uses a fixed Pro subscription and warns above capacity", () => {
    const result = revenueProjection(templates.automation, 12, true);
    expect(result.platformFee).toBe(29);
    expect(result.overCapacity).toBe(true);
    expect(result.hours).toBe(48);
  });
});

describe("share and export", () => {
  it("creates launch copy from the offer", () => {
    const copy = shareCopy(templates.design);
    expect(copy).toContain("小红书首图焕新");
    expect(copy).toContain("16 个名额");
  });

  it("escapes user content in exported HTML", () => {
    const html = exportHtml({
      ...templates.career,
      serviceName: "<script>alert(1)</script>",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("用「开单页」创建");
  });
});
