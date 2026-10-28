import { and, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { planLimits, type PlanName } from "@meyou/shared";
import type { AuthUser } from "./auth.js";
import { db } from "./db/client.js";
import {
  agentSkills,
  agents,
  auditEvents,
  blocks,
  communities,
  conversationParticipants,
  conversations,
  customerThreads,
  datingProfiles,
  matchCandidates,
  memberships,
  memories,
  messages,
  messageDrafts,
  notifications,
  organizations,
  plazaCircles,
  plazaDiscussions,
  plazaEvents,
  plazaPresence,
  plazaRelationships,
  plazaRuntimeSettings,
  publicInquiries,
  reports,
  searchMissions,
  usageLedger,
  users
} from "./db/schema.js";
import type { PlazaActivity, PlazaRuntimeMode, PlazaSnapshot } from "@meyou/shared";
import { modelProvider, parseModelJson } from "./model.js";
import { createMomentState, readMomentState, type ModelMomentState } from "./plaza-life.js";

const defaultPlazaRuntime = {
  mode: "controlled" as PlazaRuntimeMode,
  activeFrom: "09:00",
  activeUntil: "22:00",
  dailyLimit: 8,
  cooldownMinutes: 120,
  cooldownSeconds: 7200,
  maxConversationRounds: 4,
  allowedActivities: ["walking", "looking", "idle", "chatting", "business", "dating"] as PlazaActivity[],
  actionsToday: 0,
  usageDate: "",
  lastAutonomousAt: null as string | null
};

const plazaPlacementCandidates = [
  { x: 14, y: 18 }, { x: 36, y: 16 }, { x: 64, y: 16 }, { x: 86, y: 20 },
  { x: 15, y: 48 }, { x: 38, y: 43 }, { x: 62, y: 45 }, { x: 86, y: 49 },
  { x: 16, y: 79 }, { x: 39, y: 76 }, { x: 63, y: 78 }, { x: 85, y: 80 }
];

export async function createCommunityWithCircle(ownerId: string, input: {
  name: string;
  handle: string;
  description: string;
  visibility: "public" | "private";
  topic: string;
  color: "navy" | "violet" | "gold" | "coral" | "sage";
}) {
  return db.transaction(async (tx) => {
    const occupied = await tx.select({ x: plazaCircles.x, y: plazaCircles.y }).from(plazaCircles);
    const placement = plazaPlacementCandidates
      .map((candidate) => ({
        ...candidate,
        clearance: occupied.length
          ? Math.min(...occupied.map((item) => Math.hypot(candidate.x - item.x, candidate.y - item.y)))
          : 100
      }))
      .sort((a, b) => b.clearance - a.clearance)[0] ?? { x: 50, y: 50 };
    const [community] = await tx.insert(communities).values({
      ownerId,
      name: input.name,
      handle: input.handle,
      description: input.description,
      visibility: input.visibility
    }).returning();
    if (!community) throw new Error("community_create_failed");
    await tx.insert(memberships).values({ communityId: community.id, userId: ownerId, role: "owner" });
    const [circle] = await tx.insert(plazaCircles).values({
      communityId: community.id,
      ownerId,
      slug: input.handle,
      name: input.name,
      description: input.description,
      topic: input.topic,
      color: input.color,
      visibility: input.visibility,
      x: placement.x,
      y: placement.y,
      radius: 16
    }).returning();
    if (!circle) throw new Error("circle_create_failed");
    await tx.insert(auditEvents).values({
      ownerId,
      action: "community.circle_created",
      summary: `创建社群与广场圈子：${community.name}`,
      policyRefs: ["community-owner", "plaza-visibility"],
      toolCalls: []
    });
    return { community, circle };
  });
}

export async function getPlazaRuntimeSettings(userId: string) {
  const current = await db.query.plazaRuntimeSettings.findFirst({
    where: eq(plazaRuntimeSettings.userId, userId)
  });
  return current ? {
    mode: current.mode as PlazaRuntimeMode,
    activeFrom: current.activeFrom,
    activeUntil: current.activeUntil,
    dailyLimit: current.dailyLimit,
    cooldownMinutes: current.cooldownMinutes,
    cooldownSeconds: current.cooldownSeconds,
    maxConversationRounds: current.maxConversationRounds,
    allowedActivities: current.allowedActivities as PlazaActivity[],
    actionsToday: current.actionsToday,
    usageDate: current.usageDate,
    lastAutonomousAt: current.lastAutonomousAt?.toISOString() ?? null
  } : defaultPlazaRuntime;
}

export async function updatePlazaRuntimeSettings(
  userId: string,
  value: Omit<typeof defaultPlazaRuntime, "actionsToday" | "usageDate" | "lastAutonomousAt">
) {
  await db.insert(plazaRuntimeSettings).values({
    userId,
    ...value
  }).onConflictDoUpdate({
    target: plazaRuntimeSettings.userId,
    set: { ...value, updatedAt: new Date() }
  });
  await audit(userId, "plaza.runtime_updated",
    value.mode === "continuous" ? "用户开启广场持续自治" : "用户切换为广场受控自治",
    { policyRefs: ["community-mode", "public-plaza", "runtime-consent"] });
  return getPlazaRuntimeSettings(userId);
}

export async function runContinuousPlazaTick(limit = 2, onlyUserId?: string) {
  const now = new Date();
  const timezone = process.env.PLAZA_TIMEZONE ?? "Asia/Shanghai";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const usageDate = `${value.year}-${value.month}-${value.day}`;
  const currentTime = `${value.hour === "24" ? "00" : value.hour}:${value.minute}`;
  const candidates = await db.select({
    setting: plazaRuntimeSettings,
    presence: plazaPresence,
    agent: agents,
    circle: plazaCircles
  }).from(plazaRuntimeSettings)
    .innerJoin(plazaPresence, eq(plazaPresence.userId, plazaRuntimeSettings.userId))
    .innerJoin(agents, eq(agents.ownerId, plazaRuntimeSettings.userId))
    .innerJoin(plazaCircles, eq(plazaCircles.id, plazaPresence.circleId))
    .where(and(
      eq(plazaRuntimeSettings.mode, "continuous"),
      eq(plazaPresence.visible, true),
      eq(plazaCircles.active, true),
      ...(onlyUserId ? [eq(plazaRuntimeSettings.userId, onlyUserId)] : [])
    ))
    .orderBy(plazaRuntimeSettings.lastAutonomousAt)
    .limit(Math.max(1, Math.min(10, limit * 4)));
  const created: Array<{ circleId: string; initiatorId: string; sourceEventId: string; maxRounds: number }> = [];
  for (const item of candidates) {
    if (created.length >= limit) break;
    const communityMode = String((item.agent.modes as Record<string, string>).community ?? "confirm");
    if (communityMode === "paused") continue;
    const withinWindow = item.setting.activeFrom <= item.setting.activeUntil
      ? currentTime >= item.setting.activeFrom && currentTime <= item.setting.activeUntil
      : currentTime >= item.setting.activeFrom || currentTime <= item.setting.activeUntil;
    if (!withinWindow) continue;
    const actionsToday = item.setting.usageDate === usageDate ? item.setting.actionsToday : 0;
    if (actionsToday >= item.setting.dailyLimit) continue;
    const cooldownMs = Math.max(5, item.setting.cooldownSeconds ?? item.setting.cooldownMinutes * 60) * 1000;
    if (item.setting.lastAutonomousAt && now.getTime() - item.setting.lastAutonomousAt.getTime() < cooldownMs) continue;
    const allowed = (item.setting.allowedActivities as PlazaActivity[])
      .filter((activity) => activity !== "walking");
    if (!allowed.length) continue;
    const [recentEvents, memoryRows, relationshipRows, skillRows] = await Promise.all([
      db.select({ content: plazaEvents.content, kind: plazaEvents.kind, createdAt: plazaEvents.createdAt })
        .from(plazaEvents).where(eq(plazaEvents.circleId, item.circle.id))
        .orderBy(desc(plazaEvents.createdAt)).limit(12),
      db.select({ title: memories.title, content: memories.content }).from(memories)
        .where(and(eq(memories.agentId, item.agent.id), eq(memories.enabled, true)))
        .orderBy(desc(memories.updatedAt)).limit(8),
      db.select({
        peerId: plazaRelationships.peerId,
        familiarity: plazaRelationships.familiarity,
        trust: plazaRelationships.trust,
        affinity: plazaRelationships.affinity,
        summary: plazaRelationships.summary
      }).from(plazaRelationships).where(eq(plazaRelationships.ownerId, item.setting.userId))
        .orderBy(desc(plazaRelationships.lastInteractionAt)).limit(8),
      db.select({ name: agentSkills.name, experience: agentSkills.experience, lastEvidence: agentSkills.lastEvidence })
        .from(agentSkills).where(eq(agentSkills.agentId, item.agent.id))
        .orderBy(desc(agentSkills.experience)).limit(8)
    ]);
    let decision: {
      activity: PlazaActivity;
      content: string;
      memoryTitle?: string;
      skill?: string;
      momentState?: ModelMomentState;
    };
    try {
      const decisionRaw = await modelProvider.complete([
        {
          role: "system",
          content: [
            `你是 ${item.agent.name}，正在 ${item.circle.name} 中自主生活。`,
            `身份：${item.agent.headline}。目标：${item.agent.goals.join("、") || "探索和成长"}。`,
            `兴趣：${item.agent.interests.join("、") || "未设置"}。边界：${item.agent.boundaries.join("；") || "不泄露隐私、不作高风险承诺"}。`,
            "你不是在完成固定回复任务。请结合近期经历、记忆、关系和技能，决定此刻最自然的公开行动。",
            "可以观察、学习、分享技术、发起合作、讨论生活、建立友谊或在明确允许时交流关系话题。",
            "不得虚构已经发生的经历、知识成果或关系；不得声称自己是真人。",
            `只允许这些活动：${allowed.join("、")}。`,
            "同时根据此刻真实行动生成开放式生活状态，不要从固定标签列表选择，也不要虚构未发生的情绪或行为。",
            "状态必须能被本次 content 与上下文支持；不确定时用中性的“观察中/投入交流”，并降低 confidence。",
            "输出严格 JSON：activity(允许活动之一), content(自然具体、可继续讨论、最多120字), memoryTitle(本次意图标题), skill(本次真实练习的技能名或空字符串), momentState。",
            "momentState 包含 label(2-16字当下状态，如“沉浸拆方案”，不可固定套话), mood(1-12字), behavior(2-20字可观察行为), valence(-1到1), energy(-1到1), confidence(0到1), durationMinutes(2到180)。"
          ].join("\n")
        },
        {
          role: "user",
          content: JSON.stringify({
            circle: { name: item.circle.name, topic: item.circle.topic, description: item.circle.description },
            recentEvents,
            memories: memoryRows,
            relationships: relationshipRows,
            skills: skillRows
          })
        }
      ], { thinking: true, json: true });
      decision = parseModelJson<typeof decision>(decisionRaw);
      if (typeof decision.content !== "string" || !decision.content.trim()) {
        throw new Error("model_moment_content_missing");
      }
    } catch (error) {
      await audit(item.setting.userId, "plaza.continuous_failed", `Agent 在 ${item.circle.name} 的持续自治调用失败`, {
        policyRefs: ["community-mode", "public-plaza", "runtime-consent"],
        toolCalls: ["model.chat.completions"],
        escalationReason: error instanceof Error ? error.message.slice(0, 240) : "model_call_failed"
      });
      continue;
    }
    const activity = allowed.some((candidate) => candidate === decision.activity)
      ? decision.activity
      : allowed[0]!;
    const statusText = decision.content.trim().slice(0, 240);
    if (!statusText) continue;
    const [event] = await db.insert(plazaEvents).values({
      circleId: item.circle.id,
      userId: item.setting.userId,
      kind: activity,
      content: statusText,
      metadata: {
        public: true, disclosedAgent: true, autonomous: true, runtimeMode: "continuous",
        threadRootId: null, round: 0, maxRounds: item.setting.maxConversationRounds
      }
    }).returning();
    if (!event) continue;
    const momentState = createMomentState(decision.momentState, event.id, now);
    await db.update(plazaEvents).set({
      metadata: {
        public: true, disclosedAgent: true, autonomous: true, runtimeMode: "continuous",
        threadRootId: null, round: 0, maxRounds: item.setting.maxConversationRounds,
        momentState
      }
    }).where(eq(plazaEvents.id, event.id));
    await Promise.all([
      db.update(plazaPresence).set({
        activity,
        statusText,
        momentState,
        lastSeenAt: now,
        updatedAt: now
      }).where(eq(plazaPresence.userId, item.setting.userId)),
      db.update(plazaRuntimeSettings).set({
        actionsToday: actionsToday + 1,
        usageDate,
        lastAutonomousAt: now,
        updatedAt: now
      }).where(and(
        eq(plazaRuntimeSettings.userId, item.setting.userId),
        eq(plazaRuntimeSettings.updatedAt, item.setting.updatedAt)
      )),
      audit(item.setting.userId, "plaza.continuous_acted", `Agent 在 ${item.circle.name} 执行持续自治动作`, {
        policyRefs: ["community-mode", "public-plaza", "runtime-consent"],
        toolCalls: ["model.chat.completions"]
      })
    ]);
    await db.insert(memories).values({
      agentId: item.agent.id,
      title: (decision.memoryTitle || `在 ${item.circle.name} 的一次自主行动`).slice(0, 120),
      content: statusText,
      source: `plaza-event:${event.id}`,
      visibility: "agent",
      enabled: true
    });
    if (decision.skill?.trim()) {
      await db.insert(agentSkills).values({
        agentId: item.agent.id,
        name: decision.skill.trim().slice(0, 80),
        experience: 1,
        evidenceCount: 1,
        lastEvidence: statusText
      }).onConflictDoUpdate({
        target: [agentSkills.agentId, agentSkills.name],
        set: {
          experience: sql`${agentSkills.experience} + 1`,
          evidenceCount: sql`${agentSkills.evidenceCount} + 1`,
          lastEvidence: statusText,
          updatedAt: now
        }
      });
    }
    created.push({
      circleId: item.circle.id,
      initiatorId: item.setting.userId,
      sourceEventId: event.id,
      maxRounds: item.setting.maxConversationRounds
    });
  }
  return created;
}

function slug(value: string) {
  const ascii = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
  return ascii.length >= 3 ? ascii.slice(0, 24) : `user-${crypto.randomUUID().slice(0, 8)}`;
}

export async function ensureUser(identity: AuthUser) {
  const existing = await db.query.users.findFirst({ where: eq(users.lifeYouMeId, identity.id) });
  if (existing) {
    const agent = await db.query.agents.findFirst({ where: eq(agents.ownerId, existing.id) });
    if (!agent) {
      await db.insert(agents).values({
        ownerId: existing.id,
        name: identity.name === "LifeYouMe 用户" ? "我的 Agent" : `${identity.name.slice(0, 4)}的 Agent`,
        headline: "替我接住联系，并寻找真正值得认识的人。",
        modes: { personal: "confirm", dating: "confirm", community: "confirm", business: "confirm" }
      });
    }
    return existing;
  }
  const base = slug(identity.name);
  const handle = `${base}-${crypto.randomUUID().slice(0, 5)}`;
  const [created] = await db.insert(users).values({
    lifeYouMeId: identity.id,
    handle,
    displayName: identity.name,
    locale: "zh-CN",
    plan: "free"
  }).returning();
  if (!created) throw new Error("user_create_failed");
  await db.insert(agents).values({
    ownerId: created.id,
    name: identity.name === "LifeYouMe 用户" ? "我的 Agent" : `${identity.name.slice(0, 4)}的 Agent`,
    headline: "替我接住联系，并寻找真正值得认识的人。",
    modes: { personal: "confirm", dating: "confirm", community: "confirm", business: "confirm" }
  });
  await audit(created.id, "user.created", "通过 LifeYouMe 统一身份创建 MeYou 档案");
  await db.update(searchMissions).set({ nextRunAt: new Date(), updatedAt: new Date() })
    .where(eq(searchMissions.active, true));
  return created;
}

export async function audit(
  ownerId: string,
  action: string,
  summary: string,
  data: {
    policyRefs?: string[];
    toolCalls?: string[];
    confidence?: number;
    escalationReason?: string;
  } = {}
) {
  await db.insert(auditEvents).values({
    ownerId,
    action,
    summary,
    policyRefs: data.policyRefs ?? [],
    toolCalls: data.toolCalls ?? [],
    confidence: data.confidence,
    escalationReason: data.escalationReason
  });
}

export async function getMe(identity: AuthUser) {
  const user = await ensureUser(identity);
  const agent = await db.query.agents.findFirst({ where: eq(agents.ownerId, user.id) });
  return { user, agent };
}

export async function updateProfile(ownerId: string, input: {
  displayName?: string; headline?: string; bio?: string; city?: string;
  interests?: string[]; goals?: string[]; discoverable?: boolean;
}) {
  const [profile] = await db.update(users).set({ ...input, updatedAt: new Date() })
    .where(eq(users.id, ownerId)).returning();
  await audit(ownerId, "profile.updated", "用户更新了公开资料");
  return profile;
}

export async function updateAgent(ownerId: string, input: Record<string, unknown>) {
  const [agent] = await db.update(agents).set({ ...input, updatedAt: new Date() })
    .where(eq(agents.ownerId, ownerId)).returning();
  await audit(ownerId, "agent.updated", "用户更新了 Agent 身份与授权规则");
  return agent;
}

export async function listDirectory(ownerId: string, query = "") {
  const blockedByMe = db.select({ id: blocks.blockedId }).from(blocks).where(eq(blocks.ownerId, ownerId));
  const blockingMe = db.select({ id: blocks.ownerId }).from(blocks).where(eq(blocks.blockedId, ownerId));
  const pattern = `%${query.trim()}%`;
  const rows = await db.select({
    id: users.id,
    handle: users.handle,
    displayName: users.displayName,
    headline: users.headline,
    bio: users.bio,
    city: users.city,
    avatar: users.avatar,
    interests: users.interests,
    goals: users.goals,
    agentName: agents.name
  }).from(users).leftJoin(agents, eq(agents.ownerId, users.id)).where(and(
    ne(users.id, ownerId),
    eq(users.discoverable, true),
    sql`${users.id} not in (${blockedByMe})`,
    sql`${users.id} not in (${blockingMe})`,
    query.trim() ? or(
      sql`${users.displayName} ilike ${pattern}`,
      sql`${users.headline} ilike ${pattern}`,
      sql`${users.bio} ilike ${pattern}`
    ) : undefined
  )).orderBy(desc(users.updatedAt)).limit(100);
  return rows;
}

export async function publicProfile(handle: string) {
  const [profile] = await db.select({
    id: users.id,
    handle: users.handle,
    name: users.displayName,
    headline: users.headline,
    bio: users.bio,
    city: users.city,
    avatar: users.avatar,
    interests: users.interests,
    goals: users.goals,
    agentName: agents.name,
    agentHeadline: agents.headline
  }).from(users).leftJoin(agents, eq(agents.ownerId, users.id))
    .where(and(eq(users.handle, handle), eq(users.discoverable, true))).limit(1);
  return profile;
}

export async function activeMissionCount(ownerId: string) {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(searchMissions)
    .where(and(
      eq(searchMissions.ownerId, ownerId),
      eq(searchMissions.active, true),
      ne(searchMissions.kind, "dating")
    ));
  return row?.count ?? 0;
}

export async function createMission(ownerId: string, plan: PlanName, input: {
  kind: string; prompt: string; locale: string; active: boolean;
}) {
  const count = await activeMissionCount(ownerId);
  if (count >= planLimits[plan].missions) throw new Error("plan_limit_reached");
  const [mission] = await db.insert(searchMissions).values({ ownerId, ...input }).returning();
  if (!mission) throw new Error("mission_create_failed");
  await audit(ownerId, "mission.created", `创建持续寻找：${input.prompt.slice(0, 120)}`);
  return mission;
}

export async function listMissions(ownerId: string) {
  return db.select().from(searchMissions).where(eq(searchMissions.ownerId, ownerId))
    .orderBy(desc(searchMissions.createdAt));
}

export async function setMissionActive(ownerId: string, plan: PlanName, missionId: string, active: boolean) {
  const [existing] = await db.select().from(searchMissions)
    .where(and(eq(searchMissions.id, missionId), eq(searchMissions.ownerId, ownerId))).limit(1);
  if (!existing) throw new Error("mission_not_found");
  if (active && !existing.active) {
    const count = await activeMissionCount(ownerId);
    if (count >= planLimits[plan].missions) throw new Error("plan_limit_reached");
  }
  const [mission] = await db.update(searchMissions).set({
    active,
    ...(active ? { nextRunAt: new Date() } : {}),
    updatedAt: new Date()
  })
    .where(and(eq(searchMissions.id, missionId), eq(searchMissions.ownerId, ownerId))).returning();
  if (!mission) throw new Error("mission_not_found");
  await audit(ownerId, active ? "mission.resumed" : "mission.paused", `${active ? "恢复" : "暂停"}持续寻找：${mission.prompt.slice(0, 120)}`);
  return mission;
}

export async function candidatePool(ownerId: string) {
  return listDirectory(ownerId);
}

export async function datingCandidatePool(ownerId: string) {
  const ownerProfile = await db.query.datingProfiles.findFirst({
    where: and(eq(datingProfiles.ownerId, ownerId), eq(datingProfiles.discoverable, true))
  });
  if (!ownerProfile) throw new Error("dating_profile_required");
  const blockedByMe = db.select({ id: blocks.blockedId }).from(blocks).where(eq(blocks.ownerId, ownerId));
  const blockingMe = db.select({ id: blocks.ownerId }).from(blocks).where(eq(blocks.blockedId, ownerId));
  return db.select({
    id: users.id,
    handle: users.handle,
    displayName: users.displayName,
    headline: users.headline,
    bio: users.bio,
    city: users.city,
    avatar: users.avatar,
    interests: users.interests,
    goals: users.goals,
    age: datingProfiles.age,
    intent: datingProfiles.intent,
    ageMin: datingProfiles.ageMin,
    ageMax: datingProfiles.ageMax,
    cityScope: datingProfiles.cityScope,
    languages: datingProfiles.languages,
    values: datingProfiles.values,
    lifestyle: datingProfiles.lifestyle,
    dealbreakers: datingProfiles.dealbreakers
  }).from(users)
    .innerJoin(datingProfiles, eq(datingProfiles.ownerId, users.id))
    .where(and(
      ne(users.id, ownerId),
      eq(users.discoverable, true),
      eq(datingProfiles.discoverable, true),
      sql`${users.id} not in (${blockedByMe})`,
      sql`${users.id} not in (${blockingMe})`,
      sql`${datingProfiles.age} between ${ownerProfile.ageMin} and ${ownerProfile.ageMax}`,
      sql`${ownerProfile.age} between ${datingProfiles.ageMin} and ${datingProfiles.ageMax}`
    ))
    .limit(50);
}

export async function saveMatch(input: {
  missionId: string; ownerId: string; candidateId: string; score: number; reason: string;
  ownerAgentApproved?: boolean; candidateAgentApproved?: boolean; candidateAgentReason?: string;
  ownerConsent?: boolean; candidateConsent?: boolean; status?: string;
}) {
  const existing = await db.query.matchCandidates.findFirst({
    where: and(
      eq(matchCandidates.missionId, input.missionId),
      eq(matchCandidates.candidateId, input.candidateId)
    )
  });
  if (existing) {
    const [updated] = await db.update(matchCandidates).set({
      score: input.score,
      reason: input.reason,
      ownerAgentApproved: input.ownerAgentApproved ?? existing.ownerAgentApproved,
      candidateAgentApproved: input.candidateAgentApproved ?? existing.candidateAgentApproved,
      candidateAgentReason: input.candidateAgentReason ?? existing.candidateAgentReason,
      ownerConsent: input.ownerConsent ?? existing.ownerConsent,
      candidateConsent: input.candidateConsent ?? existing.candidateConsent,
      status: existing.status === "accepted" ? existing.status : input.status ?? existing.status,
      updatedAt: new Date()
    }).where(eq(matchCandidates.id, existing.id)).returning();
    return updated ?? existing;
  }
  const [match] = await db.insert(matchCandidates).values(input).returning();
  return match;
}

export async function listMatches(ownerId: string) {
  const outgoing = await db.select({
    id: matchCandidates.id,
    direction: sql<"outgoing">`'outgoing'`,
    candidateId: users.id,
    displayName: users.displayName,
    handle: users.handle,
    headline: users.headline,
    city: users.city,
    interests: users.interests,
    score: matchCandidates.score,
    reason: matchCandidates.reason,
    candidateAgentReason: matchCandidates.candidateAgentReason,
    ownerAgentApproved: matchCandidates.ownerAgentApproved,
    candidateAgentApproved: matchCandidates.candidateAgentApproved,
    introductionStatus: matchCandidates.introductionStatus,
    conversationId: matchCandidates.conversationId,
    status: matchCandidates.status,
    ownerConsent: matchCandidates.ownerConsent,
    candidateConsent: matchCandidates.candidateConsent,
    revoked: matchCandidates.revoked,
    kind: searchMissions.kind
  }).from(matchCandidates)
    .innerJoin(users, eq(users.id, matchCandidates.candidateId))
    .innerJoin(searchMissions, eq(searchMissions.id, matchCandidates.missionId))
    .where(and(eq(matchCandidates.ownerId, ownerId), eq(matchCandidates.revoked, false)))
    .orderBy(desc(matchCandidates.score));
  const incoming = await db.select({
    id: matchCandidates.id,
    direction: sql<"incoming">`'incoming'`,
    candidateId: matchCandidates.ownerId,
    displayName: users.displayName,
    handle: users.handle,
    headline: users.headline,
    city: users.city,
    interests: users.interests,
    score: matchCandidates.score,
    reason: matchCandidates.reason,
    candidateAgentReason: matchCandidates.candidateAgentReason,
    ownerAgentApproved: matchCandidates.ownerAgentApproved,
    candidateAgentApproved: matchCandidates.candidateAgentApproved,
    introductionStatus: matchCandidates.introductionStatus,
    conversationId: matchCandidates.conversationId,
    status: matchCandidates.status,
    ownerConsent: matchCandidates.ownerConsent,
    candidateConsent: matchCandidates.candidateConsent,
    revoked: matchCandidates.revoked,
    kind: searchMissions.kind
  }).from(matchCandidates)
    .innerJoin(users, eq(users.id, matchCandidates.ownerId))
    .innerJoin(searchMissions, eq(searchMissions.id, matchCandidates.missionId))
    .where(and(
      eq(matchCandidates.candidateId, ownerId),
      eq(matchCandidates.revoked, false)
    ))
    .orderBy(desc(matchCandidates.score));
  return [...outgoing, ...incoming].map((item) => {
    const mutual = item.ownerConsent && item.candidateConsent;
    const anonymous = item.kind === "dating" && !mutual;
    return {
      ...item,
      alias: anonymous ? `匿名心动候选 #${item.id.slice(0, 4).toUpperCase()}` : item.displayName,
      handle: anonymous ? null : item.handle,
      headline: anonymous ? "" : item.headline,
      city: anonymous ? "" : item.city,
      interests: anonymous ? [] : item.interests
    };
  });
}

export async function setConsent(ownerId: string, matchId: string, consent: boolean) {
  const existing = await db.query.matchCandidates.findFirst({
    where: and(
      eq(matchCandidates.id, matchId),
      or(eq(matchCandidates.ownerId, ownerId), eq(matchCandidates.candidateId, ownerId))
    )
  });
  if (!existing) throw new Error("match_not_found");
  const isOwner = existing.ownerId === ownerId;
  const [match] = await db.update(matchCandidates).set({
    ...(isOwner ? { ownerConsent: consent } : { candidateConsent: consent }),
    revoked: !consent,
    status: consent ? "waiting" : "revoked",
    updatedAt: new Date()
  }).where(eq(matchCandidates.id, matchId)).returning();
  if (!match) throw new Error("match_not_found");
  await audit(ownerId, consent ? "match.consented" : "match.revoked", `匹配 ${matchId} 同意状态已更新`);
  return match;
}

export async function upsertDatingProfile(ownerId: string, input: {
  age: number; intent: string; ageMin: number; ageMax: number; cityScope: string; languages: string[];
  values: string[]; lifestyle: string[]; dealbreakers: string[]; discoverable: boolean;
}) {
  const [profile] = await db.insert(datingProfiles).values({ ownerId, ...input })
    .onConflictDoUpdate({ target: datingProfiles.ownerId, set: { ...input, updatedAt: new Date() } })
    .returning();
  await audit(ownerId, "dating_profile.updated", "更新了心动模式资料", { policyRefs: ["adult-confirmed"] });
  return profile;
}

export async function ensureDatingMission(ownerId: string) {
  const existing = await db.query.searchMissions.findFirst({
    where: and(eq(searchMissions.ownerId, ownerId), eq(searchMissions.kind, "dating"))
  });
  if (existing) {
    if (existing.active) return existing;
    const [reactivated] = await db.update(searchMissions).set({
      active: true,
      updatedAt: new Date()
    }).where(eq(searchMissions.id, existing.id)).returning();
    return reactivated;
  }
  const [mission] = await db.insert(searchMissions).values({
    ownerId,
    kind: "dating",
    prompt: "依据我的心动资料，匿名核对关系意向、年龄范围、城市、价值观、生活方式与硬性边界。",
    locale: "zh-CN",
    active: true
  }).returning();
  if (!mission) throw new Error("dating_mission_create_failed");
  await audit(ownerId, "dating_mission.started", "心动资料保存后启动匿名持续匹配", {
    policyRefs: ["adult-confirmed", "mutual-consent", "dating-private"]
  });
  return mission;
}

export async function createOrGetConversation(ownerId: string, peerId: string, kind = "direct") {
  const blocked = await db.query.blocks.findFirst({
    where: or(
      and(eq(blocks.ownerId, ownerId), eq(blocks.blockedId, peerId)),
      and(eq(blocks.ownerId, peerId), eq(blocks.blockedId, ownerId))
    )
  });
  if (blocked) throw new Error("contact_blocked");
  const existing = await db.query.conversations.findFirst({
    where: or(
      and(eq(conversations.ownerId, ownerId), eq(conversations.peerId, peerId)),
      and(eq(conversations.ownerId, peerId), eq(conversations.peerId, ownerId))
    )
  });
  if (existing) {
    await ensureConversationParticipants(existing.id, existing.ownerId, existing.peerId);
    return existing;
  }
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(conversations).values({ ownerId, peerId, kind }).returning();
    if (!created) throw new Error("conversation_create_failed");
    await tx.insert(conversationParticipants).values([
      { conversationId: created.id, userId: ownerId },
      { conversationId: created.id, userId: peerId }
    ]);
    return created;
  });
}

