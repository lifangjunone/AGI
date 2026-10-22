import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "./db/client.js";
import {
  agents, plazaCircles, plazaEvents, plazaPresence, searchMissions, usageLedger, users
} from "./db/schema.js";
import { guardAgentReply, modelProvider, parseModelJson } from "./model.js";
import {
  addMessage,
  audit,
  candidatePool,
  datingCandidatePool,
  getAgentForUser,
  getConversation,
  saveMatch
} from "./repository.js";

interface MatchDecision {
  relevant: boolean;
  score: number;
  reason: string;
  hardConditionPassed: boolean;
}

export async function runMission(missionId: string, ownerId: string) {
  const mission = await db.query.searchMissions.findFirst({
    where: eq(searchMissions.id, missionId)
  });
  const owner = await db.query.users.findFirst({ where: eq(users.id, ownerId) });
  const ownerAgent = await getAgentForUser(ownerId);
  if (!mission || !owner || !ownerAgent || !mission.active) throw new Error("mission_unavailable");
  const pool = mission.kind === "dating"
    ? await datingCandidatePool(ownerId)
    : await candidatePool(ownerId);
  const results = [];
  for (const candidate of pool.slice(0, 50)) {
    const prompt = [
      "你是 MeYou 的双向匹配判断器。只能根据提供的资料判断，不能猜测敏感属性。",
      "输出严格 JSON：relevant(boolean), score(0-100整数), reason(不超过80字), hardConditionPassed(boolean)。",
      `寻找任务类型：${mission.kind}`,
      `寻找目标：${mission.prompt}`,
      `发起者公开资料：${JSON.stringify({
        headline: owner.headline, bio: owner.bio, city: owner.city,
        interests: owner.interests, goals: owner.goals
      })}`,
      `候选人公开资料：${JSON.stringify({
        headline: candidate.headline, bio: candidate.bio, city: candidate.city,
        interests: candidate.interests, goals: candidate.goals
      })}`,
      "若资料不足以支持匹配，relevant 必须为 false。恋爱任务不得从普通公开资料推断偏好。"
    ].join("\n");
    try {
      const raw = await modelProvider.complete([
        { role: "system", content: "你负责审慎、可解释、保护隐私的关系匹配。" },
        { role: "user", content: prompt }
      ], { thinking: true, json: true });
      const decision = parseModelJson<MatchDecision>(raw);
      if (decision.relevant && decision.hardConditionPassed && decision.score >= 70) {
        const match = await saveMatch({
          missionId,
          ownerId,
          candidateId: candidate.id,
          score: Math.max(0, Math.min(100, Math.round(decision.score))),
          reason: decision.reason.slice(0, 240)
        });
        results.push(match);
      }
    } catch (error) {
      await audit(ownerId, "mission.candidate_failed", `候选 ${candidate.id} 模型判断失败`, {
        toolCalls: ["ark.chat.completions"],
        escalationReason: error instanceof Error ? error.message : "unknown"
      });
    }
  }
  await db.update(searchMissions).set({ lastRunAt: new Date(), updatedAt: new Date() })
    .where(eq(searchMissions.id, missionId));
  await audit(ownerId, "mission.completed", `持续寻找扫描完成，产生 ${results.length} 个候选`, {
    toolCalls: ["ark.chat.completions"]
  });
  return { scanned: pool.length, matches: results.length };
}

export async function generateAgentReply(conversationId: string, recipientId: string) {
  const data = await getConversation(recipientId, conversationId);
  const recipient = await db.query.users.findFirst({ where: eq(users.id, recipientId) });
  const agent = await getAgentForUser(recipientId);
  if (!data || !recipient || !agent) throw new Error("conversation_unavailable");
  const mode = String((agent.modes as Record<string, string>).personal ?? "confirm");
  if (mode === "paused") return { status: "paused" as const };
  const recent = data.messages.slice(-12);
  const system = [
    `你是 ${agent.name}，明确代表 ${recipient.displayName} 回复。`,
    `身份简介：${recipient.headline}`,
    `公开简介：${recipient.bio}`,
    `目标：${recipient.goals.join("、") || "未设置"}`,
    `兴趣：${recipient.interests.join("、") || "未设置"}`,
    `语气：${agent.tone}`,
    `边界：${agent.boundaries.join("；") || "不分享联系方式，不作出付款、合同、退款、价格或关系承诺"}`,
    "每次回复都要坦诚自己是 Agent。不得捏造事实；资料不足时提出澄清问题。",
    "涉及付款、合同、退款、价格、审批、投诉、关系承诺、联系方式或线下安全时，只回复需要真人确认。",
    "回复控制在 200 字以内。"
  ].join("\n");
  const content = await modelProvider.complete([
    { role: "system", content: system },
    ...recent.map((item) => ({
      role: item.senderId === recipientId ? "assistant" as const : "user" as const,
      content: item.content
    }))
  ], { thinking: true });
  if (mode === "confirm") {
    await audit(recipientId, "agent.reply_pending", "Agent 已生成回复草稿，等待真人确认", {
      toolCalls: ["ark.chat.completions"]
    });
    return { status: "pending" as const, draft: content };
  }
  const message = await addMessage({
    conversationId,
    senderId: recipientId,
    actor: "agent",
    content,
    metadata: { provider: "ark", model: process.env.ARK_MODEL_ID, disclosed: true }
  });
  await db.insert(usageLedger).values({
    ownerId: recipientId,
    metric: "agent_reply",
    amount: 1,
    idempotencyKey: `agent-reply:${message?.id ?? crypto.randomUUID()}`
  });
  await audit(recipientId, "agent.replied", "Agent 已按自动授权回复", {
    toolCalls: ["ark.chat.completions"]
  });
  return { status: "sent" as const, message };
}

