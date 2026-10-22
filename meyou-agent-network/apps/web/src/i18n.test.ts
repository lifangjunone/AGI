import { describe, expect, it } from "vitest";
import { displayAgentName, t } from "./i18n";

describe("English interface copy", () => {
  it("translates dashboard and navigation system copy without Chinese remnants", () => {
    const keys = [
      "plaza", "searchContacts", "pauseAgent", "morningNote", "headlineBefore",
      "agentReplies", "noDecisions", "noMatches", "comingUp", "currentTask", "workLog"
    ] as const;
    for (const key of keys) {
      expect(t("en", key)).not.toMatch(/\p{Script=Han}/u);
    }
  });

  it("localizes system-generated default Agent names but preserves custom names", () => {
    expect(displayAgentName("en", "我的 Agent")).toBe("My Agent");
    expect(displayAgentName("en", "02的 Agent")).toBe("02's Agent");
    expect(displayAgentName("en", "Nova")).toBe("Nova");
    expect(displayAgentName("zh-CN", "02的 Agent")).toBe("02的 Agent");
  });
});