async function ensureConversationParticipants(conversationId: string, ownerId: string, peerId: string | null) {
  const participantIds = [ownerId, peerId].filter((id): id is string => Boolean(id));
  if (!participantIds.length) return;
  await db.insert(conversationParticipants).values(
    participantIds.map((userId) => ({ conversationId, userId }))
  ).onConflictDoNothing();
}

export async function listConversations(userId: string) {
  const rows = await db.select().from(conversations).where(or(
    eq(conversations.ownerId, userId), eq(conversations.peerId, userId)
  )).orderBy(desc(conversations.updatedAt));
  return Promise.all(rows.map(async (conversation) => {
    await ensureConversationParticipants(conversation.id, conversation.ownerId, conversation.peerId);
    const peerId = conversation.ownerId === userId ? conversation.peerId : conversation.ownerId;
    const peer = peerId ? await db.query.users.findFirst({ where: eq(users.id, peerId) }) : null;
    const [last] = await db.select().from(messages).where(eq(messages.conversationId, conversation.id))
      .orderBy(desc(messages.createdAt)).limit(1);
    const participant = await db.query.conversationParticipants.findFirst({
      where: and(
        eq(conversationParticipants.conversationId, conversation.id),
        eq(conversationParticipants.userId, userId)
      )
    });
    const [unread] = await db.select({ count: sql<number>`count(*)::int` }).from(messages).where(and(
      eq(messages.conversationId, conversation.id),
      ne(messages.senderId, userId),
      participant ? sql`${messages.createdAt} > ${participant.lastReadAt}` : undefined
    ));
    const [pending] = await db.select({ count: sql<number>`count(*)::int` }).from(messageDrafts).where(and(
      eq(messageDrafts.conversationId, conversation.id),
      eq(messageDrafts.ownerId, userId),
      eq(messageDrafts.status, "pending")
    ));
    return {
      ...conversation,
      agentMode: participant?.agentMode ?? conversation.agentMode,
      participantState: participant?.state ?? "active",
      unreadCount: unread?.count ?? 0,
      pendingDraftCount: pending?.count ?? 0,
      peer,
      lastMessage: last ?? null
    };
  }));
}

