import { describe, expect, it } from "vitest";
import {
  emptyOffer,
  exportHtml,
  normalizeOffer,
  pricingHealth,
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
    expect(result.score).toBe(20);
    expect(result.missing).toContain("服务名称");
    expect(result.missing).toContain("联系方式");
    expect(result.missing).toContain("至少两项交付");
  });

  it("migrates a saved v1 offer without losing its content", () => {
    const migrated = normalizeOffer({
      ...templates.career,
      serviceName: "旧草稿",
      contactLabel: undefined,
      contactValue: undefined,
      ctaText: undefined,
    });
    expect(migrated.serviceName).toBe("旧草稿");
    expect(migrated.contactLabel).toBe("微信");
    expect(migrated.ctaText).toBe("咨询下单");
  });
});

describe("pricing health", () => {
  it("accepts ascending package prices", () => {
    expect(pricingHealth(templates.career).ascending).toBe(true);
  });

  it("flags inverted package prices", () => {
    const inverted = {
      ...templates.career,
      packages: [
        templates.career.packages[0],
        { ...templates.career.packages[1], price: 20 },
        templates.career.packages[2],
      ],
    } as typeof templates.career;
    expect(pricingHealth(inverted).ascending).toBe(false);
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
    expect(html).toContain("linxiao-career");
    expect(html).toContain("2 天内交付");
    expect(html).toContain("用「开单页」创建");
  });
});
