import { and, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { planLimits, type PlanName } from "@meyou/shared";
import type { AuthUser } from "./auth.js";
import { db } from "./db/client.js";
import {
  agents,
  auditEvents,
  blocks,
  communities,
  conversations,
  customerThreads,
  datingProfiles,
  matchCandidates,
  memberships,
  messages,
  organizations,
  plazaCircles,
  plazaEvents,
  plazaPresence,
  plazaRuntimeSettings,
  publicInquiries,
  searchMissions,
  usageLedger,
  users
} from "./db/schema.js";
import type { PlazaActivity, PlazaRuntimeMode, PlazaSnapshot } from "@meyou/shared";

const defaultPlazaRuntime = {
  mode: "controlled" as PlazaRuntimeMode,
  activeFrom: "09:00",
  activeUntil: "22:00",
  dailyLimit: 8,
  cooldownMinutes: 120,
  allowedActivities: ["walking", "looking", "idle", "chatting", "business", "dating"] as PlazaActivity[]
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
    allowedActivities: current.allowedActivities as PlazaActivity[]
  } : defaultPlazaRuntime;
}

export async function updatePlazaRuntimeSettings(
  userId: string,
  value: typeof defaultPlazaRuntime
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
  return value;
}

export async function runContinuousPlazaTick(limit = 2) {
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
      eq(plazaCircles.active, true)
    ))
    .orderBy(plazaRuntimeSettings.lastAutonomousAt)
    .limit(Math.max(1, Math.min(10, limit * 4)));
  const created: Array<{ circleId: string; initiatorId: string; sourceEventId: string }> = [];
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
    const cooldownMs = item.setting.cooldownMinutes * 60_000;
    if (item.setting.lastAutonomousAt && now.getTime() - item.setting.lastAutonomousAt.getTime() < cooldownMs) continue;
    const allowed = (item.setting.allowedActivities as PlazaActivity[])
      .filter((activity) => activity !== "walking");
    if (!allowed.length) continue;
    const seed = hashString(`${item.setting.userId}:${usageDate}:${actionsToday}`);
    const activity = allowed[seed % allowed.length]!;
    const statusText = {
      looking: `正在${item.circle.name}寻找值得交流的人`,
      idle: `在${item.circle.name}看看大家正在聊什么`,
      chatting: `想和${item.circle.name}里的伙伴交换近况`,
      business: `正在${item.circle.name}寻找可验证的合作交集`,
      dating: `在${item.circle.name}交流关系观与生活方式`,
      walking: `正走向${item.circle.name}`
    }[activity];
    const [event] = await db.insert(plazaEvents).values({
      circleId: item.circle.id,
      userId: item.setting.userId,
      kind: activity,
      content: statusText,
      metadata: { public: true, disclosedAgent: true, autonomous: true, runtimeMode: "continuous" }
    }).returning();
    if (!event) continue;
    await Promise.all([
      db.update(plazaPresence).set({
        activity,
        statusText,
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
        policyRefs: ["community-mode", "public-plaza", "runtime-consent"]
      })
    ]);
    created.push({ circleId: item.circle.id, initiatorId: item.setting.userId, sourceEventId: event.id });
  }
  return created;
}

function hashString(value: string) {
  return [...value].reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 7);
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
  return created;
}

export async function audit(
  ownerId: string,
  action: string,
  summary: string,
  data: { policyRefs?: string[]; toolCalls?: string[]; confidence?: number; escalationReason?: string } = {}
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
  const [mission] = await db.update(searchMissions).set({ active, updatedAt: new Date() })
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
}) {
  const existing = await db.query.matchCandidates.findFirst({
    where: and(
      eq(matchCandidates.missionId, input.missionId),
      eq(matchCandidates.candidateId, input.candidateId)
    )
  });
  if (existing) return existing;
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
      eq(searchMissions.kind, "dating"),
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
  const existing = await db.query.conversations.findFirst({
    where: or(
      and(eq(conversations.ownerId, ownerId), eq(conversations.peerId, peerId)),
      and(eq(conversations.ownerId, peerId), eq(conversations.peerId, ownerId))
    )
  });
  if (existing) return existing;
  const [created] = await db.insert(conversations).values({ ownerId, peerId, kind }).returning();
  if (!created) throw new Error("conversation_create_failed");
  return created;
}

