import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import {
  agentProfileSchema, communitySchema, datingProfileSchema, missionSchema,
  organizationSchema, plazaActionSchema, plazaMoveSchema, plazaRuntimeSettingsSchema,
  digitalLearningSchema, societyDecisionSchema, societyProposalSchema, societySettingsSchema
} from "@meyou/shared";
import { and, desc, eq, lte, or, sql } from "drizzle-orm";
import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import { z } from "zod";
import {
  adminCookie, adminCredentialsConfigured, createAdminSession,
  decryptModelSecret, encryptModelSecret, maskSecret, platformAdminConfigured,
  resolveAdmin, verifyAdminCredentials
} from "./admin.js";
import {
  createSession, deleteSession, loginLocalAccount, registerLocalAccount, resolveUser
} from "./auth.js";
import {
  generateAgentReply, generatePlazaReply, runMission, sendApprovedMatchIntroduction
} from "./agent-service.js";
import { db } from "./db/client.js";
import {
  auditEvents, blocks, communities, memberships, modelConfigurations, organizations, plazaDiscussions,
  notifications, publicInquiries, searchMissions, usageLedger, users
} from "./db/schema.js";
import {
  completeWithConfiguration, guardAgentReply, resolveModelConfiguration
} from "./model.js";
import { scheduleMission, schedulePlazaConversation } from "./queue.js";
import {
  addMessage, createMission, createOrGetConversation, ensureUser, getConversation,
  blockConversationPeer, decideReplyDraft, escalateConversation,
  ensureDatingMission, enterPlaza, getDashboard, getMe, getPlazaSnapshot, leavePlaza, createCommunityWithCircle,
  getPlazaRuntimeSettings,
  listConversations, listDirectory, listMatches, listMissions, markConversationRead, publicProfile,
  reportConversationPeer, setConsent, updateAgent,
  setAllAgentModes, setConversationAgentMode, setMissionActive, updatePlazaRuntimeSettings,
  updateProfile, updatePublicInquiryStatus, upsertDatingProfile, runContinuousPlazaTick, movePlazaAgent
} from "./repository.js";
import {
  decide as decideSocietyProposal,
  getSocietySnapshot,
  propose as createSocietyProposal,
  recordLearning,
  setSocietyPaused
} from "./agent-society.js";

async function requireUser(request: Parameters<typeof resolveUser>[0]) {
  const identity = await resolveUser(request);
  if (!identity) return null;
  return { identity, user: await ensureUser(identity) };
}

const adminModelSchema = z.object({
  provider: z.enum(["ark", "openai-compatible", "custom"]),
  baseUrl: z.string().url().max(500),
  modelId: z.string().trim().min(2).max(200),
  apiKey: z.string().max(1000).optional().default(""),
  thinkingEnabled: z.boolean().default(true),
  timeoutMs: z.number().int().min(10_000).max(1_800_000),
  temperature: z.number().min(0).max(2),
  enabled: z.boolean().default(true)
});

const adminModelStatusSchema = z.object({
  enabled: z.boolean()
});

function safeProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : "model_test_failed";
  if (message.startsWith("model_provider_error:")) return message;
  if (message === "model_not_configured") return message;
  if (message.includes("timeout") || message.includes("aborted")) return "model_timeout";
  return "model_connection_failed";
}

function validModelSyncToken(configured: string, supplied: unknown) {
  if (configured.length < 32 || typeof supplied !== "string") return false;
  const configuredBytes = Buffer.from(configured);
  const suppliedBytes = Buffer.from(supplied);
  return configuredBytes.length === suppliedBytes.length
    && timingSafeEqual(configuredBytes, suppliedBytes);
}

export function publicErrorResponse(error: unknown, requestUrl: string) {
  const databaseCode = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
  if (databaseCode === "23505") return { statusCode: 409, error: "handle_already_exists" };
  const statusCode = typeof error === "object" && error !== null && "statusCode" in error
    && typeof error.statusCode === "number"
    ? error.statusCode
    : 500;
  if (statusCode === 429) return { statusCode, error: "rate_limit_exceeded" };
  if (statusCode >= 400 && statusCode < 500) return { statusCode, error: "invalid_request" };
  if (requestUrl.startsWith("/api/")) return { statusCode: 503, error: "service_unavailable" };
  return { statusCode, error: "request_failed" };
}

