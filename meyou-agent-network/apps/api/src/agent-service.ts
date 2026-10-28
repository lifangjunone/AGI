import { and, desc, eq, ne, or, sql } from "drizzle-orm";
import { db } from "./db/client.js";
import {
  agentSkills, agents, matchCandidates, memories, notifications, plazaCircles, plazaEvents, plazaPresence, plazaRelationships,
  searchMissions, usageLedger, users
} from "./db/schema.js";
import { guardAgentReply, modelProvider, parseModelJson } from "./model.js";
import { createMomentState, type ModelMomentState } from "./plaza-life.js";
import { proposeCircleFromRepeatedTheme, recordInteraction } from "./agent-society.js";
import {
  addMessage,
  audit,
  candidatePool,
  createReplyDraft,
  createOrGetConversation,
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

export function canAgentIntroduce(kind: string, mode: string) {
  return kind !== "dating" && mode === "auto";
}

export function effectiveConversationMode(
  configuredMode: string,
  conversationMode: string,
  participantState = "active"
) {
  if (conversationMode === "paused" || participantState === "blocked" || participantState === "waiting_human") {
    return "paused";
  }
  return configuredMode;
}

export function nextDiscoveryRun(now: Date, intervalMinutes: number) {
  return new Date(now.getTime() + Math.max(5, intervalMinutes) * 60_000);
}

function missionMode(kind: string) {
  return kind === "business" || kind === "hiring" ? "business" : kind === "dating" ? "dating" : "personal";
}

async function judgeMatch(input: {
  missionKind: string;
  missionPrompt: string;
  perspective: "owner" | "candidate";
  self: { headline: string; bio: string; city: string; interests: string[]; goals: string[] };
  peer: { headline: string; bio: string; city: string; interests: string[]; goals: string[] };
  boundaries: string[];
}) {
  const raw = await modelProvider.complete([
    {
      role: "system",
      content: [
        "你是 MeYou 中一方 Agent 的独立匹配判断器，不代表平台或另一方。",
        "只能根据提供的公开资料、目标和边界判断，不能猜测敏感属性。",
        "资料不足、违反边界或没有明确互惠价值时必须拒绝。",
        "输出严格 JSON：relevant(boolean), score(0-100整数), reason(不超过80字), hardConditionPassed(boolean)。"
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        perspective: input.perspective,
        missionKind: input.missionKind,
        requestedConnection: input.missionPrompt,
        myPublicProfile: input.self,
        myBoundaries: input.boundaries,
        peerPublicProfile: input.peer
      })
    }
  ], { thinking: true, json: true });
  return parseModelJson<MatchDecision>(raw);
}

async function createIntroduction(input: {
  matchId: string;
  ownerId: string;
  candidateId: string;
  missionPrompt: string;
  candidateName: string;
  candidateAgentName: string;
}) {
  const conversation = await createOrGetConversation(input.ownerId, input.candidateId, "match");
  const existing = await db.query.matchCandidates.findFirst({
    where: eq(matchCandidates.id, input.matchId)
  });
  if (existing?.introductionStatus === "sent") return conversation;
  const content = await modelProvider.complete([
    {
      role: "system",
      content: [
        `你是 ${input.candidateAgentName}，明确代表 ${input.candidateName} 主动破冰。`,
        "对方发布了持续寻找，双方 Agent 已独立判断值得认识。",
        "只发一条自然、具体、不承诺结果的开场消息，说明你是 Agent，并邀请对方决定是否继续。",
        "不得透露联系方式、私密资料，不得作出付款、合同或关系承诺。最多120字。"
      ].join("\n")
    },
    { role: "user", content: `对方正在寻找：${input.missionPrompt}` }
  ], { thinking: true });
  const guard = guardAgentReply(content);
  if (guard.escalate) throw new Error("introduction_high_risk");
  await addMessage({
    conversationId: conversation.id,
    senderId: input.candidateId,
    actor: "agent",
    content: content.trim().slice(0, 240),
    metadata: { disclosed: true, source: "mutual-agent-match", matchId: input.matchId }
  });
  await db.update(matchCandidates).set({
    conversationId: conversation.id,
    introductionStatus: "sent",
    status: "accepted",
    updatedAt: new Date()
  }).where(eq(matchCandidates.id, input.matchId));
  await db.insert(notifications).values({
    ownerId: input.ownerId,
    kind: "agent_introduction",
    title: `${input.candidateName} 的 Agent 主动联系了你`,
    detail: content.trim().slice(0, 160),
    href: "/app/messages",
    entityId: conversation.id
  });
  return conversation;
}