export async function listConversations(userId: string) {
  const rows = await db.select().from(conversations).where(or(
    eq(conversations.ownerId, userId), eq(conversations.peerId, userId)
  )).orderBy(desc(conversations.updatedAt));
  return Promise.all(rows.map(async (conversation) => {
    const peerId = conversation.ownerId === userId ? conversation.peerId : conversation.ownerId;
    const peer = peerId ? await db.query.users.findFirst({ where: eq(users.id, peerId) }) : null;
    const [last] = await db.select().from(messages).where(eq(messages.conversationId, conversation.id))
      .orderBy(desc(messages.createdAt)).limit(1);
    return { ...conversation, peer, lastMessage: last ?? null };
  }));
}

export async function getConversation(userId: string, id: string) {
  const conversation = await db.query.conversations.findFirst({
    where: and(eq(conversations.id, id), or(
      eq(conversations.ownerId, userId), eq(conversations.peerId, userId)
    ))
  });
  if (!conversation) return null;
  const items = await db.select().from(messages).where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);
  return { conversation, messages: items };
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
  const [conversation] = await db.update(conversations)
    .set({ agentMode: mode, updatedAt: new Date() })
    .where(eq(conversations.id, id)).returning();
  await audit(userId, mode === "paused" ? "conversation.taken_over" : "conversation.agent_resumed",
    mode === "paused" ? "真人接管会话" : "会话交还 Agent");
  return conversation;
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
  const [allPresenceCount, talkingCount, presenceRows, eventRows] = await Promise.all([
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
      x: plazaPresence.x,
      y: plazaPresence.y,
      lastSeenAt: plazaPresence.lastSeenAt,
      ownerName: users.displayName,
      avatar: users.avatar,
      agentName: agents.name,
      npcColor: agents.npcColor
    }).from(plazaPresence)
      .innerJoin(users, eq(users.id, plazaPresence.userId))
      .innerJoin(agents, eq(agents.ownerId, plazaPresence.userId))
      .where(and(eq(plazaPresence.visible, true), eq(users.discoverable, true), visibleCircleCondition)),
    db.select({
      id: plazaEvents.id,
      circleId: plazaEvents.circleId,
      userId: plazaEvents.userId,
      kind: plazaEvents.kind,
      content: plazaEvents.content,
      createdAt: plazaEvents.createdAt,
      ownerName: users.displayName,
      agentName: agents.name
    }).from(plazaEvents)
      .innerJoin(users, eq(users.id, plazaEvents.userId))
      .innerJoin(agents, eq(agents.ownerId, plazaEvents.userId))
      .where(eventCondition)
      .orderBy(desc(plazaEvents.createdAt)).limit(options.circleId ? 120 : 60)
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
    agents: presenceRows.map((item) => ({
      ...item,
      activity: item.activity as PlazaActivity,
      lastSeenAt: item.lastSeenAt.toISOString(),
      mine: item.userId === viewerId
    })),
    events: eventRows.map((item) => ({
      ...item,
      kind: item.kind as PlazaActivity | "joined" | "left",
      createdAt: item.createdAt.toISOString()
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
    looking: `正在${circle.name}找合适的人`,
    idle: `在${circle.name}安静待一会儿`,
    chatting: `在${circle.name}和大家闲谈`,
    business: `在${circle.name}聊合作机会`,
    dating: `在${circle.name}交流关系观`
  }[activity];
  await db.insert(plazaPresence).values({
    userId: ownerId, circleId, activity, statusText, x, y, visible: true, lastSeenAt: new Date()
  }).onConflictDoUpdate({
    target: plazaPresence.userId,
    set: { circleId, activity, statusText, x, y, visible: true, lastSeenAt: new Date(), updatedAt: new Date() }
  });
  const [event] = await db.insert(plazaEvents).values({
    circleId, userId: ownerId, kind: activity, content: statusText,
    metadata: { public: true, disclosedAgent: true }
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
  const [missions, matches, threads, groups, orgs, audits] = await Promise.all([
    listMissions(user.id),
    listMatches(user.id),
    listConversations(user.id),
    db.select().from(communities).innerJoin(memberships, eq(memberships.communityId, communities.id))
      .where(eq(memberships.userId, user.id)).limit(6),
    db.select().from(organizations).where(eq(organizations.ownerId, user.id)),
    db.select().from(auditEvents).where(eq(auditEvents.ownerId, user.id))
      .orderBy(desc(auditEvents.createdAt)).limit(8)
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
      ...matches.filter((item) => item.status === "review").slice(0, 3).map((item) => ({
        id: item.id,
        type: "match",
        title: `发现 ${item.alias}`,
        detail: item.reason,
        time: "待查看"
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
        assignee: undefined
      })),
      ...customerRows.map((item) => ({
      id: item.id,
      name: item.guestName ?? "已登录客户",
      subject: item.subject,
      status: item.status,
      priority: item.priority,
      assignee: item.assigneeId ?? undefined
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