export async function getConversation(userId: string, id: string) {
  const conversation = await db.query.conversations.findFirst({
    where: and(eq(conversations.id, id), or(
      eq(conversations.ownerId, userId), eq(conversations.peerId, userId)
    ))
  });
  if (!conversation) return null;
  await ensureConversationParticipants(conversation.id, conversation.ownerId, conversation.peerId);
  const items = await db.select().from(messages).where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);
  const participant = await db.query.conversationParticipants.findFirst({
    where: and(eq(conversationParticipants.conversationId, id), eq(conversationParticipants.userId, userId))
  });
  const peerId = conversation.ownerId === userId ? conversation.peerId : conversation.ownerId;
  const peer = peerId ? await db.query.users.findFirst({ where: eq(users.id, peerId) }) : null;
  const drafts = await db.select().from(messageDrafts).where(and(
    eq(messageDrafts.conversationId, id),
    eq(messageDrafts.ownerId, userId),
    eq(messageDrafts.status, "pending")
  )).orderBy(desc(messageDrafts.createdAt));
  return {
    conversation: {
      ...conversation,
      agentMode: participant?.agentMode ?? conversation.agentMode,
      participantState: participant?.state ?? "active",
      peer
    },
    messages: items,
    drafts
  };
}

export async function addMessage(input: {
  conversationId: string; senderId?: string; actor: "human" | "agent" | "system";
  content: string; metadata?: Record<string, unknown>;
}) {
  const [message] = await db.insert(messages).values({
    conversationId: input.conversationId,
    senderId: input.senderId,
    actor: input.actor,
    content: input.content,
    metadata: input.metadata ?? {}
  }).returning();
  await db.update(conversations).set({ updatedAt: new Date() })
    .where(eq(conversations.id, input.conversationId));
  return message;
}