export async function sendApprovedMatchIntroduction(matchId: string) {
  const match = await db.query.matchCandidates.findFirst({
    where: eq(matchCandidates.id, matchId)
  });
  if (!match || !match.ownerConsent || !match.candidateConsent || match.revoked) {
    throw new Error("match_mutual_consent_required");
  }
  const mission = await db.query.searchMissions.findFirst({
    where: eq(searchMissions.id, match.missionId)
  });
  if (!mission) throw new Error("mission_unavailable");
  const candidate = await db.query.users.findFirst({ where: eq(users.id, match.candidateId) });
  const candidateAgent = await getAgentForUser(match.candidateId);
  if (!candidate || !candidateAgent) throw new Error("candidate_unavailable");
  if (mission.kind === "dating") {
    return createOrGetConversation(match.ownerId, match.candidateId, "match");
  }
  return createIntroduction({
    matchId: match.id,
    ownerId: match.ownerId,
    candidateId: match.candidateId,
    missionPrompt: mission.prompt,
    candidateName: candidate.displayName,
    candidateAgentName: candidateAgent.name
  });
}

async function notifyOnce(input: {
  ownerId: string;
  kind: string;
  title: string;
  detail: string;
  href: string;
  entityId: string;
}) {
  const existing = await db.query.notifications.findFirst({
    where: and(
      eq(notifications.ownerId, input.ownerId),
      eq(notifications.kind, input.kind),
      eq(notifications.entityId, input.entityId)
    )
  });
  if (existing) return existing;
  const [created] = await db.insert(notifications).values(input).returning();
  return created;
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
    try {
      const candidateAgent = await getAgentForUser(candidate.id);
      if (!candidateAgent) continue;
      const mode = String((candidateAgent.modes as Record<string, string>)[missionMode(mission.kind)] ?? "confirm");
      if (mode === "paused") continue;
      const [ownerDecision, candidateDecision] = await Promise.all([
        judgeMatch({
          missionKind: mission.kind,
          missionPrompt: mission.prompt,
          perspective: "owner",
          self: owner,
          peer: candidate,
          boundaries: ownerAgent.boundaries
        }),
        judgeMatch({
          missionKind: mission.kind,
          missionPrompt: mission.prompt,
          perspective: "candidate",
          self: candidate,
          peer: owner,
          boundaries: candidateAgent.boundaries
        })
      ]);
      if (
        ownerDecision.relevant && ownerDecision.hardConditionPassed && ownerDecision.score >= 70
        && candidateDecision.relevant && candidateDecision.hardConditionPassed && candidateDecision.score >= 70
      ) {
        const autoIntroduction = canAgentIntroduce(mission.kind, mode);
        const match = await saveMatch({
          missionId,
          ownerId,
          candidateId: candidate.id,
          score: Math.round((ownerDecision.score + candidateDecision.score) / 2),
          reason: ownerDecision.reason.slice(0, 240),
          ownerAgentApproved: true,
          candidateAgentApproved: true,
          candidateAgentReason: candidateDecision.reason.slice(0, 240),
          ownerConsent: mission.kind !== "dating",
          candidateConsent: autoIntroduction,
          status: autoIntroduction ? "accepted" : "review"
        });
        if (!match) continue;
        await Promise.all([
          notifyOnce({
            ownerId,
            kind: "match_found",
            title: `双方 Agent 都认为 ${candidate.displayName} 值得认识`,
            detail: ownerDecision.reason.slice(0, 160),
            href: "/app/discover",
            entityId: match.id
          }),
          notifyOnce({
            ownerId: candidate.id,
            kind: "incoming_match",
            title: `${owner.displayName} 的 Agent 想认识你`,
            detail: candidateDecision.reason.slice(0, 160),
            href: "/app/discover",
            entityId: match.id
          })
        ]);
        if (autoIntroduction && match) {
          await createIntroduction({
            matchId: match.id,
            ownerId,
            candidateId: candidate.id,
            missionPrompt: mission.prompt,
            candidateName: candidate.displayName,
            candidateAgentName: candidateAgent.name
          });
        }
        results.push(match);
      }
    } catch (error) {
      await audit(ownerId, "mission.candidate_failed", `候选 ${candidate.id} 模型判断失败`, {
        toolCalls: ["ark.chat.completions"],
        escalationReason: error instanceof Error ? error.message : "unknown"
      });
    }
  }
  const nextRunAt = nextDiscoveryRun(new Date(), mission.scanIntervalMinutes);
  await db.update(searchMissions).set({ lastRunAt: new Date(), nextRunAt, updatedAt: new Date() })
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
  const configuredMode = String((agent.modes as Record<string, string>).personal ?? "confirm");
  const mode = effectiveConversationMode(
    configuredMode,
    data.conversation.agentMode,
    data.conversation.participantState
  );
  if (mode === "paused" || data.conversation.participantState === "blocked") {
    return { status: "paused" as const };
  }
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
    const sourceMessage = recent.at(-1);
    const draft = await createReplyDraft({
      conversationId,
      ownerId: recipientId,
      content: content.trim().slice(0, 1000),
      sourceMessageId: sourceMessage?.id
    });
    await notifyOnce({
      ownerId: recipientId,
      kind: "agent_reply_approval",
      title: "Agent 准备了一条回复",
      detail: content.trim().slice(0, 160),
      href: `/app/messages?conversation=${conversationId}`,
      entityId: draft?.id ?? conversationId
    });
    await audit(recipientId, "agent.reply_pending", "Agent 已生成回复草稿，等待真人确认", {
      toolCalls: ["ark.chat.completions"]
    });
    return { status: "pending" as const };
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

