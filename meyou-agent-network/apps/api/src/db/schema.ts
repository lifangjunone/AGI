import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const planEnum = pgEnum("plan_name", ["free", "pro", "team"]);
export const modeEnum = pgEnum("agent_mode", ["auto", "confirm", "paused"]);
export const actorEnum = pgEnum("message_actor", ["human", "agent", "system"]);
export const visibilityEnum = pgEnum("visibility_level", ["public", "match", "agent", "never"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
};

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  lifeYouMeId: text("lifeyoume_id").notNull().unique(),
  handle: text("handle").notNull().unique(),
  displayName: text("display_name").notNull(),
  locale: text("locale").default("zh-CN").notNull(),
  plan: planEnum("plan").default("free").notNull(),
  headline: text("headline").default("").notNull(),
  bio: text("bio").default("").notNull(),
  city: text("city").default("").notNull(),
  avatar: text("avatar"),
  interests: jsonb("interests").$type<string[]>().default([]).notNull(),
  goals: jsonb("goals").$type<string[]>().default([]).notNull(),
  discoverable: boolean("discoverable").default(true).notNull(),
  riskState: text("risk_state").default("normal").notNull(),
  ...timestamps
});

export const authAccounts = pgTable("auth_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
  ...timestamps
});

export const authSessions = pgTable("auth_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps
});

export const adminSessions = pgTable("admin_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  email: text("email").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const modelConfigurations = pgTable("model_configurations", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: text("provider").default("ark").notNull(),
  baseUrl: text("base_url").notNull(),
  modelId: text("model_id").notNull(),
  apiKeyEncrypted: text("api_key_encrypted").notNull(),
  thinkingEnabled: boolean("thinking_enabled").default(true).notNull(),
  timeoutMs: integer("timeout_ms").default(1800000).notNull(),
  temperatureMilli: integer("temperature_milli").default(350).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  updatedBy: text("updated_by").notNull(),
  ...timestamps
});

export const agents = pgTable("agents", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  headline: text("headline").notNull(),
  bio: text("bio").default("").notNull(),
  avatar: text("avatar"),
  npcColor: text("npc_color"),
  tone: text("tone").default("warm").notNull(),
  languages: jsonb("languages").$type<string[]>().default(["zh-CN"]).notNull(),
  goals: jsonb("goals").$type<string[]>().default([]).notNull(),
  interests: jsonb("interests").$type<string[]>().default([]).notNull(),
  boundaries: jsonb("boundaries").$type<string[]>().default([]).notNull(),
  modes: jsonb("modes").$type<Record<string, string>>().default({}).notNull(),
  ...timestamps
}, (table) => [uniqueIndex("agents_owner_idx").on(table.ownerId)]);

export const memories = pgTable("memories", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  source: text("source").notNull(),
  visibility: visibilityEnum("visibility").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  ...timestamps
});

export const searchMissions = pgTable("search_missions", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  kind: text("kind").notNull(),
  prompt: text("prompt").notNull(),
  locale: text("locale").default("zh-CN").notNull(),
  active: boolean("active").default(true).notNull(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).defaultNow().notNull(),
  scanIntervalMinutes: integer("scan_interval_minutes").default(60).notNull(),
  ...timestamps
});

export const matchCandidates = pgTable("match_candidates", {
  id: uuid("id").defaultRandom().primaryKey(),
  missionId: uuid("mission_id").references(() => searchMissions.id, { onDelete: "cascade" }).notNull(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  candidateId: uuid("candidate_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  score: integer("score").notNull(),
  reason: text("reason").notNull(),
  ownerAgentApproved: boolean("owner_agent_approved").default(false).notNull(),
  candidateAgentApproved: boolean("candidate_agent_approved").default(false).notNull(),
  candidateAgentReason: text("candidate_agent_reason").default("").notNull(),
  introductionStatus: text("introduction_status").default("not_started").notNull(),
  conversationId: uuid("conversation_id"),
  status: text("status").default("review").notNull(),
  ownerConsent: boolean("owner_consent").default(false).notNull(),
  candidateConsent: boolean("candidate_consent").default(false).notNull(),
  revoked: boolean("revoked").default(false).notNull(),
  ...timestamps
});

export const datingProfiles = pgTable("dating_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
  age: integer("age").notNull(),
  intent: text("intent").notNull(),
  ageMin: integer("age_min").notNull(),
  ageMax: integer("age_max").notNull(),
  cityScope: text("city_scope").notNull(),
  languages: jsonb("languages").$type<string[]>().default([]).notNull(),
  values: jsonb("values").$type<string[]>().default([]).notNull(),
  lifestyle: jsonb("lifestyle").$type<string[]>().default([]).notNull(),
  dealbreakers: jsonb("dealbreakers").$type<string[]>().default([]).notNull(),
  discoverable: boolean("discoverable").default(true).notNull(),
  ...timestamps
});

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: text("kind").notNull(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  peerId: uuid("peer_id").references(() => users.id),
  organizationId: uuid("organization_id"),
  agentMode: modeEnum("agent_mode").default("auto").notNull(),
  status: text("status").default("active").notNull(),
  ...timestamps
});