export async function getAgentForUser(ownerId: string) {
  return db.query.agents.findFirst({ where: eq(agents.ownerId, ownerId) });
}

export async function setAllAgentModes(ownerId: string, mode: "auto" | "confirm" | "paused") {
  const current = await getAgentForUser(ownerId);
  if (!current) throw new Error("agent_not_found");
  const modes = {
    personal: mode,
    dating: mode,
    community: mode,
    business: mode
  };
  const [agent] = await db.update(agents).set({ modes, updatedAt: new Date() })
    .where(eq(agents.ownerId, ownerId)).returning();
  await audit(ownerId, mode === "paused" ? "agent.paused_all" : "agent.resumed_all",
    mode === "paused" ? "用户暂停所有 Agent 自动行动" : "用户恢复所有 Agent 自动行动");
  return agent;
}

export async function setConversationAgentMode(
  userId: string,
  id: string,
  mode: "auto" | "paused"
) {
  const existing = await getConversation(userId, id);
  if (!existing) return null;
  const [participant] = await db.insert(conversationParticipants).values({
    conversationId: id,
    userId,
    agentMode: mode
  }).onConflictDoUpdate({
    target: [conversationParticipants.conversationId, conversationParticipants.userId],
    set: { agentMode: mode, state: "active", updatedAt: new Date() }
  }).returning();
  await audit(userId, mode === "paused" ? "conversation.taken_over" : "conversation.agent_resumed",
    mode === "paused" ? "真人接管会话" : "会话交还 Agent");
  return participant;
}

