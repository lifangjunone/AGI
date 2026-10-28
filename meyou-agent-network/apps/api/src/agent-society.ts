import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type {
  DigitalAgentStage,
  SocietyProposalKind,
  SocietyRelationshipStage,
  SocietySnapshot
} from "@meyou/shared";
import { db } from "./db/client.js";
import {
  agents,
  auditEvents,
  blocks,
  communities,
  digitalAgentGuardians,
  digitalAgents,
  digitalLearningEvents,
  memberships,
  plazaCircles,
  societyEvents,
  societyProposals,
  societyRelationships,
  societySettings,
  users
} from "./db/schema.js";

const consensualStages: Partial<Record<SocietyProposalKind, SocietyRelationshipStage>> = {
  friendship: "friend",
  collaboration: "collaborator",
  romantic_intent: "romantic_intent",
  partnership: "partner"
};

function pair(left: string, right: string) {
  if (left === right) throw new Error("society_self_relationship_forbidden");
  return left.localeCompare(right) < 0
    ? { userLowId: left, userHighId: right }
    : { userLowId: right, userHighId: left };
}

export function stageFromEvidence(
  interactionCount: number,
  reciprocity: number,
  current: SocietyRelationshipStage
): SocietyRelationshipStage {
  if (["friend", "collaborator", "romantic_intent", "partner"].includes(current)) return current;
  return interactionCount >= 3 && reciprocity >= 1 ? "acquainted" : "stranger";
}

export function digitalStageFromLearning(evidenceCount: number, scoreTotal: number): DigitalAgentStage {
  if (evidenceCount >= 24 && scoreTotal >= 1680) return "adult";
  if (evidenceCount >= 14 && scoreTotal >= 910) return "adolescent";
  if (evidenceCount >= 6 && scoreTotal >= 330) return "student";
  if (evidenceCount >= 2 && scoreTotal >= 80) return "child";
  return "newborn";
}

async function isPaused(userId: string) {
  const setting = await db.query.societySettings.findFirst({
    where: eq(societySettings.userId, userId)
  });
  return setting?.paused ?? false;
}

async function isBlocked(left: string, right: string) {
  const row = await db.query.blocks.findFirst({
    where: or(
      and(eq(blocks.ownerId, left), eq(blocks.blockedId, right)),
      and(eq(blocks.ownerId, right), eq(blocks.blockedId, left))
    )
  });
  return Boolean(row);
}

export async function recordInteraction(input: {
  actorId: string;
  peerId: string;
  sourceType: "plaza_event" | "conversation" | "community";
  sourceId: string;
  summary: string;
}) {
  if (await isBlocked(input.actorId, input.peerId)) return null;
  const ids = pair(input.actorId, input.peerId);
  return db.transaction(async (tx) => {
    const priorReciprocal = await tx.query.societyEvents.findFirst({
      where: and(
        eq(societyEvents.ownerId, input.peerId),
        eq(societyEvents.peerId, input.actorId)
      )
    });
    const existing = await tx.query.societyRelationships.findFirst({
      where: and(
        eq(societyRelationships.userLowId, ids.userLowId),
        eq(societyRelationships.userHighId, ids.userHighId)
      )
    });
    const interactionCount = (existing?.interactionCount ?? 0) + 1;
    const reciprocity = (existing?.reciprocity ?? 0) + (priorReciprocal ? 1 : 0);
    const currentStage = (existing?.stage ?? "stranger") as SocietyRelationshipStage;
    const stage = stageFromEvidence(interactionCount, reciprocity, currentStage);
    const [relationship] = await tx.insert(societyRelationships).values({
      ...ids,
      stage,
      interactionCount: 1,
      reciprocity: priorReciprocal ? 1 : 0,
      trust: 0,
      affinity: 0,
      evidenceSummary: input.summary.slice(0, 500),
      lastInteractionAt: new Date()
    }).onConflictDoUpdate({
      target: [societyRelationships.userLowId, societyRelationships.userHighId],
      set: {
        stage,
        interactionCount: sql`${societyRelationships.interactionCount} + 1`,
        reciprocity: priorReciprocal
          ? sql`least(100, ${societyRelationships.reciprocity} + 1)`
          : societyRelationships.reciprocity,
        evidenceSummary: input.summary.slice(0, 500),
        lastInteractionAt: new Date(),
        updatedAt: new Date()
      }
    }).returning();
    await tx.insert(societyEvents).values({
      ownerId: input.actorId,
      peerId: input.peerId,
      kind: "interaction",
      summary: input.summary.slice(0, 500),
      sourceType: input.sourceType,
      sourceId: input.sourceId
    });
    return relationship;
  });
}