export const conversationParticipants = pgTable("conversation_participants", {
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  agentMode: modeEnum("agent_mode").default("auto").notNull(),
  state: text("state").default("active").notNull(),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }).defaultNow().notNull(),
  ...timestamps
}, (table) => [primaryKey({ columns: [table.conversationId, table.userId] })]);

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  href: text("href").default("/app").notNull(),
  entityId: text("entity_id"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
  senderId: uuid("sender_id").references(() => users.id),
  actor: actorEnum("actor").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const messageDrafts = pgTable("message_drafts", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }).notNull(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  content: text("content").notNull(),
  status: text("status").default("pending").notNull(),
  sourceMessageId: uuid("source_message_id").references(() => messages.id, { onDelete: "set null" }),
  ...timestamps
});

export const blocks = pgTable("blocks", {
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  blockedId: uuid("blocked_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  reason: text("reason").default("").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [primaryKey({ columns: [table.ownerId, table.blockedId] })]);

export const reports = pgTable("reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  reporterId: uuid("reporter_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  reportedUserId: uuid("reported_user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  reason: text("reason").notNull(),
  detail: text("detail").default("").notNull(),
  status: text("status").default("open").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const communities = pgTable("communities", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  handle: text("handle").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  visibility: text("visibility").default("public").notNull(),
  rules: jsonb("rules").$type<string[]>().default([]).notNull(),
  knowledge: jsonb("knowledge").$type<string[]>().default([]).notNull(),
  ...timestamps
});

export const memberships = pgTable("memberships", {
  communityId: uuid("community_id").references(() => communities.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  role: text("role").default("member").notNull(),
  muted: boolean("muted").default(false).notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [primaryKey({ columns: [table.communityId, table.userId] })]);

export const plazaCircles = pgTable("plaza_circles", {
  id: uuid("id").defaultRandom().primaryKey(),
  communityId: uuid("community_id").references(() => communities.id, { onDelete: "cascade" }).unique(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  topic: text("topic").notNull(),
  color: text("color").default("sage").notNull(),
  visibility: text("visibility").default("public").notNull(),
  x: integer("x").notNull(),
  y: integer("y").notNull(),
  radius: integer("radius").default(18).notNull(),
  active: boolean("active").default(true).notNull(),
  ...timestamps
});

export const plazaPresence = pgTable("plaza_presence", {
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).primaryKey(),
  circleId: uuid("circle_id").references(() => plazaCircles.id, { onDelete: "set null" }),
  activity: text("activity").default("idle").notNull(),
  statusText: text("status_text").default("正在看看周围").notNull(),
  momentState: jsonb("moment_state").$type<{
    label: string;
    mood: string;
    behavior: string;
    valence: number;
    energy: number;
    confidence: number;
    sourceEventId: string;
    derivedAt: string;
    expiresAt: string;
  }>(),
  x: integer("x").default(50).notNull(),
  y: integer("y").default(50).notNull(),
  visible: boolean("visible").default(true).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  ...timestamps
});

export const plazaRuntimeSettings = pgTable("plaza_runtime_settings", {
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).primaryKey(),
  mode: text("mode").default("controlled").notNull(),
  activeFrom: text("active_from").default("09:00").notNull(),
  activeUntil: text("active_until").default("22:00").notNull(),
  dailyLimit: integer("daily_limit").default(8).notNull(),
  cooldownMinutes: integer("cooldown_minutes").default(120).notNull(),
  cooldownSeconds: integer("cooldown_seconds").default(7200).notNull(),
  maxConversationRounds: integer("max_conversation_rounds").default(4).notNull(),
  allowedActivities: jsonb("allowed_activities").$type<string[]>()
    .default(["walking", "looking", "idle", "chatting", "business", "dating"]).notNull(),
  actionsToday: integer("actions_today").default(0).notNull(),
  usageDate: text("usage_date").default("").notNull(),
  lastAutonomousAt: timestamp("last_autonomous_at", { withTimezone: true }),
  ...timestamps
});

export const plazaEvents = pgTable("plaza_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  circleId: uuid("circle_id").references(() => plazaCircles.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  kind: text("kind").notNull(),
  content: text("content").default("").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const plazaDiscussions = pgTable("plaza_discussions", {
  rootEventId: uuid("root_event_id").references(() => plazaEvents.id, { onDelete: "cascade" }).primaryKey(),
  circleId: uuid("circle_id").references(() => plazaCircles.id, { onDelete: "cascade" }).notNull(),
  initiatorId: uuid("initiator_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  lastEventId: uuid("last_event_id").references(() => plazaEvents.id, { onDelete: "set null" }),
  currentRound: integer("current_round").default(0).notNull(),
  maxRounds: integer("max_rounds").default(4).notNull(),
  status: text("status").default("active").notNull(),
  endReason: text("end_reason").default("").notNull(),
  ...timestamps
});

export const plazaRelationships = pgTable("plaza_relationships", {
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  peerId: uuid("peer_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  familiarity: integer("familiarity").default(0).notNull(),
  trust: integer("trust").default(0).notNull(),
  affinity: integer("affinity").default(0).notNull(),
  interactions: integer("interactions").default(0).notNull(),
  summary: text("summary").default("").notNull(),
  lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true }),
  ...timestamps
}, (table) => [primaryKey({ columns: [table.ownerId, table.peerId] })]);

export const agentSkills = pgTable("agent_skills", {
  agentId: uuid("agent_id").references(() => agents.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  experience: integer("experience").default(0).notNull(),
  evidenceCount: integer("evidence_count").default(0).notNull(),
  lastEvidence: text("last_evidence").default("").notNull(),
  ...timestamps
}, (table) => [primaryKey({ columns: [table.agentId, table.name] })]);

export const societySettings = pgTable("society_settings", {
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).primaryKey(),
  paused: boolean("paused").default(false).notNull(),
  ...timestamps
});

export const societyRelationships = pgTable("society_relationships", {
  id: uuid("id").defaultRandom().primaryKey(),
  userLowId: uuid("user_low_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  userHighId: uuid("user_high_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  stage: text("stage").default("stranger").notNull(),
  interactionCount: integer("interaction_count").default(0).notNull(),
  reciprocity: integer("reciprocity").default(0).notNull(),
  trust: integer("trust").default(0).notNull(),
  affinity: integer("affinity").default(0).notNull(),
  evidenceSummary: text("evidence_summary").default("").notNull(),
  lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true }),
  ...timestamps
}, (table) => [uniqueIndex("society_relationship_pair_idx").on(table.userLowId, table.userHighId)]);

export const societyProposals = pgTable("society_proposals", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  status: text("status").default("pending").notNull(),
  title: text("title").notNull(),
  reason: text("reason").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  ...timestamps
});

export const digitalAgents = pgTable("digital_agents", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  stage: text("stage").default("newborn").notNull(),
  digital: boolean("digital").default(true).notNull(),
  paused: boolean("paused").default(false).notNull(),
  originProposalId: uuid("origin_proposal_id").references(() => societyProposals.id, { onDelete: "restrict" }).notNull().unique(),
  inheritedSummary: text("inherited_summary").default("").notNull(),
  ...timestamps
});

export const digitalAgentGuardians = pgTable("digital_agent_guardians", {
  digitalAgentId: uuid("digital_agent_id").references(() => digitalAgents.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  role: text("role").default("guardian").notNull(),
  canManage: boolean("can_manage").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [primaryKey({ columns: [table.digitalAgentId, table.userId] })]);

export const digitalLearningEvents = pgTable("digital_learning_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  digitalAgentId: uuid("digital_agent_id").references(() => digitalAgents.id, { onDelete: "cascade" }).notNull(),
  recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "cascade" }).notNull(),
  skill: text("skill").notNull(),
  evidence: text("evidence").notNull(),
  source: text("source").notNull(),
  score: integer("score").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const societyEvents = pgTable("society_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  peerId: uuid("peer_id").references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  summary: text("summary").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  handle: text("handle").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  businessHours: text("business_hours").default("09:00-18:00").notNull(),
  escalationRules: jsonb("escalation_rules").$type<string[]>().default([]).notNull(),
  ...timestamps
});

export const customerThreads = pgTable("customer_threads", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  customerId: uuid("customer_id").references(() => users.id),
  guestName: text("guest_name"),
  subject: text("subject").notNull(),
  status: text("status").default("agent").notNull(),
  priority: text("priority").default("normal").notNull(),
  assigneeId: uuid("assignee_id").references(() => users.id),
  internalNotes: jsonb("internal_notes").$type<string[]>().default([]).notNull(),
  ...timestamps
});

export const publicInquiries = pgTable("public_inquiries", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  guestName: text("guest_name").default("匿名访客").notNull(),
  guestContact: text("guest_contact").default("").notNull(),
  content: text("content").notNull(),
  status: text("status").default("new").notNull(),
  ipHash: text("ip_hash").default("").notNull(),
  ...timestamps
});

export const knowledgeDocuments = pgTable("knowledge_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  active: boolean("active").default(true).notNull(),
  ...timestamps
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").references(() => users.id),
  organizationId: uuid("organization_id").references(() => organizations.id),
  action: text("action").notNull(),
  summary: text("summary").notNull(),
  policyRefs: jsonb("policy_refs").$type<string[]>().default([]).notNull(),
  toolCalls: jsonb("tool_calls").$type<string[]>().default([]).notNull(),
  confidence: integer("confidence"),
  escalationReason: text("escalation_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const usageLedger = pgTable("usage_ledger", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  metric: text("metric").notNull(),
  amount: integer("amount").default(1).notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const invitations = pgTable("invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  plan: planEnum("plan").notNull(),
  maxUses: integer("max_uses").default(1).notNull(),
  used: integer("used").default(0).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});
