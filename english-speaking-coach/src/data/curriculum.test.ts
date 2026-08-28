import { describe, expect, it } from "vitest";
import {
  applyEvolutionToPlan,
  createDailyTasks,
  createFallbackPlan,
  emptyProgress,
  getFirstReviewAt,
  getNextReview
} from "./curriculum";
import type { EvolutionResult, LearnerProfile } from "../types";

const profile: LearnerProfile = {
  name: "Lin",
  level: "A2",
  goal: "work",
  minutesPerDay: 45,
  accent: "american",
  nativeLanguage: "zh-CN",
  targetLanguage: "en",
  createdAt: new Date().toISOString()
};

describe("curriculum", () => {
  it("creates a complete 24-week fallback plan", () => {
    const plan = createFallbackPlan(profile);

    expect(plan.weeks).toHaveLength(24);
    expect(plan.weeks[0].week).toBe(1);
    expect(plan.weeks[23].week).toBe(24);
    expect(new Set(plan.weeks.map((week) => week.phase))).toHaveLength(6);
    expect(plan.weeks.every((week) => week.chunks.length >= 3)).toBe(true);
    expect(plan.weeks[0].lesson?.dialogues.length).toBeGreaterThanOrEqual(3);
    expect(plan.weeks[0].lesson?.vocabulary).toHaveLength(4);
    expect(plan.weeks[0].lesson?.outputDrills.length).toBeGreaterThan(0);
    expect(plan.weeks[0].lesson?.flashcards).toHaveLength(4);
  });

  it("builds target-language chunks for a multilingual plan", () => {
    const plan = createFallbackPlan({
      ...profile,
      targetLanguage: "ja"
    });

    expect(plan.title).toContain("日语");
    expect(plan.weeks[0].chunks).toContain("少し考えさせてください。");
  });

  it("applies Hermes changes to the future route and rebuilds lesson material", () => {
    const plan = createFallbackPlan(profile);
    const result: EvolutionResult = {
      insight: {
        id: "hermes-1",
        generatedAt: "2026-08-17T00:00:00.000Z",
        source: "hermes-agent",
        summary: "优先解决回答过短和缺少具体例子。",
        strengths: ["核心意思清楚"],
        focusAreas: [
          {
            area: "持续表达",
            evidence: "最近三次回答都少于20词。",
            priority: "high"
          }
        ],
        nextActions: ["使用结论、理由、例子三步结构"],
        routeChanges: [
          {
            week: 1,
            previousTheme: plan.weeks[0].theme,
            newTheme: "连续表达强化",
            reason: "回答过短"
          }
        ],
        analyzedRecordCount: 3
      },
      weekAdjustments: [
        {
          week: 1,
          theme: "连续表达强化",
          outcome: "围绕一个话题连续表达两分钟并给出例子",
          chunks: [
            "The main point is ...",
            "The reason is ...",
            "For example, ...",
            "What I learned was ..."
          ],
          reason: "回答过短"
        }
      ]
    };

    const evolved = applyEvolutionToPlan(profile, plan, result);

    expect(evolved.generatedBy).toBe("hermes");
    expect(evolved.summary).toBe(result.insight.summary);
    expect(evolved.weeks[0].theme).toBe("连续表达强化");
    expect(evolved.weeks[0].lesson?.roles[0].description).toContain(
      "连续表达强化"
    );
    expect(evolved.weeks[1]).toEqual(plan.weeks[1]);
  });

  it("creates the five-step daily speaking loop", () => {
    const plan = createFallbackPlan(profile);
    const tasks = createDailyTasks(profile, plan, emptyProgress);

    expect(tasks.map((task) => task.type)).toEqual([
      "input",
      "shadow",
      "chunks",
      "free-speak",
      "roleplay"
    ]);
    expect(tasks.reduce((sum, task) => sum + task.minutes, 0)).toBeGreaterThanOrEqual(
      profile.minutesPerDay
    );
  });

  it("marks persisted task completion", () => {
    const plan = createFallbackPlan(profile);
    const first = createDailyTasks(profile, plan, emptyProgress)[0];
    const tasks = createDailyTasks(profile, plan, {
      ...emptyProgress,
      completedTaskIds: [first.id]
    });

    expect(tasks[0].completed).toBe(true);
    expect(tasks.slice(1).every((task) => !task.completed)).toBe(true);
  });

  it("surfaces chunks that are due for spaced review", () => {
    const plan = createFallbackPlan(profile);
    const dueChunk = "The main reason is ...";
    const tasks = createDailyTasks(profile, plan, {
      ...emptyProgress,
      knownChunks: [
        {
          text: dueChunk,
          learnedAt: "2026-01-01T00:00:00.000Z",
          reviewStep: 0,
          nextReviewAt: "2026-01-02T00:00:00.000Z"
        }
      ]
    });

    expect(tasks.find((task) => task.type === "chunks")?.description).toContain(
      "1 个到期表达"
    );
    const chunkTask = tasks.find((task) => task.type === "chunks");
    expect(chunkTask?.practiceItems?.[0]).toBe(dueChunk);
    expect(chunkTask?.practiceItems).toContain(plan.weeks[0].chunks[0]);
    expect(new Set(chunkTask?.practiceItems).size).toBe(
      chunkTask?.practiceItems?.length
    );
  });

  it("schedules chunk reviews at 1, 3, 7 and 14 day intervals", () => {
    const now = new Date("2026-08-14T10:00:00.000Z");

    expect(getFirstReviewAt(now)).toBe("2026-08-15T10:00:00.000Z");
    expect(getNextReview(0, now)).toEqual({
      reviewStep: 1,
      nextReviewAt: "2026-08-17T10:00:00.000Z"
    });
    expect(getNextReview(1, now).nextReviewAt).toBe(
      "2026-08-21T10:00:00.000Z"
    );
    expect(getNextReview(2, now).nextReviewAt).toBe(
      "2026-08-28T10:00:00.000Z"
    );
    expect(getNextReview(3, now).reviewStep).toBe(3);
  });
});
