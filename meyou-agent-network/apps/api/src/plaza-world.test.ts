import { describe, expect, it } from "vitest";
import { plazaActionPosition, plazaActionPhase, plazaPlaceDestination, plazaCircleProjection } from "@meyou/shared";
import { createWorldAction, discussionDestination, rankDiscussionParticipant } from "./plaza-world.js";

describe("authoritative plaza actions", () => {
  it("returns to a stable place without teleporting after a discussion", () => {
    const circle = { x: 50, y: 50, radius: 20 };
    const target = plazaPlaceDestination(circle, "observe", "user-a");
    expect(target).toEqual(plazaPlaceDestination(circle, "observe", "user-a"));
    expect(target).not.toEqual(plazaPlaceDestination(circle, "rest", "user-a"));
    expect(Math.hypot(target.x - 50, target.y - 50)).toBeLessThan(20);
    const action = createWorldAction({ kind: "observe", goal: "离开讨论", from: { x: 50, y: 50 }, target });
    expect(plazaActionPosition(action, Date.parse(action.startedAt)).moving).toBe(true);
    expect(plazaActionPosition(action, Date.parse(action.arrivesAt))).toEqual({ ...target, moving: false });
  });
  it("uses one projection for rendering and pointer movement regardless of drawers", () => {
    expect(plazaCircleProjection(1440, 900)).toEqual({ left: 115.2, top: 153, width: 1209.6, height: 630 });
  });
  it("follows walkway segments, then thinks at arrival and releases at completion", () => {
    const action = createWorldAction({
      kind: "discuss", goal: "参与讨论", from: { x: 40, y: 40 }, target: { x: 60, y: 40 },
      circle: { x: 50, y: 50, radius: 20 }, awaitingModel: true,
      now: new Date("2026-10-28T00:00:00Z"), durationMs: 1000
    });
    expect(action.route).toHaveLength(2);
    expect(plazaActionPhase(action, Date.parse(action.startedAt) + 100)).toBe("moving");
    expect(plazaActionPhase(action, Date.parse(action.arrivesAt))).toBe("thinking");
    expect(plazaActionPhase({ ...action, awaitingModel: false }, Date.parse(action.arrivesAt))).toBe("discussing");
    expect(Date.parse(action.endsAt) - Date.parse(action.arrivesAt)).toBe(1000);
    expect(plazaActionPhase(action, Date.parse(action.endsAt))).toBe("available");
    const early = plazaActionPosition(action, Date.parse(action.startedAt) + 1000);
    expect(early.x).toBe(40);
    expect(early.y).toBeGreaterThan(40);
  });
  it("gives all viewers identical timeline positions and stops at arrival", () => {
    const action = createWorldAction({
      kind: "move", goal: "走到讨论区", from: { x: 10, y: 20 },
      target: { x: 20, y: 20 }, now: new Date("2026-10-28T00:00:00Z")
    });
    expect(plazaActionPosition(action, Date.parse(action.startedAt) + 2500)).toEqual({ x: 15, y: 20, moving: true });
    expect(plazaActionPosition(action, Date.parse(action.arrivesAt) + 1000)).toEqual({ x: 20, y: 20, moving: false });
  });
  it("continues from current position when an action is interrupted", () => {
    const now = new Date("2026-10-28T00:00:00Z");
    const previous = createWorldAction({ kind: "move", goal: "走动", from: { x: 10, y: 20 }, target: { x: 20, y: 20 }, now });
    const action = createWorldAction({ kind: "discuss", goal: "参与", from: { x: 20, y: 20 }, previous, now: new Date(now.getTime() + 2500) });
    expect(action.fromX).toBe(15);
  });
  it("uses topic relevance rather than fixed ID ordering", () => {
    expect(rankDiscussionParticipant("z", ["TypeScript"], "TypeScript", [], 1))
      .toBeGreaterThan(rankDiscussionParticipant("a", [], "TypeScript", [], 1));
  });
  it("places separate discussions at distinct stable destinations", () => {
    const circle = { x: 50, y: 50, radius: 20 };
    const a = discussionDestination(circle, "group-a", 0, 3);
    expect(a).toEqual(discussionDestination(circle, "group-a", 0, 3));
    expect(a).not.toEqual(discussionDestination(circle, "group-b", 0, 3));
  });
});
