import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultEvolutionState } from "../data/curriculum";
import { localWeekKey } from "./date";
import { loadState, saveState } from "./storage";

const stateKey = "easysay-state-v1";
let values = new Map<string, string>();

beforeEach(() => {
  values = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("local state migration", () => {
  it("preserves valid legacy progress while adding the current week key", () => {
    values.set(
      stateKey,
      JSON.stringify({
        progress: {
          completedTaskIds: ["task-1"],
          records: [],
          streak: 2,
          weeklySpeakingSeconds: 90,
          knownChunks: []
        }
      })
    );

    const state = loadState();

    expect(state.progress.completedTaskIds).toEqual(["task-1"]);
    expect(state.progress.weeklySpeakingSeconds).toBe(90);
    expect(state.progress.weeklySpeakingWeekKey).toBe(localWeekKey());
    expect(state.evolution).toEqual(defaultEvolutionState);
  });

  it("migrates legacy learners to Chinese learning English", () => {
    values.set(
      stateKey,
      JSON.stringify({
        profile: {
          name: "Lin",
          level: "A2",
          goal: "work",
          minutesPerDay: 45,
          accent: "american",
          createdAt: "2026-01-01T00:00:00.000Z"
        },
        progress: {}
      })
    );

    const state = loadState();

    expect(state.profile?.nativeLanguage).toBe("zh-CN");
    expect(state.profile?.targetLanguage).toBe("en");
  });

  it("resets only the weekly speaking total after a week boundary", () => {
    values.set(
      stateKey,
      JSON.stringify({
        progress: {
          completedTaskIds: ["task-1"],
          records: [],
          streak: 4,
          weeklySpeakingSeconds: 600,
          weeklySpeakingWeekKey: "2020-01-06",
          knownChunks: []
        }
      })
    );

    const state = loadState();

    expect(state.progress.weeklySpeakingSeconds).toBe(0);
    expect(state.progress.streak).toBe(4);
    expect(state.progress.completedTaskIds).toEqual(["task-1"]);
  });

  it("does not crash the app when browser storage is full", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      },
      removeItem: () => undefined
    });

    expect(() =>
      saveState({
        progress: loadState().progress,
        evolution: defaultEvolutionState
      })
    ).not.toThrow();
  });
});