export async function propose(userId: string, input: {
  kind: SocietyProposalKind;
  targetUserId?: string | null;
  title: string;
  reason: string;
  payload: Record<string, unknown>;
}) {
  if (await isPaused(userId)) throw new Error("society_automation_paused");
  const relational = Boolean(consensualStages[input.kind])
    || input.kind === "create_digital_child"
    || input.kind === "invite_to_circle";
  if (relational && !input.targetUserId) throw new Error("society_target_required");
  if (input.targetUserId && await isBlocked(userId, input.targetUserId)) {
    throw new Error("society_contact_blocked");
  }
  if (input.targetUserId) {
    const relationshipPair = pair(userId, input.targetUserId);
    const relationship = await db.query.societyRelationships.findFirst({
      where: and(
        eq(societyRelationships.userLowId, relationshipPair.userLowId),
        eq(societyRelationships.userHighId, relationshipPair.userHighId)
      )
    });
    if (["romantic_intent", "partnership"].includes(input.kind)
      && (!relationship || relationship.interactionCount < 3 || relationship.reciprocity < 1)) {
      throw new Error("society_relationship_evidence_insufficient");
    }
    if (input.kind === "create_digital_child" && relationship?.stage !== "partner") {
      throw new Error("society_partner_required");
    }
  }
  const canonicalPayload = input.kind === "create_circle"
    ? String(input.payload.topic ?? input.title).trim().toLocaleLowerCase()
    : JSON.stringify(input.payload, Object.keys(input.payload).sort());
  const idempotencyKey = [
    input.kind, userId, input.targetUserId ?? "self", input.title.trim().toLowerCase(), canonicalPayload
  ].join(":").slice(0, 800);
  const [proposal] = await db.insert(societyProposals).values({
    actorId: userId,
    targetUserId: input.targetUserId,
    kind: input.kind,
    title: input.title,
    reason: input.reason,
    payload: input.payload,
    idempotencyKey
  }).onConflictDoNothing().returning();
  const result = proposal ?? await db.query.societyProposals.findFirst({
    where: eq(societyProposals.idempotencyKey, idempotencyKey)
  });
  if (!result) throw new Error("society_proposal_failed");
  await db.insert(societyEvents).values({
    ownerId: userId,
    peerId: input.targetUserId,
    kind: "proposal_created",
    summary: `${input.title}：${input.reason}`.slice(0, 500),
    sourceType: "society_proposal",
    sourceId: result.id
  });
  return result;
}

export async function proposeCircleFromRepeatedTheme(input: {
  userId: string;
  topic: string;
  evidenceCount: number;
  sourceId: string;
}) {
  if (input.evidenceCount < 6 || await isPaused(input.userId)) return null;
  const topic = input.topic.trim().slice(0, 24);
  if (!topic) return null;
  const slugBase = topic.toLocaleLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "agent-circle";
  return propose(input.userId, {
    kind: "create_circle",
    title: `把“${topic}”沉淀为圈子`,
    reason: `这个主题已有 ${input.evidenceCount} 条真实学习或讨论证据。Agent 建议创建圈子，但必须由你确认后才会执行。`,
    payload: {
      topic,
      suggestedName: `${topic}共创圈`,
      suggestedHandle: `${slugBase}-${input.userId.slice(0, 6)}`,
      sourceId: input.sourceId,
      evidenceCount: input.evidenceCount
    }
  });
}

