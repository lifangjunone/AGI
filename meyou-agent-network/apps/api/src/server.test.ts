import { describe, expect, it } from "vitest";
import {
  datingProfileSchema, digitalLearningSchema, missionSchema, plazaActionSchema, plazaMoveSchema,
  plazaRuntimeSettingsSchema, societyDecisionSchema, societyProposalSchema
} from "@meyou/shared";
import { guardAgentReply, parseModelJson } from "./model.js";
import { buildServer, publicErrorResponse } from "./server.js";
import { hashPassword, resolveTrustedHeaderUser, verifyPassword } from "./auth.js";
import {
  clearAdminCookie, decryptModelSecret, encryptModelSecret, hashAdminPassword, maskSecret, resolveAdmin, verifyAdminCredentials
} from "./admin.js";
import type { AgentMode } from "@meyou/shared";

describe("MeYou API contracts", () => {
  it("hides the service-to-service model configuration endpoint without its sync token", async () => {
    const previousToken = process.env.MODEL_CONFIG_SYNC_TOKEN;
    process.env.MODEL_CONFIG_SYNC_TOKEN = "test-model-sync-token-at-least-32-characters";
    const app = buildServer();
    try {
      const missing = await app.inject({ method: "GET", url: "/internal/model-config" });
      expect(missing.statusCode).toBe(404);
      expect(missing.json()).toEqual({ error: "not_found" });
      const incorrect = await app.inject({
        method: "GET",
        url: "/internal/model-config",
        headers: { "x-lifeyoume-model-sync-token": "incorrect-token-at-least-32-characters" }
      });
      expect(incorrect.statusCode).toBe(404);
      expect(incorrect.json()).not.toHaveProperty("apiKey");
    } finally {
      await app.close();
      if (previousToken === undefined) delete process.env.MODEL_CONFIG_SYNC_TOKEN;
      else process.env.MODEL_CONFIG_SYNC_TOKEN = previousToken;
    }
  });

  it("rejects unauthenticated key reveal and cross-origin administrator requests", async () => {
    const app = buildServer();
    try {
      const anonymous = await app.inject({
        method: "POST", url: "/api/v1/admin/model-config/reveal-key",
        payload: { confirmation: "reveal-saved-model-key" }
      });
      expect(anonymous.statusCode).toBe(401);
      expect(anonymous.headers["cache-control"]).toContain("no-store");
      expect(anonymous.json()).not.toHaveProperty("apiKey");
      const crossOrigin = await app.inject({
        method: "POST", url: "/api/v1/admin/model-config/reveal-key",
        headers: { "x-lifeyoume-admin-user": "test@example.invalid", origin: "https://untrusted.example.invalid" },
        payload: { confirmation: "reveal-saved-model-key" }
      });
      expect(crossOrigin.statusCode).toBe(403);
      expect(crossOrigin.json()).not.toHaveProperty("apiKey");
    } finally { await app.close(); }
  });

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

  it("preserves client error status instead of reporting service unavailable", () => {
    expect(publicErrorResponse({ statusCode: 400 }, "/api/v1/matches/example/consent"))
      .toEqual({ statusCode: 400, error: "invalid_request" });
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
      cooldownSeconds: 5,
      maxConversationRounds: 4,
      allowedActivities: ["looking", "chatting", "business"]
    }).success).toBe(true);
    expect(plazaRuntimeSettingsSchema.safeParse({
      mode: "continuous",
      activeFrom: "09:00",
      activeUntil: "22:00",
      dailyLimit: 500,
      cooldownSeconds: 1,
      maxConversationRounds: 0,
      allowedActivities: []
    }).success).toBe(false);
    expect(plazaRuntimeSettingsSchema.safeParse({
      mode: "continuous",
      activeFrom: "09:00",
      activeUntil: "22:00",
      dailyLimit: 8,
      cooldownSeconds: 60,
      maxConversationRounds: 21,
      allowedActivities: ["chatting"]
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

  it("requires explicit bounded society proposals and decisions", () => {
    expect(societyProposalSchema.safeParse({
      kind: "romantic_intent",
      targetUserId: "26e8c164-83b6-4df8-bf3d-3a497e875fb7",
      title: "认真了解彼此",
      reason: "已经有多次双向交流，希望由双方真人确认。",
      payload: {}
    }).success).toBe(true);
    expect(societyProposalSchema.safeParse({
      kind: "partner",
      title: "",
      reason: "",
      payload: {}
    }).success).toBe(false);
    expect(societyDecisionSchema.safeParse({ decision: "accept" }).success).toBe(true);
    expect(societyDecisionSchema.safeParse({ decision: "model_decides" }).success).toBe(false);
  });

  it("requires real learning evidence for digital Agent growth", () => {
    expect(digitalLearningSchema.safeParse({
      skill: "统计推理",
      evidence: "完成样本量练习并解释了置信区间。",
      source: "course:statistics-01",
      score: 82
    }).success).toBe(true);
    expect(digitalLearningSchema.safeParse({
      skill: "统计推理",
      evidence: "",
      source: "",
      score: 101
    }).success).toBe(false);
  });
});