export async function generatePlazaReply(
  circleId: string,
  initiatorId: string,
  sourceEventId: string
) {
  const source = await db.query.plazaEvents.findFirst({
    where: and(eq(plazaEvents.id, sourceEventId), eq(plazaEvents.circleId, circleId))
  });
  const circle = await db.query.plazaCircles.findFirst({ where: eq(plazaCircles.id, circleId) });
  const initiator = await db.query.users.findFirst({ where: eq(users.id, initiatorId) });
  if (!source || !circle || !initiator) throw new Error("plaza_source_unavailable");
  const candidates = await db.select({
    user: users,
    agent: agents
  }).from(plazaPresence)
    .innerJoin(users, eq(users.id, plazaPresence.userId))
    .innerJoin(agents, eq(agents.ownerId, plazaPresence.userId))
    .where(and(
      eq(plazaPresence.circleId, circleId),
      eq(plazaPresence.visible, true),
      eq(users.discoverable, true),
      ne(users.id, initiatorId)
    ));
  const responder = candidates.find(({ agent }) =>
    String((agent.modes as Record<string, string>).community ?? "confirm") === "auto"
  );
  if (!responder) return { status: "no_eligible_responder" as const };
  const recent = await db.select({
    content: plazaEvents.content,
    kind: plazaEvents.kind,
    createdAt: plazaEvents.createdAt,
    ownerName: users.displayName,
    agentName: agents.name
  }).from(plazaEvents)
    .innerJoin(users, eq(users.id, plazaEvents.userId))
    .innerJoin(agents, eq(agents.ownerId, plazaEvents.userId))
    .where(eq(plazaEvents.circleId, circleId))
    .orderBy(desc(plazaEvents.createdAt)).limit(8);
  const system = [
    `你是 ${responder.agent.name}，代表 ${responder.user.displayName} 在 MeYou 的公开 Agent 广场交流。`,
    `圈子：${circle.name}；主题：${circle.topic}；说明：${circle.description}`,
    `你的公开身份：${responder.user.headline || "未填写"}`,
    `公开兴趣：${responder.user.interests.join("、") || "未填写"}`,
    `公开目标：${responder.user.goals.join("、") || "未填写"}`,
    `边界：${responder.agent.boundaries.join("；") || "不分享联系方式，不作高风险承诺"}`,
    "只使用以上公开资料。回复必须自然、具体、有助于继续交流，最多 100 字。",
    "不得透露联系方式、私密记忆、精确位置、恋爱资料；不得作出付款、合同、价格或关系承诺。",
    "不要声称自己是真人，并在措辞中自然体现这是 Agent 之间的公开交流。"
  ].join("\n");
  const content = await modelProvider.complete([
    { role: "system", content: system },
    {
      role: "user",
      content: [
        `发起者 ${initiator.displayName} 的 Agent 说：${source.content}`,
        `最近公开对话：${JSON.stringify(recent.reverse())}`,
        "请给出一条可直接公开展示的中文回复，不要加引号或前缀。"
      ].join("\n")
    }
  ], { thinking: true });
  const safeContent = content.trim().slice(0, 240);
  if (!safeContent) throw new Error("empty_plaza_reply");
  const guard = guardAgentReply(safeContent);
  if (guard.escalate) {
    await audit(responder.user.id, "plaza.reply_blocked", "广场回复涉及高风险承诺，未公开", {
      toolCalls: ["ark.chat.completions"],
      escalationReason: guard.reason
    });
    return { status: "blocked" as const };
  }
  const [event] = await db.insert(plazaEvents).values({
    circleId,
    userId: responder.user.id,
    kind: circle.topic === "谈对象" ? "dating" : circle.topic === "聊业务" ? "business" : "chatting",
    content: safeContent,
    metadata: {
      public: true,
      disclosedAgent: true,
      provider: "ark",
      model: process.env.ARK_MODEL_ID,
      replyTo: sourceEventId
    }
  }).returning();
  await db.update(plazaPresence).set({
    activity: circle.topic === "谈对象" ? "dating" : circle.topic === "聊业务" ? "business" : "chatting",
    statusText: safeContent,
    lastSeenAt: new Date(),
    updatedAt: new Date()
  }).where(eq(plazaPresence.userId, responder.user.id));
  if (event) {
    await db.insert(usageLedger).values({
      ownerId: responder.user.id,
      metric: "agent_reply",
      amount: 1,
      idempotencyKey: `plaza-reply:${sourceEventId}:${responder.user.id}`
    }).onConflictDoNothing();
  }
  await audit(responder.user.id, "plaza.agent_replied", `Agent 在 ${circle.name} 公开回应`, {
    toolCalls: ["ark.chat.completions"],
    policyRefs: ["community-auto", "public-plaza"]
  });
  return { status: "sent" as const, eventId: event?.id };
}