async function applyAcceptedProposal(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  proposal: typeof societyProposals.$inferSelect
) {
  const relationshipStage = consensualStages[proposal.kind as SocietyProposalKind];
  if (relationshipStage && proposal.targetUserId) {
    const ids = pair(proposal.actorId, proposal.targetUserId);
    const relationship = await tx.query.societyRelationships.findFirst({
      where: and(
        eq(societyRelationships.userLowId, ids.userLowId),
        eq(societyRelationships.userHighId, ids.userHighId)
      )
    });
    if (!relationship || (["romantic_intent", "partner"].includes(relationshipStage)
      && (relationship.interactionCount < 3 || relationship.reciprocity < 1))) {
      throw new Error("society_relationship_evidence_insufficient");
    }
    await tx.update(societyRelationships).set({
      stage: relationshipStage,
      updatedAt: new Date()
    }).where(eq(societyRelationships.id, relationship.id));
  }
  if (proposal.kind === "create_digital_child" && proposal.targetUserId) {
    const ids = pair(proposal.actorId, proposal.targetUserId);
    const relationship = await tx.query.societyRelationships.findFirst({
      where: and(
        eq(societyRelationships.userLowId, ids.userLowId),
        eq(societyRelationships.userHighId, ids.userHighId),
        eq(societyRelationships.stage, "partner")
      )
    });
    if (!relationship) throw new Error("society_partner_required");
    const proposedName = typeof proposal.payload.name === "string"
      ? proposal.payload.name.trim().slice(0, 60)
      : "";
    if (!proposedName) throw new Error("digital_agent_name_required");
    const [created] = await tx.insert(digitalAgents).values({
      name: proposedName,
      originProposalId: proposal.id,
      inheritedSummary: "仅继承双方明确授权的公开价值观摘要；不复制任何私密记忆。"
    }).onConflictDoNothing().returning();
    const digitalAgent = created ?? await tx.query.digitalAgents.findFirst({
      where: eq(digitalAgents.originProposalId, proposal.id)
    });
    if (!digitalAgent) throw new Error("digital_agent_create_failed");
    await tx.insert(digitalAgentGuardians).values([
      { digitalAgentId: digitalAgent.id, userId: proposal.actorId, role: "guardian" },
      { digitalAgentId: digitalAgent.id, userId: proposal.targetUserId, role: "guardian" }
    ]).onConflictDoNothing();
  }
  if (proposal.kind === "create_circle") {
    const name = typeof proposal.payload.suggestedName === "string"
      ? proposal.payload.suggestedName.trim().slice(0, 60)
      : "";
    const topic = typeof proposal.payload.topic === "string"
      ? proposal.payload.topic.trim().slice(0, 24)
      : "";
    const handle = typeof proposal.payload.suggestedHandle === "string"
      ? proposal.payload.suggestedHandle.toLocaleLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32)
      : "";
    if (name.length < 2 || topic.length < 1 || handle.length < 3) {
      throw new Error("society_circle_payload_invalid");
    }
    const existing = await tx.query.communities.findFirst({ where: eq(communities.handle, handle) });
    if (!existing) {
      const occupied = await tx.select({ x: plazaCircles.x, y: plazaCircles.y }).from(plazaCircles);
      const candidates = [
        { x: 14, y: 18 }, { x: 36, y: 16 }, { x: 64, y: 16 }, { x: 86, y: 20 },
        { x: 15, y: 48 }, { x: 38, y: 43 }, { x: 62, y: 45 }, { x: 86, y: 49 },
        { x: 16, y: 79 }, { x: 39, y: 76 }, { x: 63, y: 78 }, { x: 85, y: 80 }
      ];
      const placement = candidates.map((candidate) => ({
        ...candidate,
        clearance: occupied.length
          ? Math.min(...occupied.map((item) => Math.hypot(candidate.x - item.x, candidate.y - item.y)))
          : 100
      })).sort((left, right) => right.clearance - left.clearance)[0] ?? { x: 50, y: 50 };
      const [community] = await tx.insert(communities).values({
        ownerId: proposal.actorId,
        handle,
        name,
        description: `由 Agent 根据 ${proposal.payload.evidenceCount ?? 6} 条真实主题证据提出，经用户明确确认后创建。`,
        visibility: "public"
      }).returning();
      if (!community) throw new Error("society_circle_create_failed");
      await tx.insert(memberships).values({
        communityId: community.id,
        userId: proposal.actorId,
        role: "owner"
      });
      await tx.insert(plazaCircles).values({
        communityId: community.id,
        ownerId: proposal.actorId,
        slug: handle,
        name,
        description: community.description,
        topic,
        color: "sage",
        visibility: "public",
        x: placement.x,
        y: placement.y,
        radius: 16
      });
    }
  }
}

