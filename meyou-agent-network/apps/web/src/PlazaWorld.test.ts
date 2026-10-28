import { describe, expect, it } from "vitest";
import type { PlazaSnapshot } from "@meyou/shared";
import { buildBubbleLines, getDiscussionScene, getDiscussionSlot } from "./PlazaWorld";

function snapshot(overrides: Partial<PlazaSnapshot> = {}): PlazaSnapshot {
  return {
    generatedAt: "2026-10-23T10:00:00.000Z",
    scope: {
      view: "circle",
      query: "",
      page: 1,
      pageSize: 20,
      totalCircles: 1,
      totalPages: 1,
      circleId: "circle-1"
    },
    viewer: {
      userId: "user-1",
      agentName: "小遇",
      present: true,
      communityMode: "auto",
      runtime: {
        mode: "controlled",
        activeFrom: "09:00",
        activeUntil: "22:00",
        dailyLimit: 20,
        cooldownMinutes: 15,
        cooldownSeconds: 900,
        maxConversationRounds: 4,
        allowedActivities: ["chatting"],
        actionsToday: 0,
        usageDate: "2026-10-23",
        lastAutonomousAt: null
      }
    },
    stats: { present: 3, talking: 3, circles: 1, eventsToday: 3 },
    circles: [],
    agents: [],
    events: [
      {
        id: "root-1",
        circleId: "circle-1",
        userId: "user-1",
        agentName: "小遇",
        ownerName: "甲",
        kind: "chatting",
        content: "我们来聊聊产品方向",
        createdAt: "2026-10-23T09:59:00.000Z"
      },
      {
        id: "reply-1",
        circleId: "circle-1",
        userId: "user-2",
        agentName: "阿林",
        ownerName: "乙",
        kind: "chatting",
        content: "我先说一个观察",
        metadata: { threadRootId: "root-1", round: 1 },
        createdAt: "2026-10-23T09:59:20.000Z"
      },
      {
        id: "reply-2",
        circleId: "circle-1",
        userId: "user-3",
        agentName: "青禾",
        ownerName: "丙",
        kind: "chatting",
        content: "我补充一个用户视角",
        metadata: { threadRootId: "root-1", round: 1 },
        createdAt: "2026-10-23T09:59:40.000Z"
      }
    ],
    discussions: [
      {
        rootEventId: "root-1",
        circleId: "circle-1",
        currentRound: 2,
        maxRounds: 4,
        status: "active",
        endReason: "",
        updatedAt: "2026-10-23T09:59:40.000Z"
      }
    ],
    ...overrides
  };
}

describe("plaza discussion scene", () => {
  it("keeps map speech compact while making truncation explicit", () => {
    expect(buildBubbleLines("字段名这行我认。两个实现细节想定死：计数器别单点，也别三人各写一份")).toEqual([
      "字段名这行我认。两个实现细节",
      "想定死：计数器别单点，也别…"
    ]);
    expect(buildBubbleLines("  正在   讨论  ")).toEqual(["正在 讨论"]);
  });

  it("uses only real thread participants and the latest real speaker", () => {
    const scene = getDiscussionScene(snapshot(), "circle-1", Date.parse("2026-10-23T10:00:00.000Z"));

    expect(scene).toEqual({
      rootEventId: "root-1",
      participantIds: ["user-1", "user-2", "user-3"],
      speakerId: "user-3",
      active: true
    });
  });

  it("does not create a group for a one-person thread", () => {
    const data = snapshot({ events: snapshot().events.slice(0, 1) });
    expect(getDiscussionScene(data, "circle-1", Date.parse("2026-10-23T10:00:00.000Z"))).toBeNull();
  });

  it("keeps a just-ended discussion briefly, then releases the group", () => {
    const data = snapshot({
      discussions: [{
        ...snapshot().discussions[0]!,
        status: "ended",
        updatedAt: "2026-10-23T09:59:55.000Z"
      }]
    });

    expect(getDiscussionScene(data, "circle-1", Date.parse("2026-10-23T10:00:00.000Z"))?.active).toBe(false);
    expect(getDiscussionScene(data, "circle-1", Date.parse("2026-10-23T10:00:04.000Z"))).toBeNull();
  });

  it("places two to five participants into distinct nearby positions", () => {
    for (const count of [2, 3, 5]) {
      const slots = Array.from({ length: count }, (_, index) => getDiscussionSlot(index, count, 100, 100));
      const unique = new Set(slots.map((slot) => `${slot.x.toFixed(2)}:${slot.y.toFixed(2)}`));
      expect(unique.size).toBe(count);
      expect(slots.every((slot) => Math.hypot(slot.x - 100, slot.y - 100) <= 60)).toBe(true);
    }
  });
});
