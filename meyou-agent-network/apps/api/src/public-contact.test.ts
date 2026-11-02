import { describe, expect, it } from "vitest";
import { publicContact } from "./public-contact.js";
import type { users } from "./db/schema.js";

describe("public contact allowlist", () => {
  it("excludes internal identifiers, account status and future private fields", () => {
    const user = {
      id: "peer", handle: "contact", displayName: "联系人", headline: "公开标题",
      bio: "公开简介", city: "杭州", avatar: null, interests: ["编程"], goals: ["交流"],
      lifeYouMeId: "central-private-id", riskState: "internal-risk", plan: "team",
      discoverable: false, locale: "zh-CN", createdAt: new Date(), updatedAt: new Date(),
      privateBackground: "must never appear"
    } as typeof users.$inferSelect;
    expect(publicContact(user)).toEqual({
      id: "peer", handle: "contact", displayName: "联系人", headline: "公开标题",
      bio: "公开简介", city: "杭州", avatar: null, interests: ["编程"], goals: ["交流"]
    });
    expect(JSON.stringify(publicContact(user))).not.toContain("private");
  });
  it("does not invent a missing contact", () => {
    expect(publicContact(null)).toBeNull();
    expect(publicContact(undefined)).toBeNull();
  });
});
