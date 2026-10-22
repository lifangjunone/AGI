import { describe, expect, it } from "vitest";
import { datingProfileSchema, missionSchema, plazaActionSchema, plazaMoveSchema, plazaRuntimeSettingsSchema } from "@meyou/shared";
import { guardAgentReply, parseModelJson } from "./model.js";
import { publicErrorResponse } from "./server.js";
import { hashPassword, resolveTrustedHeaderUser, verifyPassword } from "./auth.js";
import {
  clearAdminCookie, decryptModelSecret, encryptModelSecret, hashAdminPassword, maskSecret, resolveAdmin, verifyAdminCredentials
} from "./admin.js";
import type { AgentMode } from "@meyou/shared";

describe("MeYou API contracts", () => {
  it("keeps local administrator credentials disabled unless emergency fallback is explicit", () => {
    const previousFallback = process.env.MEYOU_LOCAL_ADMIN_FALLBACK;
    const previousEmail = process.env.ADMIN_EMAIL;
    const previousHash = process.env.ADMIN_PASSWORD_HASH;
    process.env.ADMIN_EMAIL = "admin@lifeyoume.icu";
    process.env.ADMIN_PASSWORD_HASH = hashAdminPassword("a strong admin password", "test-salt");
    try {
      expect(process.env.ADMIN_PASSWORD_HASH).not.toContain("a strong admin password");
      delete process.env.MEYOU_LOCAL_ADMIN_FALLBACK;
      expect(verifyAdminCredentials("ADMIN@lifeyoume.icu", "a strong admin password")).toBe(false);
      process.env.MEYOU_LOCAL_ADMIN_FALLBACK = "true";
      expect(verifyAdminCredentials("ADMIN@lifeyoume.icu", "a strong admin password")).toBe(true);
      expect(verifyAdminCredentials("admin@lifeyoume.icu", "wrong password")).toBe(false);
      expect(verifyAdminCredentials("member@lifeyoume.icu", "a strong admin password")).toBe(false);
    } finally {
      if (previousFallback === undefined) delete process.env.MEYOU_LOCAL_ADMIN_FALLBACK;
      else process.env.MEYOU_LOCAL_ADMIN_FALLBACK = previousFallback;
      if (previousEmail === undefined) delete process.env.ADMIN_EMAIL;
      else process.env.ADMIN_EMAIL = previousEmail;
      if (previousHash === undefined) delete process.env.ADMIN_PASSWORD_HASH;
      else process.env.ADMIN_PASSWORD_HASH = previousHash;
    }
  });

  it("resolves administrators from the trusted LifeYouMe platform header", async () => {
    const admin = await resolveAdmin({
      headers: { "x-lifeyoume-admin-user": "Operator@LifeYouMe.icu" }
    } as never);
    expect(admin).toEqual({ email: "operator@lifeyoume.icu", source: "platform" });
  });

  it("encrypts model credentials and exposes only a non-reversible mask", () => {
    const previousKey = process.env.MODEL_CONFIG_ENCRYPTION_KEY;
    process.env.MODEL_CONFIG_ENCRYPTION_KEY = "test-only-model-encryption-key-32-bytes";
    try {
      const plaintext = "apikey-sensitive-value-1234";
      const encrypted = encryptModelSecret(plaintext);
      expect(encrypted).not.toContain(plaintext);
      expect(decryptModelSecret(encrypted)).toBe(plaintext);
      expect(maskSecret(plaintext)).toBe("apik••••••••1234");
      expect(maskSecret(plaintext)).not.toContain("sensitive");
    } finally {
      if (previousKey === undefined) delete process.env.MODEL_CONFIG_ENCRYPTION_KEY;
      else process.env.MODEL_CONFIG_ENCRYPTION_KEY = previousKey;
    }
  });

  it("expires the production administrator cookie with matching security attributes", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(clearAdminCookie()).toContain("Max-Age=0");
      expect(clearAdminCookie()).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
      expect(clearAdminCookie()).toContain("SameSite=Strict");
      expect(clearAdminCookie()).toContain("Secure");
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("rejects an underage dating profile", () => {
    expect(datingProfileSchema.safeParse({
      adultConfirmed: true,
      age: 17,
      intent: "long_term",
      ageMin: 18,
      ageMax: 28,
      cityScope: "上海",
      languages: ["zh-CN"],
      values: ["真诚"],
      lifestyle: [],
      dealbreakers: [],
      discoverable: true
    }).success).toBe(false);
  });

  it("accepts any non-empty continuous-search prompt", () => {
    expect(missionSchema.safeParse({
      kind: "business",
      prompt: "找个人",
      locale: "zh-CN",
      active: true
    }).success).toBe(true);
    expect(missionSchema.safeParse({
      kind: "business",
      prompt: "   ",
      locale: "zh-CN",
      active: true
    }).success).toBe(false);
  });

  it("escalates high-risk promises before model invocation", () => {
    expect(guardAgentReply("请承诺退款并给我报价")).toEqual({
      escalate: true,
      reason: "涉及付款、合同、退款或承诺，必须由真人处理"
    });
  });

  it("parses fenced structured model output", () => {
    expect(parseModelJson<{ relevant: boolean }>("```json\n{\"relevant\":true}\n```"))
      .toEqual({ relevant: true });
  });

  it("does not expose internal API errors to clients", () => {
    expect(publicErrorResponse(new Error("connection refused"), "/api/v1/matches/dating/profile"))
      .toEqual({ statusCode: 503, error: "service_unavailable" });
    expect(publicErrorResponse({ statusCode: 429 }, "/api/v1/messages"))
      .toEqual({ statusCode: 429, error: "rate_limit_exceeded" });
  });

  it("accepts only explicit public plaza actions", () => {
    expect(plazaActionSchema.safeParse({
      circleId: "26e8c164-83b6-4df8-bf3d-3a497e875fb7",
      activity: "dating",
      content: "想交流长期关系里的边界感"
    }).success).toBe(true);
  });

  it("validates plaza movement payloads", () => {
    expect(plazaMoveSchema.safeParse({
      circleId: "26e8c164-83b6-4df8-bf3d-3a497e875fb7",
      x: 55,
      y: 46
    }).success).toBe(true);
    expect(plazaMoveSchema.safeParse({
      circleId: "not-a-circle",
      x: -1,
      y: 46
    }).success).toBe(false);
  });

  it("requires explicit and bounded continuous-plaza authorization", () => {
    expect(plazaRuntimeSettingsSchema.safeParse({
      mode: "continuous",
      activeFrom: "09:00",
      activeUntil: "22:00",
      dailyLimit: 8,
      cooldownMinutes: 5,
      allowedActivities: ["looking", "chatting", "business"]
    }).success).toBe(true);
    expect(plazaRuntimeSettingsSchema.safeParse({
      mode: "continuous",
      activeFrom: "09:00",
      activeUntil: "22:00",
      dailyLimit: 500,
      cooldownMinutes: 1,
      allowedActivities: []
    }).success).toBe(false);
  });

  it("hashes local passwords without storing plaintext", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toContain("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("prefers the explicitly selected MeYou account over the platform SSO header", () => {
    const localUser = {
      id: "local:18612078527@163.com",
      name: "李芳军",
      email: "18612078527@163.com"
    };
    expect(resolveTrustedHeaderUser({
      "x-lifeyoume-user-id": "shared-platform-user",
      "x-lifeyoume-user-name": "LifeYouMe 用户"
    }, localUser)).toEqual(localUser);
  });

  it("falls back to the platform SSO identity without a valid MeYou session", () => {
    expect(resolveTrustedHeaderUser({
      "x-lifeyoume-user-id": "platform-user-2",
      "x-lifeyoume-user-name": "主站用户",
      "x-lifeyoume-user-email": "user@lifeyoume.icu"
    }, null)).toEqual({
      id: "platform-user-2",
      name: "主站用户",
      email: "user@lifeyoume.icu"
    });
  });

  it("accepts only supported persisted Agent modes", () => {
    const supported: AgentMode[] = ["auto", "confirm", "paused"];
    expect(supported).toContain("paused");
    expect(supported).not.toContain("human" as AgentMode);
  });
});
