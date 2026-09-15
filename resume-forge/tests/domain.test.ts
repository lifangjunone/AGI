import { describe, expect, it } from "vitest";
import {
  analyzeBullet,
  analyzeMatch,
  buildEvidenceBullet,
  documentHealth,
  emptyResume,
  exportResumeHtml,
  extractKeywords,
  normalizeResume,
  sampleResume,
} from "../src/domain";

describe("job matching", () => {
  it("extracts known Chinese and English job keywords", () => {
    const keywords = extractKeywords("负责产品规划、用户研究、SQL 数据分析与 AI 产品");
    expect(keywords).toEqual(
      expect.arrayContaining(["产品规划", "用户研究", "数据分析", "SQL", "AI"]),
    );
  });

  it("separates matched and missing evidence", () => {
    const result = analyzeMatch(sampleResume);
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.matched).toContain("产品规划");
    expect(result.missing).toContain("需求分析");
  });

  it("does not award an empty resume a useful score", () => {
    expect(analyzeMatch(emptyResume).score).toBe(0);
  });
});

describe("experience evidence", () => {
  it("scores an action, metric, impact, and concise bullet at 100", () => {
    expect(
      analyzeBullet("主导企业 AI 产品上线，覆盖 6 个部门，交付周期缩短 40%。").score,
    ).toBe(100);
  });

  it("flags a vague responsibility statement", () => {
    const result = analyzeBullet("参与相关工作");
    expect(result.score).toBeLessThanOrEqual(25);
    expect(result.checks.find((item) => item.label === "包含数字")?.passed).toBe(false);
  });

  it("builds only from supplied evidence", () => {
    expect(
      buildEvidenceBullet({
        action: "优化",
        task: "客户上线流程",
        metric: "覆盖 12 家客户",
        result: "交付周期缩短 30%",
      }),
    ).toBe("优化客户上线流程，覆盖 12 家客户，交付周期缩短 30%。");
  });
});

describe("document output", () => {
  it("reports the sample as one-page likely", () => {
    const health = documentHealth(sampleResume);
    expect(health.onePageLikely).toBe(true);
    expect(health.averageBulletScore).toBeGreaterThanOrEqual(75);
  });

  it("migrates partial drafts", () => {
    const migrated = normalizeResume({ name: "测试用户", experiences: [] });
    expect(migrated.name).toBe("测试用户");
    expect(migrated.experiences).toHaveLength(1);
  });

  it("escapes content in exported HTML", () => {
    const html = exportResumeHtml({ ...sampleResume, name: "<script>alert(1)</script>" });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Experience / 工作经历");
  });
});