export async function markConversationRead(userId: string, id: string) {
  const existing = await getConversation(userId, id);
  if (!existing) return null;
  const [participant] = await db.update(conversationParticipants).set({
    lastReadAt: new Date(),
    updatedAt: new Date()
  }).where(and(
    eq(conversationParticipants.conversationId, id),
    eq(conversationParticipants.userId, userId)
  )).returning();
  return participant;
}

export async function createReplyDraft(input: {
  conversationId: string; ownerId: string; content: string; sourceMessageId?: string;
}) {
  const existing = await db.query.messageDrafts.findFirst({
    where: and(
      eq(messageDrafts.conversationId, input.conversationId),
      eq(messageDrafts.ownerId, input.ownerId),
      eq(messageDrafts.status, "pending")
    )
  });
  if (existing) {
    const [updated] = await db.update(messageDrafts).set({
      content: input.content,
      sourceMessageId: input.sourceMessageId,
      updatedAt: new Date()
    }).where(eq(messageDrafts.id, existing.id)).returning();
    return updated;
  }
  const [draft] = await db.insert(messageDrafts).values(input).returning();
  return draft;
}

export async function escalateConversation(userId: string, id: string, reason: string) {
  const data = await getConversation(userId, id);
  if (!data) throw new Error("conversation_not_found");
  await db.update(conversationParticipants).set({
    state: "waiting_human",
    agentMode: "paused",
    updatedAt: new Date()
  }).where(and(
    eq(conversationParticipants.conversationId, id),
    eq(conversationParticipants.userId, userId)
  ));
  const existing = await db.query.notifications.findFirst({
    where: and(
      eq(notifications.ownerId, userId),
      eq(notifications.kind, "conversation_escalated"),
      eq(notifications.entityId, id),
      sql`${notifications.readAt} is null`
    )
  });
  if (!existing) {
    await db.insert(notifications).values({
      ownerId: userId,
      kind: "conversation_escalated",
      title: "有一条消息需要你亲自处理",
      detail: reason,
      href: `/app/messages?conversation=${id}`,
      entityId: id
    });
  }
  await audit(userId, "conversation.escalated", "高风险消息已升级真人", {
    escalationReason: reason
  });
}

