import { describe, expect, it } from "vitest";
import { initialMission } from "./data";
import { advanceMission, approveTask, resetMission } from "./engine";

describe("mission engine", () => {
  it("does not advance a paused mission", () => {
    const state = structuredClone(initialMission);
    expect(advanceMission(state)).toEqual(state);
  });

  it("advances active work and appends events", () => {
    const state = { ...structuredClone(initialMission), running: true };
    const next = advanceMission(state);

    expect(next.cycle).toBe(state.cycle + 1);
    expect(next.tasks[0].progress).toBeGreaterThan(state.tasks[0].progress);
    expect(next.events.length).toBeGreaterThanOrEqual(state.events.length);
  });

  it("unlocks a dependent task after verified completion", () => {
    const state = structuredClone(initialMission);
    state.running = true;
    state.tasks[0].progress = 99;

    const next = advanceMission(state);
    expect(next.tasks[0].status).toBe("done");
    expect(next.tasks[1].status).toBe("running");
  });

  it("keeps high-risk work behind a human approval gate", () => {
    const state = structuredClone(initialMission);
    state.tasks = state.tasks.map((task) =>
      task.id === "T-106"
        ? { ...task, status: "running", progress: 99 }
        : { ...task, status: "done", progress: 100 },
    );
    state.running = true;

    const gated = advanceMission(state);
    expect(gated.tasks.find((task) => task.id === "T-106")?.status).toBe("approval");

    const approved = approveTask(gated, "T-106");
    expect(approved.tasks.find((task) => task.id === "T-106")?.status).toBe("done");
    expect(approved.events[0].agentId).toBe("human");
  });

  it("creates a fresh mission without mutating the template", () => {
    const fresh = resetMission(initialMission, "新任务", "交付可验证结果");

    expect(fresh.title).toBe("新任务");
    expect(fresh.tasks[0].status).toBe("ready");
    expect(fresh.tasks.slice(1).every((task) => task.status === "backlog")).toBe(true);
    expect(initialMission.tasks[0].status).toBe("running");
  });
});