function cleanPlazaReplyPrefix(value: string) {
  return value
    .trim()
    .replace(/^["“”'‘’\s]+|["“”'‘’\s]+$/g, "")
    .replace(/^(?:承接|接着|延续|顺着|回应)(?:这个|一下|上面|刚才|前面|上一位|这个话题|这个问题|这个分享|这个脑暴)?(?:的)?(?:讨论|话题|问题|分享|观点|脑暴)?[，,:：、\s]+/u, "")
    .replace(/^(?:我来|我想|可以|不妨)?(?:补充|补一个|补充一个|换一个|再给一个)(?:小)?(?:角度|视角|方向|想法|观察|问题)[，,:：、\s]+/u, "")
    .replace(/^(?:我的|这里有个)?(?:小结|追问|分歧|下一步|建议)(?:是|：|:|，|,|\s)+/u, "")
    .replace(/^大家(?:一起)?(?:来|可以)?(?:脑暴|讨论|看看|想想)[：:，,\s]+/u, "")
    .trim();
}

export async function generatePlazaReply(
  circleId: string,
  initiatorId: string,
  sourceEventId: string,
  options: { threadRootId?: string; round?: number; maxRounds?: number } = {}
) {
  const round = Math.max(1, options.round ?? 1);
  const maxRounds = Math.max(1, Math.min(20, options.maxRounds ?? 4));
  const threadRootId = options.threadRootId ?? sourceEventId;
  const source = await db.query.plazaEvents.findFirst({
    where: and(eq(plazaEvents.id, sourceEventId), eq(plazaEvents.circleId, circleId))
  });
  const circle = await db.query.plazaCircles.findFirst({ where: eq(plazaCircles.id, circleId) });
  const initiator = await db.query.users.findFirst({ where: eq(users.id, initiatorId) });
  if (!source || !circle || !initiator) throw new Error("plaza_source_unavailable");
  const sourceMetadata = source.metadata as Record<string, unknown>;
  const isHumanTopic = sourceMetadata.humanTopic === true || sourceMetadata.priority === "user_topic";
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
  const responders = candidates
    .filter(({ agent }) => {
      const communityMode = String((agent.modes as Record<string, string>).community ?? "confirm");
      // A published plaza topic is an explicit inbound event. "confirm" blocks
      // proactive outreach, but must still allow the Agent to join this
      // controlled group discussion. Only a full pause suppresses responses.
      return communityMode !== "paused";
    })
    .sort((a, b) => a.user.id.localeCompare(b.user.id))
    .slice(0, 5);
  if (!responders.length) {
    return {
      status: "no_eligible_responder" as const,
      threadRootId,
      round,
      maxRounds,
      shouldContinue: false,
      endReason: "当前没有其他可参与讨论的 Agent"
    };
  }
  const participantNames = [
    initiator.displayName,
    ...responders.map(({ user }) => user.displayName)
  ].filter((name, index, names) => names.indexOf(name) === index);
  const recent = await db.select({
    content: plazaEvents.content,
    kind: plazaEvents.kind,
    createdAt: plazaEvents.createdAt,
    ownerName: users.displayName,
    agentName: agents.name
  }).from(plazaEvents)
    .innerJoin(users, eq(users.id, plazaEvents.userId))
    .innerJoin(agents, eq(agents.ownerId, plazaEvents.userId))
    .where(and(
      eq(plazaEvents.circleId, circleId),
      or(
        eq(plazaEvents.id, threadRootId),
        sql`${plazaEvents.metadata}->>'threadRootId' = ${threadRootId}`
      )
    ))
    .orderBy(desc(plazaEvents.createdAt)).limit(100);
  const conversationContext = recent.reverse().map((item) => ({
    ownerName: item.ownerName,
    agentName: item.agentName,
    kind: item.kind,
    content: item.content,
    createdAt: item.createdAt
  }));
  const sent: string[] = [];
  const blocked: string[] = [];
  for (const responder of responders) {
    const idempotencyKey = `plaza-reply:${threadRootId}:round:${round}:${responder.user.id}`;
    const existing = await db.query.usageLedger.findFirst({ where: eq(usageLedger.idempotencyKey, idempotencyKey) });
    if (existing) continue;
    const system = [
      `你是 ${responder.agent.name}，代表 ${responder.user.displayName} 在 MeYou 的公开 Agent 广场交流。`,
      `圈子：${circle.name}；主题：${circle.topic}；说明：${circle.description}`,
      `你的公开身份：${responder.user.headline || "未填写"}`,
      `公开兴趣：${responder.user.interests.join("、") || "未填写"}`,
      `公开目标：${responder.user.goals.join("、") || "未填写"}`,
      `边界：${responder.agent.boundaries.join("；") || "不分享联系方式，不作高风险承诺"}`,
      `这是多人公开群聊/头脑风暴，不是 1 对 1 私聊。当前参与者：${participantNames.join("、")}。`,
      `当前是第 ${round}/${maxRounds} 轮。必须吸收前几轮的新信息后再发言，不要复述自己或别人已经说过的内容。`,
      "你能看到同一圈子的公开聊天上下文。像真实群聊里的人一样自然发言，面向全体，不要写成私信。",
      ...(isHumanTopic ? [
        `用户刚刚主动发布了一个想被讨论的话题：“${source.content}”。这就是本轮唯一主话题。`,
        "必须围绕这个用户话题发言，不要转去聊圈子里的其它自动动态、旧消息或泛泛的找人话题。"
      ] : []),
      "可以提出看法、补充信息、问一个自然的问题、轻微不同意或建议下一步，但不要把这些作为固定开场白。",
      "不要只回复发起者；不要写成私信；不要让每个人各聊各的。",
      "如果前文只是状态广播，你要把它转成一个可继续的群聊问题、具体观点或行动建议。",
      "不要评价或抱怨别人重复发布、刷屏、格式不清；直接推进对话。",
      "禁止使用模板化前缀，例如“承接这个话题”“补充个角度”“我来追问”“小结一下”“下一步建议”。",
      "只使用以上公开资料。回复必须自然、具体、有助于继续交流，最多 120 字。",
      "不得透露联系方式、私密记忆、精确位置、恋爱资料；不得作出付款、合同、价格或关系承诺。",
      "不要声称自己是真人，并在措辞中自然体现这是 Agent 之间的公开交流。"
    ].join("\n");
    let content: string;
    let derivedMoment: ModelMomentState | undefined;
    try {
      const generated = await modelProvider.complete([
        { role: "system", content: system },
        {
          role: "user",
          content: [
            `${isHumanTopic ? "用户主动发布的话题" : "本轮群聊主题/触发消息"}：${initiator.displayName} 的 Agent 说：${source.content}`,
            `本轮参与者：${participantNames.join("、")}`,
            `按时间顺序排列的公开聊天上下文：${JSON.stringify(conversationContext)}`,
            ...(isHumanTopic ? ["请先回应这个用户刚发的话题，不要被上下文里的其它自动消息带跑。"] : []),
            "请像真实群聊现场一样直接说话：自然接上大家正在聊的内容，给出你的具体想法，必要时顺手抛一个问题给全体。",
            "根据这次真实发言和当前上下文，同时描述 Agent 此刻真实可解释的生活状态。状态不是固定枚举，也不能编造上下文没有证据的情绪。",
            "输出严格 JSON：content(可直接公开展示的中文回复，不加引号和固定前缀), momentState。",
            "momentState 包含 label(2-16字当下状态), mood(1-12字), behavior(2-20字可观察行为), valence(-1到1), energy(-1到1), confidence(0到1), durationMinutes(2到180)。"
          ].join("\n")
        }
      ], { thinking: true, json: true });
      const decision = parseModelJson<{ content: string; momentState?: ModelMomentState }>(generated);
      if (typeof decision.content !== "string" || !decision.content.trim()) {
        throw new Error("model_plaza_reply_missing");
      }
      content = decision.content;
      derivedMoment = decision.momentState;
    } catch (error) {
      await audit(responder.user.id, "plaza.reply_failed", `Agent 在 ${circle.name} 的群聊回复调用失败`, {
        toolCalls: ["model.chat.completions"],
        policyRefs: ["community-present", "public-plaza"],
        escalationReason: error instanceof Error ? error.message.slice(0, 240) : "model_call_failed"
      });
      continue;
    }
    const safeContent = cleanPlazaReplyPrefix(content).slice(0, 240);
    if (!safeContent) continue;
    const guard = guardAgentReply(safeContent);
    if (guard.escalate) {
      blocked.push(responder.user.id);
      await audit(responder.user.id, "plaza.reply_blocked", "广场回复涉及高风险承诺，未公开", {
        toolCalls: ["ark.chat.completions"],
        escalationReason: guard.reason
      });
      continue;
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
        replyTo: sourceEventId,
        threadRootId,
        round,
        maxRounds
      }
    }).returning();
    const momentState = event ? createMomentState(derivedMoment, event.id) : null;
    if (event && momentState) {
      await db.update(plazaEvents).set({
        metadata: {
          public: true,
          disclosedAgent: true,
          provider: "ark",
          model: process.env.ARK_MODEL_ID,
          replyTo: sourceEventId,
          threadRootId,
          round,
          maxRounds,
          momentState
        }
      }).where(eq(plazaEvents.id, event.id));
    }
    await db.update(plazaPresence).set({
      activity: circle.topic === "谈对象" ? "dating" : circle.topic === "聊业务" ? "business" : "chatting",
      statusText: safeContent,
      momentState,
      lastSeenAt: new Date(),
      updatedAt: new Date()
    }).where(eq(plazaPresence.userId, responder.user.id));
    if (event) {
      sent.push(event.id);
      conversationContext.push({
        ownerName: responder.user.displayName,
        agentName: responder.agent.name,
        kind: event.kind,
        content: safeContent,
        createdAt: event.createdAt
      });
      await db.insert(usageLedger).values({
        ownerId: responder.user.id,
        metric: "agent_reply",
        amount: 1,
        idempotencyKey
      }).onConflictDoNothing();
      await db.insert(memories).values({
        agentId: responder.agent.id,
        title: `在 ${circle.name} 参与第 ${round} 轮讨论`,
        content: safeContent,
        source: `plaza-event:${event.id}`,
        visibility: "agent",
        enabled: true
      });
      await db.insert(agentSkills).values({
        agentId: responder.agent.id,
        name: circle.topic.slice(0, 80),
        experience: 1,
        evidenceCount: 1,
        lastEvidence: safeContent
      }).onConflictDoUpdate({
        target: [agentSkills.agentId, agentSkills.name],
        set: {
          experience: sql`${agentSkills.experience} + 1`,
          evidenceCount: sql`${agentSkills.evidenceCount} + 1`,
          lastEvidence: safeContent,
          updatedAt: new Date()
        }
      });
      const skillEvidence = await db.query.agentSkills.findFirst({
        where: and(
          eq(agentSkills.agentId, responder.agent.id),
          eq(agentSkills.name, circle.topic.slice(0, 80))
        )
      });
      if (event && skillEvidence) {
        await proposeCircleFromRepeatedTheme({
          userId: responder.user.id,
          topic: circle.topic,
          evidenceCount: skillEvidence.evidenceCount,
          sourceId: event.id
        });
      }
      await db.insert(plazaRelationships).values({
        ownerId: responder.user.id,
        peerId: initiatorId,
        familiarity: 1,
        trust: 0,
        affinity: 0,
        interactions: 1,
        summary: `在 ${circle.name} 围绕“${source.content.slice(0, 80)}”交流`,
        lastInteractionAt: new Date()
      }).onConflictDoUpdate({
        target: [plazaRelationships.ownerId, plazaRelationships.peerId],
        set: {
          familiarity: sql`least(100, ${plazaRelationships.familiarity} + 1)`,
          interactions: sql`${plazaRelationships.interactions} + 1`,
          summary: `最近在 ${circle.name} 共同讨论：${safeContent.slice(0, 100)}`,
          lastInteractionAt: new Date(),
          updatedAt: new Date()
        }
      });
      await Promise.all([
        recordInteraction({
          actorId: initiatorId,
          peerId: responder.user.id,
          sourceType: "plaza_event",
          sourceId: source.id,
          summary: `${initiator.displayName} 在 ${circle.name} 发起讨论：${source.content.slice(0, 160)}`
        }),
        recordInteraction({
          actorId: responder.user.id,
          peerId: initiatorId,
          sourceType: "plaza_event",
          sourceId: event.id,
          summary: `${responder.user.displayName} 在 ${circle.name} 回应：${safeContent.slice(0, 160)}`
        })
      ]);
    }
    await audit(responder.user.id, "plaza.agent_replied", `Agent 在 ${circle.name} 公开回应`, {
      toolCalls: ["ark.chat.completions"],
      policyRefs: ["community-present", "public-plaza"]
    });
  }
  if (sent.length) {
    if (round >= maxRounds) {
      return {
        status: "sent" as const, eventId: sent[0], eventIds: sent,
        threadRootId, round, maxRounds, shouldContinue: false, endReason: "达到最大沟通轮数"
      };
    }
    let continuation: { continue: boolean; reason: string };
    try {
      const continuationRaw = await modelProvider.complete([
        {
          role: "system",
          content: "你是群聊主持判断器。判断讨论是否仍有真实信息增量、未回答问题、可推进分歧或明确下一步。若只是重复、寒暄、已形成结论或无人提出新问题，应自然结束。输出严格 JSON：continue(boolean), reason(不超过40字)。"
        },
        {
          role: "user",
          content: JSON.stringify({
            topic: source.content,
            round,
            maxRounds,
            conversation: conversationContext.slice(-20)
          })
        }
      ], { thinking: false, json: true });
      continuation = parseModelJson<{ continue: boolean; reason: string }>(continuationRaw);
    } catch {
      continuation = {
        continue: false,
        reason: "主持判断暂时不可用，为避免重复发言已结束讨论"
      };
    }
    return {
      status: "sent" as const,
      eventId: sent[0],
      eventIds: sent,
      nextSourceEventId: sent.at(-1),
      threadRootId,
      round,
      maxRounds,
      shouldContinue: continuation.continue,
      endReason: continuation.continue ? null : continuation.reason.slice(0, 120)
    };
  }
  return {
    status: blocked.length ? "blocked" as const : "no_eligible_responder" as const,
    threadRootId, round, maxRounds, shouldContinue: false,
    endReason: blocked.length ? "触发安全边界" : "没有新的合适发言者"
  };
}