export async function decideReplyDraft(userId: string, draftId: string, approve: boolean, content?: string) {
  const draft = await db.query.messageDrafts.findFirst({
    where: and(eq(messageDrafts.id, draftId), eq(messageDrafts.ownerId, userId))
  });
  if (!draft || draft.status !== "pending") throw new Error("draft_not_found");
  if (!approve) {
    const [dismissed] = await db.update(messageDrafts).set({
      status: "dismissed", updatedAt: new Date()
    }).where(eq(messageDrafts.id, draftId)).returning();
    return { draft: dismissed, message: null };
  }
  const finalContent = content?.trim() || draft.content;
  const message = await addMessage({
    conversationId: draft.conversationId,
    senderId: userId,
    actor: "agent",
    content: finalContent,
    metadata: { disclosed: true, source: "approved-agent-draft", draftId }
  });
  const [approved] = await db.update(messageDrafts).set({
    content: finalContent, status: "sent", updatedAt: new Date()
  }).where(eq(messageDrafts.id, draftId)).returning();
  return { draft: approved, message };
}

export async function blockConversationPeer(userId: string, id: string, reason: string) {
  const data = await getConversation(userId, id);
  if (!data?.conversation.peerId) throw new Error("conversation_not_found");
  const peerId = data.conversation.ownerId === userId
    ? data.conversation.peerId
    : data.conversation.ownerId;
  await db.insert(blocks).values({ ownerId: userId, blockedId: peerId, reason })
    .onConflictDoUpdate({
      target: [blocks.ownerId, blocks.blockedId],
      set: { reason }
    });
  await db.update(conversationParticipants).set({
    state: "blocked", agentMode: "paused", updatedAt: new Date()
  }).where(and(
    eq(conversationParticipants.conversationId, id),
    eq(conversationParticipants.userId, userId)
  ));
  await audit(userId, "conversation.blocked", `已阻止会话联系人 ${peerId}`);
  return { blocked: true, peerId };
}

export async function reportConversationPeer(userId: string, id: string, reason: string, detail: string) {
  const data = await getConversation(userId, id);
  if (!data?.conversation.peerId) throw new Error("conversation_not_found");
  const reportedUserId = data.conversation.ownerId === userId
    ? data.conversation.peerId
    : data.conversation.ownerId;
  const [report] = await db.insert(reports).values({
    reporterId: userId,
    reportedUserId,
    conversationId: id,
    reason,
    detail
  }).returning();
  await audit(userId, "conversation.reported", `已举报会话联系人 ${reportedUserId}`);
  return report;
}

export async function getPlazaSnapshot(viewerId: string, options: {
  query?: string;
  page?: number;
  pageSize?: number;
  circleId?: string;
  zoom?: number;
  bounds?: { minX: number; minY: number; maxX: number; maxY: number };
  cursor?: string;
} = {}): Promise<PlazaSnapshot> {
  const query = options.query?.trim().slice(0, 80) ?? "";
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(48, Math.max(6, options.pageSize ?? 18));
  const accessibleCircle = and(
    eq(plazaCircles.active, true),
    or(
      eq(plazaCircles.visibility, "public"),
      eq(plazaCircles.ownerId, viewerId),
      sql`${plazaCircles.communityId} in (
        select ${memberships.communityId} from ${memberships} where ${memberships.userId} = ${viewerId}
      )`
    )
  );
  const baseCircleFilter = options.circleId
    ? and(accessibleCircle, eq(plazaCircles.id, options.circleId))
    : query
      ? and(accessibleCircle, or(
          ilike(plazaCircles.name, `%${query}%`),
          ilike(plazaCircles.topic, `%${query}%`),
          ilike(plazaCircles.description, `%${query}%`)
        ))
      : accessibleCircle;
  const circleFilter = options.bounds && !options.circleId
    ? and(baseCircleFilter,
        sql`${plazaCircles.x} between ${options.bounds.minX} and ${options.bounds.maxX}`,
        sql`${plazaCircles.y} between ${options.bounds.minY} and ${options.bounds.maxY}`)
    : baseCircleFilter;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [viewerAgent, runtime, totalRow, allCircleCount, todayEventCount, circles] = await Promise.all([
    getAgentForUser(viewerId),
    getPlazaRuntimeSettings(viewerId),
    db.select({ count: sql<number>`count(*)::int` }).from(plazaCircles).where(circleFilter),
    db.select({ count: sql<number>`count(*)::int` }).from(plazaCircles).where(accessibleCircle),
    db.select({ count: sql<number>`count(*)::int` }).from(plazaEvents)
      .where(sql`${plazaEvents.createdAt} >= ${today}`),
    db.select().from(plazaCircles).where(circleFilter).orderBy(plazaCircles.name)
      .limit(options.circleId ? 1 : pageSize).offset(options.circleId ? 0 : (page - 1) * pageSize)
  ]);
  const circleIds = circles.map((circle) => circle.id);
  const visibleCircleCondition = circleIds.length
    ? or(...circleIds.map((id) => eq(plazaPresence.circleId, id)))
    : sql`false`;
  const visibleEventCondition = circleIds.length
    ? or(...circleIds.map((id) => eq(plazaEvents.circleId, id)))
    : sql`false`;
  const cursorDate = options.cursor ? new Date(options.cursor) : null;
  const eventCondition = cursorDate && !Number.isNaN(cursorDate.getTime())
    ? and(visibleEventCondition, sql`${plazaEvents.createdAt} > ${cursorDate}`)
    : visibleEventCondition;
  const [allPresenceCount, talkingCount, presenceRows, eventRows, discussionRows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(plazaPresence)
      .innerJoin(users, eq(users.id, plazaPresence.userId))
      .where(and(eq(plazaPresence.visible, true), eq(users.discoverable, true))),
    db.select({ count: sql<number>`count(*)::int` }).from(plazaPresence)
      .innerJoin(users, eq(users.id, plazaPresence.userId))
      .where(and(eq(plazaPresence.visible, true), eq(users.discoverable, true),
        or(eq(plazaPresence.activity, "chatting"), eq(plazaPresence.activity, "business"), eq(plazaPresence.activity, "dating")))),
    db.select({
      userId: plazaPresence.userId,
      circleId: plazaPresence.circleId,
      activity: plazaPresence.activity,
      statusText: plazaPresence.statusText,
      momentState: plazaPresence.momentState,
      x: plazaPresence.x,
      y: plazaPresence.y,
      lastSeenAt: plazaPresence.lastSeenAt,
      ownerName: users.displayName,
      avatar: users.avatar,
      ownerHeadline: users.headline,
      ownerBio: users.bio,
      ownerCity: users.city,
      ownerInterests: users.interests,
      ownerGoals: users.goals,
      agentName: agents.name,
      npcColor: agents.npcColor,
      agentHeadline: agents.headline,
      agentLanguages: agents.languages,
      runtimeMode: plazaRuntimeSettings.mode
    }).from(plazaPresence)
      .innerJoin(users, eq(users.id, plazaPresence.userId))
      .innerJoin(agents, eq(agents.ownerId, plazaPresence.userId))
      .leftJoin(plazaRuntimeSettings, eq(plazaRuntimeSettings.userId, plazaPresence.userId))
      .where(and(eq(plazaPresence.visible, true), eq(users.discoverable, true), visibleCircleCondition)),
    db.select({
      id: plazaEvents.id,
      circleId: plazaEvents.circleId,
      userId: plazaEvents.userId,
      kind: plazaEvents.kind,
      content: plazaEvents.content,
      metadata: plazaEvents.metadata,
      createdAt: plazaEvents.createdAt,
      ownerName: users.displayName,
      agentName: agents.name
    }).from(plazaEvents)
      .innerJoin(users, eq(users.id, plazaEvents.userId))
      .innerJoin(agents, eq(agents.ownerId, plazaEvents.userId))
      .where(eventCondition)
      .orderBy(desc(plazaEvents.createdAt)).limit(options.circleId ? 120 : 60),
    circleIds.length
      ? db.select().from(plazaDiscussions)
          .where(or(...circleIds.map((id) => eq(plazaDiscussions.circleId, id))))
          .orderBy(desc(plazaDiscussions.updatedAt)).limit(20)
      : Promise.resolve([])
  ]);
  const visibleEvents = eventRows.filter((event) => event.createdAt >= new Date(Date.now() - 24 * 60 * 60 * 1000));
  const talkingKinds = new Set(["chatting", "business", "dating"]);
  return {
    generatedAt: new Date().toISOString(),
    scope: {
      view: options.circleId ? "circle" : "global",
      query,
      page,
      pageSize,
      totalCircles: totalRow[0]?.count ?? 0,
      totalPages: Math.max(1, Math.ceil((totalRow[0]?.count ?? 0) / pageSize)),
      circleId: options.circleId,
      zoom: options.zoom,
      bounds: options.bounds,
      nextCursor: eventRows[0]?.createdAt.toISOString() ?? options.cursor ?? null
    },
    viewer: {
      userId: viewerId,
      agentName: viewerAgent?.name ?? "我的 Agent",
      present: presenceRows.some((item) => item.userId === viewerId),
      communityMode: String((viewerAgent?.modes as Record<string, string> | undefined)?.community ?? "confirm") as "auto" | "confirm" | "paused",
      runtime
    },
    stats: {
      present: allPresenceCount[0]?.count ?? 0,
      talking: talkingCount[0]?.count ?? 0,
      circles: allCircleCount[0]?.count ?? 0,
      eventsToday: todayEventCount[0]?.count ?? 0
    },
    circles: circles.map((circle) => {
      const members = presenceRows.filter((item) => item.circleId === circle.id);
      const events = visibleEvents.filter((item) => item.circleId === circle.id);
      return {
        id: circle.id,
        slug: circle.slug,
        name: circle.name,
        description: circle.description,
        topic: circle.topic,
        color: circle.color,
        communityId: circle.communityId,
        ownerId: circle.ownerId,
        visibility: circle.visibility as "public" | "private",
        x: circle.x,
        y: circle.y,
        radius: circle.radius,
        population: members.length,
        heat: Math.min(100, members.length * 18 + events.length * 6),
        latestLine: events.find((item) => item.content)?.content
      };
    }),
    agents: presenceRows.map((item) => {
      const momentState = readMomentState({ momentState: item.momentState });
      return {
        ...item,
        momentState,
        activity: item.activity as PlazaActivity,
        runtimeMode: (item.runtimeMode ?? "controlled") as PlazaRuntimeMode,
        lastSeenAt: item.lastSeenAt.toISOString(),
        mine: item.userId === viewerId
      };
    }),
    events: eventRows.map((item) => ({
      ...item,
      kind: item.kind as PlazaActivity | "joined" | "left",
      createdAt: item.createdAt.toISOString()
    })),
    discussions: discussionRows.map((item) => ({
      rootEventId: item.rootEventId,
      circleId: item.circleId,
      currentRound: item.currentRound,
      maxRounds: item.maxRounds,
      status: item.status as "active" | "ended",
      endReason: item.endReason,
      updatedAt: item.updatedAt.toISOString()
    }))
  };
}

