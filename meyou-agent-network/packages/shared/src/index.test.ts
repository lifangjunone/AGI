import { describe, expect, it } from "vitest";
import {
  canReveal, communitySchema, datingProfileSchema, hasMutualConsent, missionAvailable,
  organizationSchema, plazaActionSchema, plazaMoveSchema
} from "./index.js";

describe("privacy and consent contracts", () => {
  it("never reveals forbidden memories", () => {
    expect(canReveal("never", "agent")).toBe(false);
    expect(canReveal("match", "public")).toBe(false);
    expect(canReveal("public", "public")).toBe(true);
  });

  it("requires unrevoked two-sided consent", () => {
    expect(hasMutualConsent(true, true)).toBe(true);
    expect(hasMutualConsent(true, false)).toBe(false);
    expect(hasMutualConsent(true, true, true)).toBe(false);
  });

  it("enforces plan mission limits", () => {
    expect(missionAvailable("free", 0)).toBe(true);
    expect(missionAvailable("free", 1)).toBe(false);
  });

  it("rejects underage dating profiles", () => {
    expect(datingProfileSchema.safeParse({
      adultConfirmed: true,
      age: 21,
      intent: "long_term",
      ageMin: 17,
      ageMax: 30,
      cityScope: "上海",
      languages: ["zh-CN"],
      values: ["真诚"],
      lifestyle: [],
      dealbreakers: [],
      discoverable: true
    }).success).toBe(false);
  });

  it("only accepts explicit public plaza activities", () => {
    expect(plazaActionSchema.safeParse({
      circleId: "26e8c164-83b6-4df8-bf3d-3a497e875fb7",
      activity: "business",
      content: "想认识正在做 AI 应用出海的人"
    }).success).toBe(true);
    expect(plazaActionSchema.safeParse({
      circleId: "26e8c164-83b6-4df8-bf3d-3a497e875fb7",
      activity: "leak-private-memory"
    }).success).toBe(false);
  });

  it("accepts only bounded plaza movement coordinates", () => {
    expect(plazaMoveSchema.safeParse({
      circleId: "26e8c164-83b6-4df8-bf3d-3a497e875fb7",
      x: 52.4,
      y: 41.8
    }).success).toBe(true);
    expect(plazaMoveSchema.safeParse({
      circleId: "26e8c164-83b6-4df8-bf3d-3a497e875fb7",
      x: 120,
      y: 41.8
    }).success).toBe(false);
  });

  it("validates community and organization creation inputs", () => {
    expect(communitySchema.safeParse({
      name: "AI 产品人",
      handle: "ai-builders",
      description: "让真实的 AI 产品人交流合作和实践经验。",
      visibility: "public"
    }).success).toBe(true);
    expect(organizationSchema.safeParse({
      name: "MeYou Studio",
      handle: "meyou-studio",
      description: "为客户提供 Agent 接待和连接服务。"
    }).success).toBe(true);
    expect(communitySchema.safeParse({
      name: "x", handle: "中文地址", description: "短", visibility: "public"
    }).success).toBe(false);
    expect(communitySchema.safeParse({
      name: "测试社区", handle: "ai-group-test", description: "测试", visibility: "public"
    }).success).toBe(true);
  });
});