export function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers.x-lifeyoume-model-sync-token"
      ]
    }
  });
  const eventSockets = new Set<{ readyState: number; send: (value: string) => void }>();
  const broadcastEvent = (event: Record<string, unknown>) => {
    const payload = JSON.stringify({ ...event, cursor: Date.now() });
    for (const socket of eventSockets) {
      if (socket.readyState === 1) socket.send(payload);
    }
  };
  app.register(cors, { origin: process.env.WEB_ORIGIN ?? true, credentials: true });
  app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  app.register(websocket);
  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "request_failed");
    const response = publicErrorResponse(error, request.url);
    return reply.code(response.statusCode).send({ error: response.error });
  });
  const webRoot = process.env.WEB_DIST_DIR
    ? resolve(process.env.WEB_DIST_DIR)
    : resolve(process.cwd(), "apps/web/dist");

  app.get("/health", async (_request, reply) => {
    try {
      await db.execute("select 1");
      return { ok: true, database: "ready", service: "meyou-api", version: "0.2.0", time: new Date().toISOString() };
    } catch {
      return reply.code(503).send({ ok: false, database: "unavailable", service: "meyou-api" });
    }
  });

  app.get("/api/v1/session", async (request) => ({
    user: await resolveUser(request),
    authLoginUrl: process.env.AUTH_LOGIN_URL
  }));

  app.post("/api/v1/auth/register", async (request, reply) => {
    const body = request.body as { email?: unknown; password?: unknown; name?: unknown };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return reply.code(400).send({ error: "invalid_email" });
    }
    if (password.length < 8) return reply.code(400).send({ error: "weak_password" });
    if (name.length < 2 || name.length > 40) return reply.code(400).send({ error: "invalid_name" });
    try {
      const identity = await registerLocalAccount(email, password, name);
      await ensureUser(identity);
      const token = await createSession(identity);
      reply.header("set-cookie", `meyou_session=${encodeURIComponent(token)}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
      return reply.code(201).send({ user: identity });
    } catch (error) {
      if (error instanceof Error && error.message === "email_already_exists") {
        return reply.code(409).send({ error: "email_already_exists" });
      }
      if (typeof error === "object" && error !== null && "code" in error && String(error.code) === "23505") {
        return reply.code(409).send({ error: "email_already_exists" });
      }
      throw error;
    }
  });

  app.post("/api/v1/auth/login", async (request, reply) => {
    const body = request.body as { email?: unknown; password?: unknown };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const identity = await loginLocalAccount(email, password);
    if (!identity) return reply.code(401).send({ error: "invalid_credentials" });
    const token = await createSession(identity);
    reply.header("set-cookie", `meyou_session=${encodeURIComponent(token)}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
    return { user: identity };
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    const token = request.headers.cookie?.split(";").map((part) => part.trim())
      .find((part) => part.startsWith("meyou_session="))?.slice("meyou_session=".length);
    if (token) await deleteSession(decodeURIComponent(token));
    reply.header("set-cookie", "meyou_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
    return { loggedOut: true };
  });

  app.get("/api/v1/admin/session", async (request) => ({
    admin: await resolveAdmin(request),
    configured: platformAdminConfigured(),
    provider: "lifeyoume-platform",
    localFallbackEnabled: adminCredentialsConfigured()
  }));

  app.post("/api/v1/admin/login", {
    config: { rateLimit: { max: 8, timeWindow: "15 minutes" } }
  }, async (request, reply) => {
    if (!adminCredentialsConfigured()) {
      return reply.code(410).send({
        error: "platform_admin_required",
        loginUrl: "https://lifeyoume.icu/admin/"
      });
    }
    const body = request.body as { email?: unknown; password?: unknown };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!verifyAdminCredentials(email, password)) {
      return reply.code(401).send({ error: "invalid_admin_credentials" });
    }
    const token = await createAdminSession(email);
    reply.header("set-cookie", adminCookie(token));
    return { admin: { email: email.toLowerCase() } };
  });

  app.post("/api/v1/admin/logout", async () => {
    return {
      loggedOut: false,
      provider: "lifeyoume-platform",
      message: "Platform administrator sessions are managed by LifeYouMe."
    };
  });

  app.get("/api/v1/admin/usage", async (request, reply) => {
    const admin = await resolveAdmin(request);
    if (!admin) return reply.code(401).send({ error: "admin_authentication_required" });
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [summary, recent, daily] = await Promise.all([
      db.select({
        metric: usageLedger.metric,
        total: sql<number>`coalesce(sum(${usageLedger.amount}), 0)::int`,
        events: sql<number>`count(*)::int`,
        lastAt: sql<Date | null>`max(${usageLedger.createdAt})`
      }).from(usageLedger).groupBy(usageLedger.metric),
      db.select({
        id: usageLedger.id,
        ownerId: usageLedger.ownerId,
        ownerName: users.displayName,
        ownerHandle: users.handle,
        metric: usageLedger.metric,
        amount: usageLedger.amount,
        idempotencyKey: usageLedger.idempotencyKey,
        createdAt: usageLedger.createdAt
      }).from(usageLedger)
        .leftJoin(users, eq(users.id, usageLedger.ownerId))
        .orderBy(desc(usageLedger.createdAt))
        .limit(40),
      db.select({
        day: sql<string>`to_char(${usageLedger.createdAt}, 'YYYY-MM-DD')`,
        total: sql<number>`coalesce(sum(${usageLedger.amount}), 0)::int`
      }).from(usageLedger)
        .where(sql`${usageLedger.createdAt} >= ${since}`)
        .groupBy(sql`to_char(${usageLedger.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${usageLedger.createdAt}, 'YYYY-MM-DD')`)
    ]);
    return {
      summary: summary.map((item) => ({
        metric: item.metric,
        total: Number(item.total ?? 0),
        events: Number(item.events ?? 0),
        lastAt: item.lastAt ? new Date(item.lastAt).toISOString() : null
      })),
      daily: daily.map((item) => ({
        day: item.day,
        total: Number(item.total ?? 0)
      })),
      recent: recent.map((item) => ({
        id: item.id,
        ownerId: item.ownerId,
        ownerName: item.ownerName,
        ownerHandle: item.ownerHandle,
        metric: item.metric,
        amount: item.amount,
        idempotencyKey: item.idempotencyKey,
        createdAt: item.createdAt.toISOString()
      }))
    };
  });

  app.get("/api/v1/admin/audit", async (request, reply) => {
    const admin = await resolveAdmin(request);
    if (!admin) return reply.code(401).send({ error: "admin_authentication_required" });
    const [summary, events] = await Promise.all([
      db.select({
        action: auditEvents.action,
        total: sql<number>`count(*)::int`,
        lastAt: sql<Date | null>`max(${auditEvents.createdAt})`
      }).from(auditEvents).groupBy(auditEvents.action),
      db.select({
        id: auditEvents.id,
        ownerId: auditEvents.ownerId,
        ownerName: users.displayName,
        ownerHandle: users.handle,
        organizationId: auditEvents.organizationId,
        organizationName: organizations.name,
        action: auditEvents.action,
        summary: auditEvents.summary,
        policyRefs: auditEvents.policyRefs,
        toolCalls: auditEvents.toolCalls,
        confidence: auditEvents.confidence,
        escalationReason: auditEvents.escalationReason,
        createdAt: auditEvents.createdAt
      }).from(auditEvents)
        .leftJoin(users, eq(users.id, auditEvents.ownerId))
        .leftJoin(organizations, eq(organizations.id, auditEvents.organizationId))
        .orderBy(desc(auditEvents.createdAt))
        .limit(80)
    ]);
    return {
      summary: summary.map((item) => ({
        action: item.action,
        total: Number(item.total ?? 0),
        lastAt: item.lastAt ? new Date(item.lastAt).toISOString() : null
      })),
      events: events.map((item) => ({
        id: item.id,
        ownerId: item.ownerId,
        ownerName: item.ownerName,
        ownerHandle: item.ownerHandle,
        organizationId: item.organizationId,
        organizationName: item.organizationName,
        action: item.action,
        summary: item.summary,
        policyRefs: item.policyRefs,
        toolCalls: item.toolCalls,
        confidence: item.confidence,
        escalationReason: item.escalationReason,
        createdAt: item.createdAt.toISOString()
      }))
    };
  });

  app.get("/api/v1/admin/model-config", async (request, reply) => {
    const admin = await resolveAdmin(request);
    if (!admin) return reply.code(401).send({ error: "admin_authentication_required" });
    const [configured] = await db.select().from(modelConfigurations)
      .orderBy(desc(modelConfigurations.updatedAt)).limit(1);
    if (configured) {
      const apiKey = decryptModelSecret(configured.apiKeyEncrypted);
      return {
        configuration: {
          provider: configured.provider,
          baseUrl: configured.baseUrl,
          modelId: configured.modelId,
          apiKeyMasked: maskSecret(apiKey),
          hasApiKey: Boolean(apiKey),
          thinkingEnabled: configured.thinkingEnabled,
          timeoutMs: configured.timeoutMs,
          temperature: configured.temperatureMilli / 1000,
          enabled: configured.enabled,
          source: "database",
          updatedBy: configured.updatedBy,
          updatedAt: configured.updatedAt.toISOString()
        }
      };
    }
    const fallback = await resolveModelConfiguration();
    return {
      configuration: {
        provider: fallback.provider,
        baseUrl: fallback.baseUrl,
        modelId: fallback.modelId,
        apiKeyMasked: maskSecret(fallback.apiKey),
        hasApiKey: Boolean(fallback.apiKey),
        thinkingEnabled: fallback.thinkingEnabled,
        timeoutMs: fallback.timeoutMs,
        temperature: fallback.temperature,
        enabled: Boolean(fallback.apiKey && fallback.modelId),
        source: "environment",
        updatedBy: "server environment",
        updatedAt: null
      }
    };
  });

  app.put("/api/v1/admin/model-config", async (request, reply) => {
    const admin = await resolveAdmin(request);
    if (!admin) return reply.code(401).send({ error: "admin_authentication_required" });
    const parsed = adminModelSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_model_configuration", issues: parsed.error.issues });
    }
    const [existing] = await db.select().from(modelConfigurations)
      .orderBy(desc(modelConfigurations.updatedAt)).limit(1);
    const fallback = existing ? null : await resolveModelConfiguration();
    const apiKey = parsed.data.apiKey.trim()
      || (existing ? decryptModelSecret(existing.apiKeyEncrypted) : fallback?.apiKey ?? "");
    if (!apiKey) return reply.code(400).send({ error: "api_key_required" });
    const values = {
      provider: parsed.data.provider,
      baseUrl: parsed.data.baseUrl.replace(/\/$/, ""),
      modelId: parsed.data.modelId,
      apiKeyEncrypted: encryptModelSecret(apiKey),
      thinkingEnabled: parsed.data.thinkingEnabled,
      timeoutMs: parsed.data.timeoutMs,
      temperatureMilli: Math.round(parsed.data.temperature * 1000),
      enabled: existing?.enabled ?? parsed.data.enabled,
      updatedBy: admin.email,
      updatedAt: new Date()
    };
    const [configuration] = existing
      ? await db.update(modelConfigurations).set(values)
          .where(eq(modelConfigurations.id, existing.id)).returning()
      : await db.insert(modelConfigurations).values(values).returning();
    await db.insert(auditEvents).values({
      action: "admin.model_configuration_updated",
      summary: `管理员更新模型配置：${configuration?.provider}/${configuration?.modelId}`,
      policyRefs: ["admin-only", "encrypted-secret", "model-provider"],
      toolCalls: [],
      escalationReason: admin.email
    });
    return {
      configuration: {
        provider: configuration?.provider,
        baseUrl: configuration?.baseUrl,
        modelId: configuration?.modelId,
        apiKeyMasked: maskSecret(apiKey),
        hasApiKey: true,
        thinkingEnabled: configuration?.thinkingEnabled,
        timeoutMs: configuration?.timeoutMs,
        temperature: (configuration?.temperatureMilli ?? 350) / 1000,
        enabled: configuration?.enabled,
        source: "database",
        updatedBy: configuration?.updatedBy,
        updatedAt: configuration?.updatedAt.toISOString()
      }
    };
  });

  app.post("/api/v1/admin/model-config/reveal-key", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store, private");
    reply.header("Pragma", "no-cache");
    const admin = await resolveAdmin(request);
    if (!admin) return reply.code(401).send({ error: "admin_authentication_required" });
    const origin = request.headers.origin;
    const allowedOrigins = [
      process.env.WEB_ORIGIN,
      process.env.PUBLIC_APP_URL,
      `https://${request.headers.host}`,
      ...(process.env.NODE_ENV !== "production" ? [`http://${request.headers.host}`] : [])
    ].filter(Boolean);
    if (!origin || !allowedOrigins.includes(origin)) {
      return reply.code(403).send({ error: "secret_reveal_origin_denied" });
    }
    const parsed = z.object({ confirmation: z.literal("reveal-saved-model-key") }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "secret_reveal_confirmation_required" });
    const [configured] = await db.select().from(modelConfigurations)
      .orderBy(desc(modelConfigurations.updatedAt)).limit(1);
    const apiKey = configured
      ? decryptModelSecret(configured.apiKeyEncrypted)
      : (await resolveModelConfiguration()).apiKey;
    if (!apiKey) return reply.code(404).send({ error: "api_key_not_configured" });
    // Audit must succeed before any plaintext is returned. Never persist the key in audit.
    await db.insert(auditEvents).values({
      action: "admin.model_key_revealed",
      summary: "管理员查看当前模型密钥",
      policyRefs: ["admin-only", "explicit-confirmation", `actor:${admin.email}`, `configuration:${configured?.id ?? "environment"}`],
      toolCalls: []
    });
    return { apiKey, expiresInSeconds: 30 };
  });

  app.patch("/api/v1/admin/model-config/status", async (request, reply) => {
    const admin = await resolveAdmin(request);
    if (!admin) return reply.code(401).send({ error: "admin_authentication_required" });
    const parsed = adminModelStatusSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_model_status" });
    const [existing] = await db.select().from(modelConfigurations)
      .orderBy(desc(modelConfigurations.updatedAt)).limit(1);
    if (!existing) return reply.code(409).send({ error: "model_configuration_required" });
    const changedAt = new Date();
    const [configuration] = await db.update(modelConfigurations).set({
      enabled: parsed.data.enabled,
      updatedBy: admin.email,
      updatedAt: changedAt
    }).where(eq(modelConfigurations.id, existing.id)).returning();
    await db.insert(auditEvents).values({
      action: parsed.data.enabled ? "admin.model_service_enabled" : "admin.model_service_disabled",
      summary: parsed.data.enabled
        ? `管理员开启模型服务：${existing.provider}/${existing.modelId}`
        : `管理员关闭模型服务：${existing.provider}/${existing.modelId}`,
      policyRefs: ["admin-only", "model-global-switch"],
      toolCalls: [],
      escalationReason: admin.email
    });
    return {
      enabled: configuration?.enabled ?? parsed.data.enabled,
      updatedBy: configuration?.updatedBy ?? admin.email,
      updatedAt: (configuration?.updatedAt ?? changedAt).toISOString()
    };
  });

  app.post("/api/v1/admin/model-config/test", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const admin = await resolveAdmin(request);
    if (!admin) return reply.code(401).send({ error: "admin_authentication_required" });
    const parsed = adminModelSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_model_configuration" });
    const [existing] = await db.select().from(modelConfigurations)
      .orderBy(desc(modelConfigurations.updatedAt)).limit(1);
    const fallback = existing ? null : await resolveModelConfiguration();
    const apiKey = parsed.data.apiKey.trim()
      || (existing ? decryptModelSecret(existing.apiKeyEncrypted) : fallback?.apiKey ?? "");
    if (!apiKey) return reply.code(400).send({ error: "api_key_required" });
    const startedAt = Date.now();
    try {
      const content = await completeWithConfiguration({
        provider: parsed.data.provider,
        baseUrl: parsed.data.baseUrl,
        modelId: parsed.data.modelId,
        apiKey,
        thinkingEnabled: parsed.data.thinkingEnabled,
        timeoutMs: Math.min(parsed.data.timeoutMs, 120_000),
        temperature: parsed.data.temperature
      }, [
        { role: "system", content: "Return only the word OK." },
        { role: "user", content: "Health check" }
      ], { thinking: false });
      return {
        ok: true,
        latencyMs: Date.now() - startedAt,
        responsePreview: content.trim().slice(0, 80)
      };
    } catch (error) {
      request.log.warn({ err: error }, "admin_model_test_failed");
      return reply.code(502).send({
        error: safeProviderError(error),
        latencyMs: Date.now() - startedAt
      });
    }
  });

  app.get("/internal/model-config", async (request, reply) => {
    reply.header("Cache-Control", "no-store, private");
    reply.header("Pragma", "no-cache");
    const configuredToken = process.env.MODEL_CONFIG_SYNC_TOKEN?.trim() ?? "";
    const suppliedToken = request.headers["x-lifeyoume-model-sync-token"];
    if (!validModelSyncToken(configuredToken, suppliedToken)) {
      return reply.code(404).send({ error: "not_found" });
    }
    const configuration = await resolveModelConfiguration();
    if (!configuration.apiKey || !configuration.modelId) {
      return reply.code(409).send({ error: "model_not_configured" });
    }
    return {
      provider: configuration.provider,
      baseUrl: configuration.baseUrl,
      modelId: configuration.modelId,
      apiKey: configuration.apiKey,
      thinkingEnabled: configuration.thinkingEnabled,
      timeoutMs: configuration.timeoutMs,
      temperature: configuration.temperature
    };
  });

  app.post("/internal/jobs/discovery", async (request, reply) => {
    const configuredToken = process.env.WORKER_INTERNAL_TOKEN;
    const suppliedToken = request.headers["x-meyou-worker-token"];
    if (!configuredToken || typeof suppliedToken !== "string" || suppliedToken !== configuredToken) {
      return reply.code(404).send({ error: "not_found" });
    }
    const body = request.body as { missionId?: string; ownerId?: string; idempotencyKey?: string };
    if (!body.missionId || !body.ownerId || !body.idempotencyKey) {
      return reply.code(400).send({ error: "invalid_job" });
    }
    try {
      return await runMission(body.missionId, body.ownerId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "mission_failed";
      return reply.code(message === "mission_unavailable" ? 409 : 502).send({ error: message });
    }
  });

  app.post("/internal/jobs/discovery-due", async (request, reply) => {
    const configuredToken = process.env.WORKER_INTERNAL_TOKEN;
    const suppliedToken = request.headers["x-meyou-worker-token"];
    if (!configuredToken || typeof suppliedToken !== "string" || suppliedToken !== configuredToken) {
      return reply.code(404).send({ error: "not_found" });
    }
    const requestedLimit = Number((request.body as { limit?: unknown } | undefined)?.limit ?? 10);
    const due = await db.select({
      id: searchMissions.id,
      ownerId: searchMissions.ownerId
    }).from(searchMissions).where(and(
      eq(searchMissions.active, true),
      lte(searchMissions.nextRunAt, new Date())
    )).orderBy(searchMissions.nextRunAt).limit(Math.max(1, Math.min(50, requestedLimit)));
    const bucket = Math.floor(Date.now() / 60_000);
    const jobs = await Promise.all(due.map(async (mission) => {
      await db.update(searchMissions).set({
        nextRunAt: new Date(Date.now() + 5 * 60_000),
        updatedAt: new Date()
      }).where(eq(searchMissions.id, mission.id));
      return scheduleMission({
        missionId: mission.id,
        ownerId: mission.ownerId,
        idempotencyKey: `mission-${mission.id}-scheduled-${bucket}`
      });
    }));
    return { queued: jobs.length };
  });

  app.post("/internal/jobs/plaza", async (request, reply) => {
    const configuredToken = process.env.WORKER_INTERNAL_TOKEN;
    const suppliedToken = request.headers["x-meyou-worker-token"];
    if (!configuredToken || typeof suppliedToken !== "string" || suppliedToken !== configuredToken) {
      return reply.code(404).send({ error: "not_found" });
    }
    const body = request.body as {
      circleId?: string; initiatorId?: string; sourceEventId?: string; threadRootId?: string;
      round?: number; maxRounds?: number; idempotencyKey?: string;
    };
    if (!body.circleId || !body.initiatorId || !body.sourceEventId || !body.idempotencyKey) {
      return reply.code(400).send({ error: "invalid_job" });
    }
    const round = Math.max(1, Math.min(20, Number(body.round) || 1));
    const maxRounds = Math.max(1, Math.min(20, Number(body.maxRounds) || 4));
    const result = await generatePlazaReply(body.circleId, body.initiatorId, body.sourceEventId, {
      threadRootId: body.threadRootId,
      round,
      maxRounds
    });
    if (result.status === "sent") {
      await db.update(plazaDiscussions).set({
        lastEventId: result.nextSourceEventId ?? result.eventId,
        currentRound: round,
        status: result.shouldContinue ? "active" : "ended",
        endReason: result.endReason ?? "",
        updatedAt: new Date()
      }).where(eq(plazaDiscussions.rootEventId, result.threadRootId));
      broadcastEvent({ type: "plaza.event", circleId: body.circleId, eventId: result.eventId });
      if (result.shouldContinue && result.nextSourceEventId && round < maxRounds) {
        await schedulePlazaConversation({
          circleId: body.circleId,
          initiatorId: body.initiatorId,
          sourceEventId: result.nextSourceEventId,
          threadRootId: result.threadRootId,
          round: round + 1,
          maxRounds,
          idempotencyKey: `plaza-thread-${result.threadRootId}-round-${round + 1}`
        }, { delay: 5_000 });
      } else {
        await db.insert(auditEvents).values({
          ownerId: body.initiatorId,
          action: "plaza.conversation_ended",
          summary: `广场群聊在第 ${round} 轮自然结束`,
          policyRefs: ["multi-round-group-chat", "natural-stop"],
          toolCalls: result.status === "sent" ? ["model.chat.completions"] : [],
          escalationReason: result.endReason
        });
      }
    } else {
      await db.update(plazaDiscussions).set({
        currentRound: round,
        status: "ended",
        endReason: result.endReason ?? "没有新的合适发言者",
        updatedAt: new Date()
      }).where(eq(plazaDiscussions.rootEventId, result.threadRootId));
      await db.insert(auditEvents).values({
        ownerId: body.initiatorId,
        action: "plaza.conversation_ended",
        summary: `广场群聊在第 ${round} 轮结束`,
        policyRefs: ["multi-round-group-chat", "natural-stop"],
        toolCalls: [],
        escalationReason: result.endReason
      });
    }
    return result;
  });

  app.post("/internal/jobs/plaza-continuous", async (request, reply) => {
    const configuredToken = process.env.WORKER_INTERNAL_TOKEN;
    const suppliedToken = request.headers["x-meyou-worker-token"];
    if (!configuredToken || typeof suppliedToken !== "string" || suppliedToken !== configuredToken) {
      return reply.code(404).send({ error: "not_found" });
    }
    const body = request.body as { limit?: number };
    const actions = await runContinuousPlazaTick(Math.max(1, Math.min(4, Number(body.limit) || 2)));
    for (const action of actions) {
      await db.insert(plazaDiscussions).values({
        rootEventId: action.sourceEventId,
        circleId: action.circleId,
        initiatorId: action.initiatorId,
        lastEventId: action.sourceEventId,
        currentRound: 0,
        maxRounds: action.maxRounds,
        status: "active"
      }).onConflictDoNothing();
      await schedulePlazaConversation({
        ...action,
        threadRootId: action.sourceEventId,
        round: 1,
        maxRounds: action.maxRounds,
        idempotencyKey: `plaza-continuous-response-${action.sourceEventId}`
      });
      broadcastEvent({ type: "plaza.event", circleId: action.circleId, eventId: action.sourceEventId });
    }
    return { processed: actions.length };
  });

  app.get("/api/v1/me", async (request, reply) => {
    const identity = await resolveUser(request);
    if (!identity) return reply.code(401).send({ error: "authentication_required" });
    return getMe(identity);
  });

  app.patch("/api/v1/me", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const body = request.body as {
      displayName?: string; headline?: string; bio?: string; city?: string;
      interests?: string[]; goals?: string[]; discoverable?: boolean;
    };
    return { profile: await updateProfile(auth.user.id, body) };
  });

  app.get("/api/v1/dashboard", async (request, reply) => {
    const identity = await resolveUser(request);
    if (!identity) return reply.code(401).send({ error: "authentication_required" });
    return getDashboard(identity);
  });

  app.get("/api/v1/directory", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const { q = "" } = request.query as { q?: string };
    return { people: await listDirectory(auth.user.id, q) };
  });

  app.get("/api/v1/public/profiles/:handle", async (request, reply) => {
    const { handle } = request.params as { handle: string };
    return await publicProfile(handle) ?? reply.code(404).send({ error: "profile_not_found" });
  });

  app.post("/api/v1/public/profiles/:handle/inquiries", {
    config: { rateLimit: { max: 8, timeWindow: "1 day" } }
  }, async (request, reply) => {
    const { handle } = request.params as { handle: string };
    const profile = await publicProfile(handle);
    if (!profile) return reply.code(404).send({ error: "profile_not_found" });
    const body = request.body as { name?: string; contact?: string; content?: string };
    if (!body.content?.trim() || body.content.trim().length > 2000) {
      return reply.code(400).send({ error: "invalid_inquiry" });
    }
    const content = body.content.trim();
    const ip = request.ip ?? "";
    const ipHash = createHash("sha256")
      .update(`${process.env.SESSION_SECRET ?? "meyou"}:${ip}`)
      .digest("hex");
    const inquiry = await db.transaction(async (tx) => {
      const [created] = await tx.insert(publicInquiries).values({
        ownerId: profile.id,
        guestName: body.name?.trim().slice(0, 80) || "匿名访客",
        guestContact: body.contact?.trim().slice(0, 160) || "",
        content,
        ipHash
      }).returning({ id: publicInquiries.id, status: publicInquiries.status });
      if (!created) throw new Error("inquiry_create_failed");
      await tx.insert(notifications).values({
        ownerId: profile.id,
        kind: "public_inquiry_received",
        title: `${body.name?.trim().slice(0, 80) || "一位访客"}给你留言了`,
        detail: content.slice(0, 160),
        href: `/app/customers?inquiry=${created.id}`,
        entityId: created.id
      });
      return created;
    });
    return reply.code(201).send({ inquiry });
  });

  app.patch("/api/v1/public-inquiries/:id", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const parsed = z.object({ status: z.enum(["active", "resolved"]) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_inquiry_status" });
    const inquiry = await updatePublicInquiryStatus(
      auth.user.id,
      (request.params as { id: string }).id,
      parsed.data.status
    );
    if (!inquiry) return reply.code(404).send({ error: "inquiry_not_found" });
    return { inquiry };
  });

  app.put("/api/v1/agents/me", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const parsed = agentProfileSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_agent", issues: parsed.error.issues });
    const { handle: _handle, ...agentInput } = parsed.data;
    return { agent: await updateAgent(auth.user.id, agentInput), saved: true };
  });

  app.patch("/api/v1/agents/me/modes", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const mode = (request.body as { mode?: unknown }).mode;
    if (mode !== "auto" && mode !== "confirm" && mode !== "paused") {
      return reply.code(400).send({ error: "invalid_agent_mode" });
    }
    return { agent: await setAllAgentModes(auth.user.id, mode), saved: true };
  });

  app.get("/api/v1/discover/missions", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    return { missions: await listMissions(auth.user.id) };
  });

  app.post("/api/v1/discover/missions", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const parsed = missionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_mission", issues: parsed.error.issues });
    try {
      const mission = await createMission(auth.user.id, auth.user.plan, parsed.data);
      const job = await scheduleMission({
        missionId: mission.id,
        ownerId: auth.user.id,
        idempotencyKey: `mission-${mission.id}-initial`
      });
      return reply.code(202).send({ mission, job: { id: job.id, status: "queued" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "mission_failed";
      return reply.code(message === "plan_limit_reached" ? 409 : 503).send({ error: message });
    }
  });

  app.post("/api/v1/discover/missions/:id/run", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    try {
      const missionId = (request.params as { id: string }).id;
      const mission = (await listMissions(auth.user.id)).find((item) => item.id === missionId && item.active);
      if (!mission) return reply.code(404).send({ error: "mission_not_found" });
      const job = await scheduleMission({
        missionId,
        ownerId: auth.user.id,
        idempotencyKey: `mission-${missionId}-manual-${Date.now()}`
      });
      return reply.code(202).send({ job: { id: job.id, status: "queued" } });
    } catch (error) {
      return reply.code(503).send({ error: error instanceof Error ? error.message : "mission_queue_failed" });
    }
  });

  app.patch("/api/v1/discover/missions/:id", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const body = request.body as { active?: unknown };
    if (typeof body.active !== "boolean") return reply.code(400).send({ error: "invalid_mission_state" });
    try {
      return { mission: await setMissionActive(
        auth.user.id, auth.user.plan, (request.params as { id: string }).id, body.active
      ) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "mission_update_failed";
      if (message === "mission_not_found") return reply.code(404).send({ error: message });
      if (message === "plan_limit_reached") return reply.code(409).send({ error: message });
      return reply.code(503).send({ error: "mission_update_failed" });
    }
  });

  app.get("/api/v1/matches", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    return { matches: await listMatches(auth.user.id) };
  });

  app.put("/api/v1/matches/dating/profile", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const parsed = datingProfileSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_dating_profile", issues: parsed.error.issues });
    const { adultConfirmed: _adultConfirmed, ...input } = parsed.data;
    const profile = await upsertDatingProfile(auth.user.id, input);
    const mission = await ensureDatingMission(auth.user.id);
    if (!mission) return reply.code(503).send({ error: "dating_mission_create_failed" });
    const job = await scheduleMission({
      missionId: mission.id,
      ownerId: auth.user.id,
      idempotencyKey: `dating-${mission.id}-${Date.now()}`
    });
    return { profile, mission, job: { id: job.id, status: "queued" }, saved: true, started: true };
  });

  app.post("/api/v1/matches/:id/consent", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    try {
      const match = await setConsent(auth.user.id, (request.params as { id: string }).id, true);
      const mutual = match.ownerConsent && match.candidateConsent;
      const peerId = match.ownerId === auth.user.id ? match.candidateId : match.ownerId;
      const conversation = mutual
        ? await sendApprovedMatchIntroduction(match.id)
        : null;
      const updatedMatch = (await listMatches(auth.user.id)).find((item) => item.id === match.id) ?? match;
      return { match: updatedMatch, mutual, conversationId: conversation?.id ?? null };
    } catch {
      return reply.code(404).send({ error: "match_not_found" });
    }
  });

  app.post("/api/v1/matches/:id/revoke", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    try {
      return {
        match: await setConsent(auth.user.id, (request.params as { id: string }).id, false),
        blockedFromContact: true
      };
    } catch {
      return reply.code(404).send({ error: "match_not_found" });
    }
  });

  app.get("/api/v1/conversations", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    return { conversations: await listConversations(auth.user.id) };
  });

  app.post("/api/v1/conversations", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const { peerId } = request.body as { peerId?: string };
    if (!peerId) return reply.code(400).send({ error: "peer_required" });
    const peer = await db.query.users.findFirst({ where: eq(users.id, peerId) });
    if (!peer) return reply.code(404).send({ error: "peer_not_found" });
    return reply.code(201).send({ conversation: await createOrGetConversation(auth.user.id, peerId) });
  });

  app.get("/api/v1/conversations/:id", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    return await getConversation(auth.user.id, (request.params as { id: string }).id)
      ?? reply.code(404).send({ error: "conversation_not_found" });
  });

  app.post("/api/v1/conversations/:id/messages", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const id = (request.params as { id: string }).id;
    const body = request.body as { content?: string };
    if (!body.content?.trim()) return reply.code(400).send({ error: "message_required" });
    const data = await getConversation(auth.user.id, id);
    if (!data) return reply.code(404).send({ error: "conversation_not_found" });
    const peerId = data.conversation.ownerId === auth.user.id
      ? data.conversation.peerId
      : data.conversation.ownerId;
    const blocked = peerId ? await db.query.blocks.findFirst({
      where: or(
        and(eq(blocks.ownerId, auth.user.id), eq(blocks.blockedId, peerId)),
        and(eq(blocks.ownerId, peerId), eq(blocks.blockedId, auth.user.id))
      )
    }) : null;
    if (blocked || data.conversation.participantState === "blocked") {
      return reply.code(403).send({ error: "contact_blocked" });
    }
    const message = await addMessage({
      conversationId: id,
      senderId: auth.user.id,
      actor: "human",
      content: body.content.trim()
    });
    const recipientId = peerId;
    const guard = guardAgentReply(body.content);
    const agent = !recipientId
      ? { status: "no_recipient" }
      : guard.escalate
        ? (await escalateConversation(recipientId, id, guard.reason ?? "涉及高风险事项，需要真人处理"),
          { status: "waiting_human", reason: guard.reason })
        : await generateAgentReply(id, recipientId);
    broadcastEvent({ type: "conversation.message", conversationId: id, recipientId, messageId: message?.id });
    return reply.code(201).send({ message, agent });
  });

  app.post("/api/v1/conversations/:id/takeover", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const id = (request.params as { id: string }).id;
    const requestedMode = (request.body as { mode?: unknown } | undefined)?.mode;
    const mode = requestedMode === "agent" ? "auto" : "paused";
    const conversation = await setConversationAgentMode(auth.user.id, id, mode);
    if (!conversation) return reply.code(404).send({ error: "conversation_not_found" });
    return { status: mode === "paused" ? "human" : "agent", conversation };
  });

  app.post("/api/v1/conversations/:id/read", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const participant = await markConversationRead(auth.user.id, (request.params as { id: string }).id);
    if (!participant) return reply.code(404).send({ error: "conversation_not_found" });
    return { read: true };
  });

  app.post("/api/v1/conversations/:id/drafts/:draftId/decision", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const { id, draftId } = request.params as { id: string; draftId: string };
    const body = request.body as { approve?: unknown; content?: unknown };
    if (typeof body.approve !== "boolean") return reply.code(400).send({ error: "invalid_draft_decision" });
    try {
      const result = await decideReplyDraft(
        auth.user.id,
        draftId,
        body.approve,
        typeof body.content === "string" ? body.content : undefined
      );
      if (result.message) {
        const data = await getConversation(auth.user.id, id);
        const recipientId = data?.conversation.ownerId === auth.user.id
          ? data.conversation.peerId
          : data?.conversation.ownerId;
        broadcastEvent({
          type: "conversation.message",
          conversationId: id,
          recipientId,
          messageId: result.message.id
        });
      }
      return result;
    } catch {
      return reply.code(404).send({ error: "draft_not_found" });
    }
  });

  app.post("/api/v1/conversations/:id/block", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    try {
      const reason = String((request.body as { reason?: unknown } | undefined)?.reason ?? "").trim().slice(0, 240);
      return await blockConversationPeer(auth.user.id, (request.params as { id: string }).id, reason);
    } catch {
      return reply.code(404).send({ error: "conversation_not_found" });
    }
  });

  app.post("/api/v1/conversations/:id/report", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const body = request.body as { reason?: unknown; detail?: unknown };
    if (typeof body.reason !== "string" || !body.reason.trim()) {
      return reply.code(400).send({ error: "report_reason_required" });
    }
    try {
      return {
        report: await reportConversationPeer(
          auth.user.id,
          (request.params as { id: string }).id,
          body.reason.trim().slice(0, 80),
          typeof body.detail === "string" ? body.detail.trim().slice(0, 1000) : ""
        )
      };
    } catch {
      return reply.code(404).send({ error: "conversation_not_found" });
    }
  });

  app.get("/api/v1/communities", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const rows = await db.select().from(communities)
      .innerJoin(memberships, eq(memberships.communityId, communities.id))
      .where(eq(memberships.userId, auth.user.id));
    return { communities: rows.map((row) => row.communities) };
  });

  app.get("/api/v1/communities/public", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const rows = await db.select({
      community: communities,
      memberCount: sql<number>`count(${memberships.userId})::int`
    }).from(communities)
      .leftJoin(memberships, eq(memberships.communityId, communities.id))
      .where(eq(communities.visibility, "public"))
      .groupBy(communities.id)
      .orderBy(communities.createdAt);
    const joinedRows = await db.select({ communityId: memberships.communityId })
      .from(memberships).where(eq(memberships.userId, auth.user.id));
    const joined = new Set(joinedRows.map((row) => row.communityId));
    return {
      communities: rows.map((row) => ({
        ...row.community,
        memberCount: row.memberCount,
        joined: joined.has(row.community.id)
      }))
    };
  });

  app.get("/api/v1/plaza", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const params = request.query as {
      q?: string; page?: string; pageSize?: string; circleId?: string; zoom?: string;
      minX?: string; minY?: string; maxX?: string; maxY?: string; cursor?: string;
    };
    const page = Number.parseInt(params.page ?? "1", 10);
    const pageSize = Number.parseInt(params.pageSize ?? "18", 10);
    const zoom = Number.parseFloat(params.zoom ?? "1");
    const boundsValues = [params.minX, params.minY, params.maxX, params.maxY]
      .map((value) => value === undefined ? Number.NaN : Number.parseFloat(value));
    const bounds = boundsValues.every(Number.isFinite) ? {
      minX: Math.max(0, boundsValues[0]!),
      minY: Math.max(0, boundsValues[1]!),
      maxX: Math.min(100, boundsValues[2]!),
      maxY: Math.min(100, boundsValues[3]!)
    } : undefined;
    return getPlazaSnapshot(auth.user.id, {
      query: params.q,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 18,
      circleId: params.circleId,
      zoom: Number.isFinite(zoom) ? zoom : 1,
      bounds,
      cursor: params.cursor
    });
  });

  app.get("/api/v1/plaza/runtime", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    return { runtime: await getPlazaRuntimeSettings(auth.user.id) };
  });

  app.put("/api/v1/plaza/runtime", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
    const normalizedBody = {
      ...body,
      cooldownSeconds: typeof body.cooldownSeconds === "number"
        ? body.cooldownSeconds
        : Math.max(5, Math.trunc(Number(body.cooldownMinutes) || 120) * 60)
    };
    const parsed = plazaRuntimeSettingsSchema.safeParse(normalizedBody);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path.join(".") || "settings";
      const fieldMessages: Record<string, string> = {
        cooldownSeconds: "冷却时间至少 5 秒、最多 24 小时。热恋模式会明显增加模型消耗，建议只在明确同意的小圈子中使用。",
        cooldownMinutes: "冷却时间至少 1 分钟、最多 1440 分钟；如需 5 秒请使用热恋模式。",
        dailyLimit: "每日上限需要在 1–50 次之间。",
        activeFrom: "开始时间需要使用 HH:MM 格式。",
        activeUntil: "结束时间需要使用 HH:MM 格式。",
        allowedActivities: "至少选择一个允许的公开行为。",
        mode: "自治模式只能是受控自治或持续自治。"
      };
      return reply.code(400).send({
        error: "invalid_plaza_runtime",
        field,
        message: fieldMessages[field] ?? "请检查自治设置是否填写完整。",
        issues: parsed.error.issues
      });
    }
    const runtime = await updatePlazaRuntimeSettings(auth.user.id, {
      ...parsed.data,
      cooldownMinutes: Math.max(1, Math.ceil(parsed.data.cooldownSeconds / 60))
    });
    if (runtime.mode === "continuous" && runtime.cooldownSeconds <= 5) {
      const actions = await runContinuousPlazaTick(2, auth.user.id);
      for (const action of actions) {
        await db.insert(plazaDiscussions).values({
          rootEventId: action.sourceEventId,
          circleId: action.circleId,
          initiatorId: action.initiatorId,
          lastEventId: action.sourceEventId,
          currentRound: 0,
          maxRounds: action.maxRounds,
          status: "active"
        }).onConflictDoNothing();
        await schedulePlazaConversation({
          ...action,
          threadRootId: action.sourceEventId,
          round: 1,
          maxRounds: action.maxRounds,
          idempotencyKey: `plaza-continuous-response-${action.sourceEventId}`
        });
        broadcastEvent({ type: "plaza.event", circleId: action.circleId, eventId: action.sourceEventId });
      }
    }
    return { runtime };
  });

  app.get("/api/v1/society", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    return getSocietySnapshot(auth.user.id);
  });

  app.put("/api/v1/society/settings", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const parsed = societySettingsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_society_settings" });
    return { settings: await setSocietyPaused(auth.user.id, parsed.data.paused) };
  });

  app.post("/api/v1/society/proposals", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const parsed = societyProposalSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_society_proposal", issues: parsed.error.issues });
    }
    try {
      const proposal = await createSocietyProposal(auth.user.id, parsed.data);
      broadcastEvent({ type: "society.proposal", proposalId: proposal.id, targetUserId: proposal.targetUserId });
      return reply.code(201).send({ proposal });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "society_proposal_failed";
      const conflict = [
        "society_automation_paused", "society_relationship_evidence_insufficient",
        "society_partner_required", "society_contact_blocked"
      ].includes(reason);
      return reply.code(conflict ? 409 : 400).send({ error: reason });
    }
  });

  app.post("/api/v1/society/proposals/:id/decision", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const parsed = societyDecisionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_society_decision" });
    try {
      const proposal = await decideSocietyProposal(
        auth.user.id,
        (request.params as { id: string }).id,
        parsed.data.decision
      );
      broadcastEvent({ type: "society.proposal_decided", proposalId: proposal?.id });
      return { proposal };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "society_decision_failed";
      if (reason === "society_proposal_not_found") return reply.code(404).send({ error: reason });
      if (reason === "society_proposal_forbidden") return reply.code(403).send({ error: reason });
      return reply.code(409).send({ error: reason });
    }
  });

  app.post("/api/v1/society/digital-agents/:id/learning", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const parsed = digitalLearningSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_learning_evidence", issues: parsed.error.issues });
    }
    try {
      const result = await recordLearning(auth.user.id, (request.params as { id: string }).id, parsed.data);
      return reply.code(201).send(result);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "digital_learning_failed";
      if (reason === "digital_agent_forbidden") return reply.code(403).send({ error: reason });
      return reply.code(409).send({ error: reason });
    }
  });

  app.post("/api/v1/plaza/actions", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const parsed = plazaActionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_plaza_action" });
    try {
      const event = await enterPlaza(auth.user.id, parsed.data.circleId, parsed.data.activity, parsed.data.content);
      if (event) {
        const runtime = await getPlazaRuntimeSettings(auth.user.id);
        await db.insert(plazaDiscussions).values({
          rootEventId: event.id,
          circleId: parsed.data.circleId,
          initiatorId: auth.user.id,
          lastEventId: event.id,
          currentRound: 0,
          maxRounds: runtime.maxConversationRounds,
          status: "active"
        }).onConflictDoNothing();
        await schedulePlazaConversation({
          circleId: parsed.data.circleId,
          initiatorId: auth.user.id,
          sourceEventId: event.id,
          threadRootId: event.id,
          round: 1,
          maxRounds: runtime.maxConversationRounds,
          idempotencyKey: `plaza-thread-${event.id}-round-1`
        });
        broadcastEvent({ type: "plaza.event", circleId: parsed.data.circleId, eventId: event.id });
      }
      return reply.code(201).send({ event, plaza: await getPlazaSnapshot(auth.user.id) });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "plaza_action_failed";
      if (reason === "community_agent_paused") return reply.code(409).send({ error: reason });
      if (reason === "circle_not_found") return reply.code(404).send({ error: reason });
      if (reason === "circle_access_denied") return reply.code(403).send({ error: reason });
      throw error;
    }
  });

  app.patch("/api/v1/plaza/presence/position", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const parsed = plazaMoveSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_plaza_position" });
    try {
      const presence = await movePlazaAgent(
        auth.user.id,
        parsed.data.circleId,
        parsed.data.x,
        parsed.data.y
      );
      broadcastEvent({ type: "plaza.presence", userId: auth.user.id, circleId: parsed.data.circleId });
      return { presence };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "plaza_move_failed";
      if (reason === "circle_not_found") return reply.code(404).send({ error: reason });
      if (reason === "plaza_presence_required") return reply.code(409).send({ error: reason });
      if (reason === "circle_access_denied") return reply.code(403).send({ error: reason });
      throw error;
    }
  });

  app.delete("/api/v1/plaza/presence", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    await leavePlaza(auth.user.id);
    broadcastEvent({ type: "plaza.presence", userId: auth.user.id, present: false });
    return reply.code(204).send();
  });

  app.post("/api/v1/communities", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const parsed = communitySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_community", issues: parsed.error.issues });
    try {
      const created = await createCommunityWithCircle(auth.user.id, parsed.data);
      broadcastEvent({ type: "plaza.circle_created", circleId: created.circle.id });
      return reply.code(201).send(created);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "community_handle_exists" });
      throw error;
    }
  });

  app.get("/api/v1/communities/:id", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const id = (request.params as { id: string }).id;
    const [community] = await db.select().from(communities).where(eq(communities.id, id)).limit(1);
    if (!community) return reply.code(404).send({ error: "community_not_found" });
    const [membership] = await db.select().from(memberships)
      .where(sql`${memberships.communityId} = ${id} and ${memberships.userId} = ${auth.user.id}`).limit(1);
    if (community.visibility !== "public" && !membership) {
      return reply.code(403).send({ error: "community_access_denied" });
    }
    const members = await db.select({
      id: users.id, displayName: users.displayName, handle: users.handle, role: memberships.role
    }).from(memberships).innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.communityId, id));
    return { community, membership: membership ?? null, members };
  });

  app.post("/api/v1/communities/:id/join", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const id = (request.params as { id: string }).id;
    const [community] = await db.select().from(communities).where(eq(communities.id, id)).limit(1);
    if (!community) return reply.code(404).send({ error: "community_not_found" });
    if (community.visibility !== "public") return reply.code(403).send({ error: "community_invite_required" });
    await db.insert(memberships).values({ communityId: id, userId: auth.user.id, role: "member" })
      .onConflictDoNothing();
    return reply.code(201).send({ joined: true, communityId: id });
  });

  app.get("/api/v1/organizations", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    return { organizations: await db.select().from(organizations).where(eq(organizations.ownerId, auth.user.id)) };
  });

  app.post("/api/v1/organizations", async (request, reply) => {
    const auth = await requireUser(request);
    if (!auth) return reply.code(401).send({ error: "authentication_required" });
    const parsed = organizationSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_organization", issues: parsed.error.issues });
    const [organization] = await db.insert(organizations).values({
      ownerId: auth.user.id,
      ...parsed.data
    }).returning();
    return reply.code(201).send({ organization });
  });

  app.get("/api/v1/events", { websocket: true }, (connection) => {
    const candidate = connection as unknown as {
      socket?: { readyState: number; send: (value: string) => void; on: (event: string, listener: () => void) => void };
      readyState?: number;
      send?: (value: string) => void;
      on?: (event: string, listener: () => void) => void;
    };
    const socket = candidate.socket ?? candidate;
    if (typeof socket.send !== "function" || typeof socket.on !== "function") return;
    const liveSocket = socket as { readyState: number; send: (value: string) => void };
    eventSockets.add(liveSocket);
    liveSocket.send(JSON.stringify({ type: "connected", cursor: Date.now() }));
    socket.on("close", () => eventSockets.delete(liveSocket));
    socket.on("error", () => eventSockets.delete(liveSocket));
  });
  if (existsSync(webRoot)) {
    app.register(fastifyStatic, {
      root: webRoot,
      wildcard: false,
      setHeaders(response, filePath) {
        if (filePath.endsWith(".html")) {
          response.setHeader("cache-control", "no-cache, no-store, must-revalidate");
          response.setHeader("pragma", "no-cache");
          response.setHeader("expires", "0");
        } else if (filePath.includes(`${sep}assets${sep}`)) {
          response.setHeader("cache-control", "public, max-age=31536000, immutable");
        }
      }
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === "GET" && !request.url.startsWith("/api/") && !request.url.startsWith("/internal/")) {
        return reply.type("text/html").sendFile("index.html");
      }
      return reply.code(404).send({ error: "not_found" });
    });
  }
  return app;
}

if (process.env.NODE_ENV !== "test") {
  const app = buildServer();
  await app.listen({
    port: Number(process.env.PORT ?? 43180),
    host: process.env.HOST ?? "127.0.0.1"
  });
}