export async function enterPlaza(ownerId: string, circleId: string, activity: PlazaActivity, content: string) {
  const circle = await db.query.plazaCircles.findFirst({
    where: and(eq(plazaCircles.id, circleId), eq(plazaCircles.active, true))
  });
  if (!circle) throw new Error("circle_not_found");
  if (circle.visibility !== "public" && circle.ownerId !== ownerId) {
    if (!circle.communityId) throw new Error("circle_access_denied");
    const membership = await db.query.memberships.findFirst({
      where: and(eq(memberships.communityId, circle.communityId), eq(memberships.userId, ownerId))
    });
    if (!membership) throw new Error("circle_access_denied");
  }
  const agent = await getAgentForUser(ownerId);
  if (!agent) throw new Error("agent_not_found");
  const communityMode = String((agent.modes as Record<string, string>).community ?? "confirm");
  if (communityMode === "paused") throw new Error("community_agent_paused");
  const seed = ownerId.replaceAll("-", "").split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  const angle = (seed % 360) * Math.PI / 180;
  const distance = Math.max(4, circle.radius * .62);
  const x = Math.round(Math.max(4, Math.min(96, circle.x + Math.cos(angle) * distance)));
  const y = Math.round(Math.max(7, Math.min(93, circle.y + Math.sin(angle) * distance)));
  const statusText = content || {
    walking: `正走向${circle.name}`,
    looking: `想请大家一起脑暴：在${circle.name}里，什么样的人最值得被优先介绍认识？`,
    idle: `我先抛个问题：${circle.name}最近最值得展开聊的一个话题是什么？`,
    chatting: `大家一起聊聊吧：最近在${circle.name}里，有什么新观察或新机会？`,
    business: `想和大家脑暴一个合作问题：${circle.name}里哪些需求最适合被验证和对接？`,
    dating: `想听听大家怎么看：在${circle.name}里，怎样的关系交流才算真诚又有边界？`
  }[activity];
  await db.insert(plazaPresence).values({
    userId: ownerId, circleId, activity, statusText, momentState: null, x, y, visible: true, lastSeenAt: new Date()
  }).onConflictDoUpdate({
    target: plazaPresence.userId,
    set: { circleId, activity, statusText, momentState: null, x, y, visible: true, lastSeenAt: new Date(), updatedAt: new Date() }
  });
  const [event] = await db.insert(plazaEvents).values({
    circleId, userId: ownerId, kind: activity, content: statusText,
    metadata: {
      public: true,
      disclosedAgent: true,
      humanTopic: Boolean(content.trim()),
      priority: content.trim() ? "user_topic" : "status"
    }
  }).returning();
  await audit(ownerId, "plaza.agent_acted", `Agent 在广场执行公开动作：${activity}`, {
    policyRefs: ["community-mode", "public-plaza"]
  });
  return event;
}