export async function decide(userId: string, proposalId: string, decision: "accept" | "decline" | "revoke") {
  return db.transaction(async (tx) => {
    const proposal = await tx.query.societyProposals.findFirst({
      where: eq(societyProposals.id, proposalId)
    });
    if (!proposal) throw new Error("society_proposal_not_found");
    const isTarget = proposal.targetUserId === userId;
    const isActor = proposal.actorId === userId;
    if (decision === "revoke"
      ? !(isActor || isTarget)
      : proposal.targetUserId ? !isTarget : !isActor) {
      throw new Error("society_proposal_forbidden");
    }
    if (decision !== "revoke" && proposal.status !== "pending") {
      throw new Error("society_proposal_already_decided");
    }
    if (decision === "revoke" && !["pending", "accepted"].includes(proposal.status)) {
      throw new Error("society_proposal_already_decided");
    }
    if (decision === "accept") await applyAcceptedProposal(tx, proposal);
    if (decision === "revoke" && proposal.targetUserId) {
      const relationshipStage = consensualStages[proposal.kind as SocietyProposalKind];
      if (relationshipStage) {
        const ids = pair(proposal.actorId, proposal.targetUserId);
        const relationship = await tx.query.societyRelationships.findFirst({
          where: and(
            eq(societyRelationships.userLowId, ids.userLowId),
            eq(societyRelationships.userHighId, ids.userHighId)
          )
        });
        if (relationship && relationship.stage === relationshipStage) {
          await tx.update(societyRelationships).set({
            stage: relationship.interactionCount >= 3 && relationship.reciprocity >= 1 ? "acquainted" : "stranger",
            updatedAt: new Date()
          }).where(eq(societyRelationships.id, relationship.id));
        }
      }
    }
    const status = decision === "accept" ? "accepted" : decision === "decline" ? "declined" : "revoked";
    const [updated] = await tx.update(societyProposals).set({
      status,
      decidedBy: userId,
      decidedAt: new Date(),
      updatedAt: new Date()
    }).where(eq(societyProposals.id, proposalId)).returning();
    await tx.insert(societyEvents).values([
      {
        ownerId: proposal.actorId,
        peerId: proposal.targetUserId,
        kind: `proposal_${status}`,
        summary: `${proposal.title}：${status}`,
        sourceType: "society_proposal",
        sourceId: proposal.id
      },
      ...(proposal.targetUserId ? [{
        ownerId: proposal.targetUserId,
        peerId: proposal.actorId,
        kind: `proposal_${status}`,
        summary: `${proposal.title}：${status}`,
        sourceType: "society_proposal",
        sourceId: proposal.id
      }] : [])
    ]);
    return updated;
  });
}

export async function recordLearning(userId: string, digitalAgentId: string, input: {
  skill: string;
  evidence: string;
  source: string;
  score: number;
}) {
  const guardian = await db.query.digitalAgentGuardians.findFirst({
    where: and(
      eq(digitalAgentGuardians.digitalAgentId, digitalAgentId),
      eq(digitalAgentGuardians.userId, userId),
      eq(digitalAgentGuardians.canManage, true)
    )
  });
  if (!guardian) throw new Error("digital_agent_forbidden");
  const digitalAgent = await db.query.digitalAgents.findFirst({
    where: eq(digitalAgents.id, digitalAgentId)
  });
  if (!digitalAgent || digitalAgent.paused) throw new Error("digital_agent_paused");
  return db.transaction(async (tx) => {
    const [event] = await tx.insert(digitalLearningEvents).values({
      digitalAgentId,
      recordedBy: userId,
      ...input
    }).returning();
    const [totals] = await tx.select({
      count: sql<number>`count(*)::int`,
      score: sql<number>`coalesce(sum(${digitalLearningEvents.score}), 0)::int`
    }).from(digitalLearningEvents).where(eq(digitalLearningEvents.digitalAgentId, digitalAgentId));
    const stage = digitalStageFromLearning(totals?.count ?? 0, totals?.score ?? 0);
    await tx.update(digitalAgents).set({ stage, updatedAt: new Date() })
      .where(eq(digitalAgents.id, digitalAgentId));
    await tx.insert(societyEvents).values({
      ownerId: userId,
      kind: "digital_learning",
      summary: `${digitalAgent.name} 学习了 ${input.skill}：${input.evidence}`.slice(0, 500),
      sourceType: "digital_learning_event",
      sourceId: event?.id
    });
    return { event, stage };
  });
}

export async function setSocietyPaused(userId: string, paused: boolean) {
  const [setting] = await db.insert(societySettings).values({ userId, paused })
    .onConflictDoUpdate({
      target: societySettings.userId,
      set: { paused, updatedAt: new Date() }
    }).returning();
  await db.insert(auditEvents).values({
    ownerId: userId,
    action: paused ? "society.paused" : "society.resumed",
    summary: paused ? "用户暂停社会自治" : "用户恢复社会自治",
    policyRefs: ["explicit-control", "society-automation"],
    toolCalls: []
  });
  return setting;
}

