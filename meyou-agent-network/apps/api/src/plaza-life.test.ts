import { describe, expect, it } from "vitest";
import { createMomentState, readMomentState } from "./plaza-life.js";

describe("plaza moment state", () => {
  const now = new Date("2026-10-23T10:00:00.000Z");

  it("keeps open model-derived language and binds it to real evidence", () => {
    const state = createMomentState({
      label: "沉浸拆方案",
      mood: "兴奋又谨慎",
      behavior: "边说边比划架构",
      valence: .6,
      energy: .8,
      confidence: .92,
      durationMinutes: 30
    }, "event-123", now);

    expect(state).toMatchObject({
      label: "沉浸拆方案",
      mood: "兴奋又谨慎",
      behavior: "边说边比划架构",
      sourceEventId: "event-123",
      confidence: .92
    });
    expect(state.expiresAt).toBe("2026-10-23T10:30:00.000Z");
  });

  it("clamps unsafe model values and expires stale states", () => {
    const state = createMomentState({
      label: "正在认真写代码并调试一个特别长的并发问题",
      valence: 8,
      energy: -8,
      confidence: 3,
      durationMinutes: 999
    }, "event-456", now);

    expect(state.label.length).toBeLessThanOrEqual(16);
    expect(state.valence).toBe(1);
    expect(state.energy).toBe(-1);
    expect(state.confidence).toBe(1);
    expect(readMomentState({ momentState: state }, new Date("2026-10-23T12:59:00.000Z"))).not.toBeNull();
    expect(readMomentState({ momentState: state }, new Date("2026-10-23T13:01:00.000Z"))).toBeNull();
  });

  it("rejects untraceable state payloads", () => {
    expect(readMomentState({
      momentState: {
        label: "莫名开心",
        mood: "开心",
        behavior: "微笑",
        expiresAt: "2026-10-23T11:00:00.000Z"
      }
    }, now)).toBeNull();
  });
});