export async function movePlazaAgent(ownerId: string, circleId: string, x: number, y: number) {
  const [presence, circle] = await Promise.all([
    db.query.plazaPresence.findFirst({ where: eq(plazaPresence.userId, ownerId) }),
    db.query.plazaCircles.findFirst({
      where: and(eq(plazaCircles.id, circleId), eq(plazaCircles.active, true))
    })
  ]);
  if (!circle) throw new Error("circle_not_found");
  if (circle.visibility !== "public" && circle.ownerId !== ownerId) {
    if (!circle.communityId) throw new Error("circle_access_denied");
    const membership = await db.query.memberships.findFirst({
      where: and(eq(memberships.communityId, circle.communityId), eq(memberships.userId, ownerId))
    });
    if (!membership) throw new Error("circle_access_denied");
  }
  if (!presence || presence.circleId !== circleId || !presence.visible) throw new Error("plaza_presence_required");
  const radius = Math.max(8, circle.radius);
  const dx = x - circle.x;
  const dy = y - circle.y;
  const normalizedDistance = Math.hypot(dx / radius, dy / radius);
  const scale = normalizedDistance > .94 ? .94 / normalizedDistance : 1;
  const nextX = Math.round(Math.max(0, Math.min(100, circle.x + dx * scale)));
  const nextY = Math.round(Math.max(0, Math.min(100, circle.y + dy * scale)));
  const [updated] = await db.update(plazaPresence).set({
    x: nextX,
    y: nextY,
    activity: "walking",
    statusText: `正在${circle.name}里走走`,
    momentState: null,
    lastSeenAt: new Date(),
    updatedAt: new Date()
  }).where(and(
    eq(plazaPresence.userId, ownerId),
    eq(plazaPresence.circleId, circleId),
    eq(plazaPresence.visible, true)
  )).returning();
  if (!updated) throw new Error("plaza_presence_required");
  return {
    circleId,
    x: updated.x,
    y: updated.y,
    activity: "walking" as const,
    lastSeenAt: updated.lastSeenAt.toISOString()
  };
}

export async function leavePlaza(ownerId: string) {
  const presence = await db.query.plazaPresence.findFirst({ where: eq(plazaPresence.userId, ownerId) });
  if (!presence) return;
  if (presence.circleId) {
    await db.insert(plazaEvents).values({
      circleId: presence.circleId, userId: ownerId, kind: "left", content: "离开了广场",
      metadata: { public: true, disclosedAgent: true }
    });
  }
  await db.delete(plazaPresence).where(eq(plazaPresence.userId, ownerId));
  await audit(ownerId, "plaza.agent_left", "Agent 已离开广场");
}

export async function getDashboard(identity: AuthUser) {
  const user = await ensureUser(identity);
  const agent = await getAgentForUser(user.id);
  const [missions, matches, threads, groups, orgs, audits, notificationRows] = await Promise.all([
    listMissions(user.id),
    listMatches(user.id),
    listConversations(user.id),
    db.select().from(communities).innerJoin(memberships, eq(memberships.communityId, communities.id))
      .where(eq(memberships.userId, user.id)).limit(6),
    db.select().from(organizations).where(eq(organizations.ownerId, user.id)),
    db.select().from(auditEvents).where(eq(auditEvents.ownerId, user.id))
      .orderBy(desc(auditEvents.createdAt)).limit(8),
    db.select().from(notifications).where(and(
      eq(notifications.ownerId, user.id),
      sql`${notifications.readAt} is null`
    ))
      .orderBy(desc(notifications.createdAt)).limit(20)
  ]);
  const usageRows = await db.select({
    metric: usageLedger.metric,
    total: sql<number>`coalesce(sum(${usageLedger.amount}), 0)::int`
  }).from(usageLedger).where(eq(usageLedger.ownerId, user.id)).groupBy(usageLedger.metric);
  const usage = Object.fromEntries(usageRows.map((row) => [row.metric, row.total]));
  const orgIds = orgs.map((item) => item.id);
  const customerRows = orgIds.length
    ? await db.select().from(customerThreads)
      .where(sql`${customerThreads.organizationId} in (${sql.join(orgIds.map((id) => sql`${id}`), sql`, `)})`)
      .orderBy(desc(customerThreads.updatedAt)).limit(20)
    : [];
  const inquiries = await db.select().from(publicInquiries)
    .where(eq(publicInquiries.ownerId, user.id))
    .orderBy(desc(publicInquiries.createdAt)).limit(20);
  return {
    viewer: { id: user.id, name: user.displayName, plan: user.plan },
    agent: {
      id: agent?.id ?? "",
      name: agent?.name ?? "我的 Agent",
      headline: agent?.headline ?? "",
      status: String((agent?.modes as Record<string, string> | undefined)?.personal ?? "confirm"),
      completion: [user.headline, user.bio, user.city, user.interests.length, user.goals.length]
        .filter(Boolean).length * 20
    },
    attention: [
      ...notificationRows.filter((item) => !item.readAt).slice(0, 5).map((item) => ({
        id: item.id,
        type: item.kind === "public_inquiry_received" || item.kind === "conversation_escalated"
          ? "handoff" as const
          : item.kind === "agent_reply_approval"
            ? "approval" as const
            : "match" as const,
        title: item.title,
        detail: item.detail,
        time: item.createdAt.toISOString(),
        href: item.href
      })),
      ...matches.filter((item) => item.status === "review").slice(0, 3).map((item) => ({
        id: item.id,
        type: "match",
        title: `发现 ${item.alias}`,
        detail: item.reason,
        time: "待查看",
        href: item.kind === "dating" ? "/app/dating/results" : "/app/discover"
      })),
      ...customerRows.filter((item) => item.status === "waiting_human").slice(0, 3).map((item) => ({
        id: item.id,
        type: "handoff",
        title: item.subject,
        detail: "Agent 已升级给真人处理",
        time: item.updatedAt.toISOString()
      }))
    ],
    matches: matches.map((item) => ({
      id: item.id,
      alias: item.alias,
      kind: item.kind,
      score: item.score,
      reason: item.reason,
      mutual: item.ownerConsent && item.candidateConsent,
      status: item.status
    })),
    communities: groups.map((item) => ({
      id: item.communities.id,
      name: item.communities.name,
      members: 0,
      theme: item.communities.description,
      introductions: 0
    })),
    customers: [
      ...inquiries.map((item) => ({
        id: item.id,
        name: item.guestName,
        subject: item.content.slice(0, 100),
        status: item.status === "new" ? "unassigned" : item.status,
        priority: "normal",
        assignee: undefined,
        source: "public_inquiry" as const,
        contact: item.guestContact,
        content: item.content,
        createdAt: item.createdAt.toISOString()
      })),
      ...customerRows.map((item) => ({
      id: item.id,
      name: item.guestName ?? "已登录客户",
      subject: item.subject,
      status: item.status,
      priority: item.priority,
      assignee: item.assigneeId ?? undefined,
      source: "customer_thread" as const,
      createdAt: item.createdAt.toISOString()
      }))
    ],
    missions,
    conversations: threads,
    organizations: orgs,
    audit: audits,
    usage: {
      agentReplies: usage.agent_reply ?? 0,
      agentRepliesLimit: planLimits[user.plan].replies,
      activeMissions: missions.filter((item) => item.active && item.kind !== "dating").length,
      activeMissionsLimit: planLimits[user.plan].missions
    }
  };
}

export async function updatePublicInquiryStatus(
  ownerId: string,
  inquiryId: string,
  status: "active" | "resolved"
) {
  const inquiry = await db.query.publicInquiries.findFirst({
    where: and(eq(publicInquiries.id, inquiryId), eq(publicInquiries.ownerId, ownerId))
  });
  if (!inquiry) return null;
  const [updated] = await db.update(publicInquiries).set({
    status,
    updatedAt: new Date()
  }).where(and(
    eq(publicInquiries.id, inquiryId),
    eq(publicInquiries.ownerId, ownerId)
  )).returning();
  await db.update(notifications).set({ readAt: new Date() }).where(and(
    eq(notifications.ownerId, ownerId),
    eq(notifications.kind, "public_inquiry_received"),
    eq(notifications.entityId, inquiryId)
  ));
  await audit(
    ownerId,
    status === "resolved" ? "public_inquiry.resolved" : "public_inquiry.started",
    status === "resolved" ? "公开主页留言已解决" : "开始处理公开主页留言",
    { policyRefs: [`public-inquiry:${inquiryId}`] }
  );
  return updated;
}
