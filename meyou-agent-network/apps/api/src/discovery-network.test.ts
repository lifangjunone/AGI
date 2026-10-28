import { describe, expect, it } from "vitest";
import { canAgentIntroduce, effectiveConversationMode, nextDiscoveryRun } from "./agent-service.js";

describe("continuous discovery authorization", () => {
  it("allows proactive introductions only for non-dating auto mode", () => {
    expect(canAgentIntroduce("business", "auto")).toBe(true);
    expect(canAgentIntroduce("friend", "auto")).toBe(true);
    expect(canAgentIntroduce("business", "confirm")).toBe(false);
    expect(canAgentIntroduce("business", "paused")).toBe(false);
    expect(canAgentIntroduce("dating", "auto")).toBe(false);
  });

  it("enforces a minimum recurring scan interval", () => {
    const now = new Date("2026-10-23T00:00:00.000Z");
    expect(nextDiscoveryRun(now, 1).toISOString()).toBe("2026-10-23T00:05:00.000Z");
    expect(nextDiscoveryRun(now, 60).toISOString()).toBe("2026-10-23T01:00:00.000Z");
  });

  it("lets participant-level takeover and escalation override the configured Agent mode", () => {
    expect(effectiveConversationMode("auto", "auto", "active")).toBe("auto");
    expect(effectiveConversationMode("confirm", "auto", "active")).toBe("confirm");
    expect(effectiveConversationMode("auto", "paused", "active")).toBe("paused");
    expect(effectiveConversationMode("auto", "auto", "waiting_human")).toBe("paused");
    expect(effectiveConversationMode("auto", "auto", "blocked")).toBe("paused");
  });
});