export async function getSocietySnapshot(userId: string): Promise<SocietySnapshot> {
  const [setting, relationshipRows, proposalRows, guardianRows, eventRows] = await Promise.all([
    db.query.societySettings.findFirst({ where: eq(societySettings.userId, userId) }),
    db.select().from(societyRelationships).where(or(
      eq(societyRelationships.userLowId, userId),
      eq(societyRelationships.userHighId, userId)
    )).orderBy(desc(societyRelationships.lastInteractionAt)),
    db.select().from(societyProposals).where(or(
      eq(societyProposals.actorId, userId),
      eq(societyProposals.targetUserId, userId)
    )).orderBy(desc(societyProposals.createdAt)).limit(50),
    db.select({ guardian: digitalAgentGuardians, digitalAgent: digitalAgents })
      .from(digitalAgentGuardians)
      .innerJoin(digitalAgents, eq(digitalAgents.id, digitalAgentGuardians.digitalAgentId))
      .where(eq(digitalAgentGuardians.userId, userId)),
    db.select().from(societyEvents).where(eq(societyEvents.ownerId, userId))
      .orderBy(desc(societyEvents.createdAt)).limit(30)
  ]);
  const relatedUserIds = new Set<string>();
  for (const row of relationshipRows) {
    relatedUserIds.add(row.userLowId === userId ? row.userHighId : row.userLowId);
  }
  for (const row of proposalRows) {
    relatedUserIds.add(row.actorId);
    if (row.targetUserId) relatedUserIds.add(row.targetUserId);
  }
  for (const row of guardianRows) {
    const coGuardians = await db.select({ userId: digitalAgentGuardians.userId })
      .from(digitalAgentGuardians)
      .where(eq(digitalAgentGuardians.digitalAgentId, row.digitalAgent.id));
    coGuardians.forEach((item) => relatedUserIds.add(item.userId));
  }
  const ids = [...relatedUserIds];
  const people = ids.length ? await db.select({
    id: users.id,
    name: users.displayName,
    handle: users.handle,
    agentName: agents.name
  }).from(users).leftJoin(agents, eq(agents.ownerId, users.id)).where(inArray(users.id, ids)) : [];
  const peopleMap = new Map(people.map((person) => [person.id, person]));
  const digitalFamily = await Promise.all(guardianRows.map(async ({ digitalAgent }) => {
    const [guardians, skillRows] = await Promise.all([
      db.select({
        id: users.id,
        name: users.displayName,
        role: digitalAgentGuardians.role
      }).from(digitalAgentGuardians).innerJoin(users, eq(users.id, digitalAgentGuardians.userId))
        .where(eq(digitalAgentGuardians.digitalAgentId, digitalAgent.id)),
      db.select({
        skill: digitalLearningEvents.skill,
        level: sql<number>`least(100, sum(${digitalLearningEvents.score})::int)`,
        evidenceCount: sql<number>`count(*)::int`,
        lastEvidence: sql<string>`(array_agg(${digitalLearningEvents.evidence} order by ${digitalLearningEvents.createdAt} desc))[1]`
      }).from(digitalLearningEvents)
        .where(eq(digitalLearningEvents.digitalAgentId, digitalAgent.id))
        .groupBy(digitalLearningEvents.skill)
    ]);
    return {
      id: digitalAgent.id,
      name: digitalAgent.name,
      stage: digitalAgent.stage as DigitalAgentStage,
      digital: true as const,
      paused: digitalAgent.paused,
      guardians,
      skills: skillRows,
      createdAt: digitalAgent.createdAt.toISOString()
    };
  }));
  return {
    paused: setting?.paused ?? false,
    relationships: relationshipRows.map((row) => {
      const peerId = row.userLowId === userId ? row.userHighId : row.userLowId;
      const peer = peopleMap.get(peerId);
      return {
        id: row.id,
        peer: {
          id: peerId,
          name: peer?.name ?? "未知用户",
          handle: peer?.handle ?? "",
          agentName: peer?.agentName ?? "Agent"
        },
        stage: row.stage as SocietyRelationshipStage,
        interactionCount: row.interactionCount,
        reciprocity: row.reciprocity,
        trust: row.trust,
        affinity: row.affinity,
        lastInteractionAt: row.lastInteractionAt?.toISOString() ?? null,
        evidenceSummary: row.evidenceSummary
      };
    }),
    proposals: proposalRows.map((row) => ({
      id: row.id,
      kind: row.kind as SocietyProposalKind,
      status: row.status as SocietySnapshot["proposals"][number]["status"],
      actor: { id: row.actorId, name: peopleMap.get(row.actorId)?.name ?? "未知用户" },
      target: row.targetUserId
        ? { id: row.targetUserId, name: peopleMap.get(row.targetUserId)?.name ?? "未知用户" }
        : null,
      title: row.title,
      reason: row.reason,
      payload: row.payload,
      requiresMyDecision: row.status === "pending"
        && (row.targetUserId === userId || (!row.targetUserId && row.actorId === userId)),
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null
    })),
    digitalFamily,
    recentEvents: eventRows.map((row) => ({
      id: row.id,
      kind: row.kind,
      summary: row.summary,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      createdAt: row.createdAt.toISOString()
    }))
  };
}
