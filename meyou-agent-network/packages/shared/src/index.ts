import { z } from "zod";

export const agentModes = ["auto", "confirm", "paused"] as const;
export const visibilityLevels = ["public", "match", "agent", "never"] as const;
export const missionKinds = ["friend", "dating", "business", "hiring", "travel", "custom"] as const;
export const plans = ["free", "pro", "team"] as const;

export type AgentMode = (typeof agentModes)[number];
export type VisibilityLevel = (typeof visibilityLevels)[number];
export type MissionKind = (typeof missionKinds)[number];
export type PlanName = (typeof plans)[number];
export const plazaActivities = ["walking", "looking", "idle", "chatting", "business", "dating"] as const;
export type PlazaActivity = (typeof plazaActivities)[number];
export const plazaRuntimeModes = ["controlled", "continuous"] as const;
export type PlazaRuntimeMode = (typeof plazaRuntimeModes)[number];

export const plazaActionSchema = z.object({
  circleId: z.string().uuid(),
  activity: z.enum(plazaActivities),
  content: z.string().trim().max(240).optional().default("")
});

export const plazaMoveSchema = z.object({
  circleId: z.string().uuid(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100)
});

export const plazaRuntimeSettingsSchema = z.object({
  mode: z.enum(plazaRuntimeModes),
  activeFrom: z.string().regex(/^\d{2}:\d{2}$/).default("09:00"),
  activeUntil: z.string().regex(/^\d{2}:\d{2}$/).default("22:00"),
  dailyLimit: z.number().int().min(1).max(50).default(8),
  cooldownMinutes: z.number().int().min(5).max(1440).default(120),
  allowedActivities: z.array(z.enum(plazaActivities)).min(1).max(plazaActivities.length)
});

export const communitySchema = z.object({
  name: z.string().trim().min(2).max(60),
  handle: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{3,32}$/),
  description: z.string().trim().min(2).max(500),
  visibility: z.enum(["public", "private"]).default("public"),
  topic: z.string().trim().min(1).max(24).default("聊兴趣"),
  color: z.enum(["navy", "violet", "gold", "coral", "sage"]).default("sage")
});

export const organizationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  handle: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{3,32}$/),
  description: z.string().trim().min(2).max(500)
});

export interface PlazaSnapshot {
  generatedAt: string;
  scope: {
    view: "global" | "circle";
    query: string;
    page: number;
    pageSize: number;
    totalCircles: number;
    totalPages: number;
    circleId?: string;
    zoom?: number;
    bounds?: { minX: number; minY: number; maxX: number; maxY: number };
    nextCursor?: string | null;
  };
  viewer: {
    userId: string;
    agentName: string;
    present: boolean;
    communityMode: AgentMode;
    runtime: {
      mode: PlazaRuntimeMode;
      activeFrom: string;
      activeUntil: string;
      dailyLimit: number;
      cooldownMinutes: number;
      allowedActivities: PlazaActivity[];
    };
  };
  stats: {
    present: number;
    talking: number;
    circles: number;
    eventsToday: number;
  };
  circles: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    topic: string;
    color: string;
    communityId?: string | null;
    ownerId?: string | null;
    visibility: "public" | "private";
    x: number;
    y: number;
    radius: number;
    population: number;
    heat: number;
    latestLine?: string;
  }>;
  agents: Array<{
    userId: string;
    agentName: string;
    ownerName: string;
    avatar?: string | null;
    npcColor?: string | null;
    circleId?: string | null;
    activity: PlazaActivity;
    statusText: string;
    x: number;
    y: number;
    lastSeenAt: string;
    mine: boolean;
  }>;
  events: Array<{
    id: string;
    circleId: string;
    userId: string;
    agentName: string;
    ownerName: string;
    kind: PlazaActivity | "joined" | "left";
    content: string;
    createdAt: string;
  }>;
}

export const agentProfileSchema = z.object({
  name: z.string().trim().min(1).max(60),
  handle: z.string().trim().regex(/^[a-z0-9_-]{3,32}$/),
  headline: z.string().trim().min(1).max(160),
  bio: z.string().trim().max(1200),
  npcColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  languages: z.array(z.string().min(2).max(12)).min(1),
  goals: z.array(z.string().trim().min(1).max(120)).max(12),
  interests: z.array(z.string().trim().min(1).max(60)).max(20),
  boundaries: z.array(z.string().trim().min(1).max(160)).max(20),
  tone: z.enum(["warm", "direct", "thoughtful", "professional"]),
  modes: z.object({
    personal: z.enum(agentModes),
    dating: z.enum(agentModes),
    community: z.enum(agentModes),
    business: z.enum(agentModes)
  })
});

export const missionSchema = z.object({
  kind: z.enum(missionKinds),
  prompt: z.string().trim().min(1).max(1200),
  locale: z.enum(["zh-CN", "en"]),
  active: z.boolean().default(true)
});

export const datingProfileSchema = z.object({
  adultConfirmed: z.literal(true),
  age: z.number().int().min(18).max(99),
  intent: z.enum(["long_term", "serious_dating", "open_to_explore"]),
  ageMin: z.number().int().min(18).max(99),
  ageMax: z.number().int().min(18).max(99),
  cityScope: z.string().trim().min(2).max(80),
  languages: z.array(z.string()).min(1),
  values: z.array(z.string().trim().min(1).max(60)).min(1).max(12),
  lifestyle: z.array(z.string().trim().min(1).max(60)).max(12),
  dealbreakers: z.array(z.string().trim().min(1).max(100)).max(12),
  discoverable: z.boolean().default(true)
}).refine((value) => value.ageMax >= value.ageMin, {
  message: "ageMax must be greater than or equal to ageMin",
  path: ["ageMax"]
});

export const messageSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().trim().min(1).max(4000),
  actor: z.enum(["human", "agent"])
});

export interface DashboardSnapshot {
  viewer: { id: string; name: string; plan: PlanName };
  agent: {
    id: string;
    name: string;
    headline: string;
    status: AgentMode;
    completion: number;
  };
  attention: Array<{
    id: string;
    type: "approval" | "handoff" | "match";
    title: string;
    detail: string;
    time: string;
  }>;
  matches: Array<{
    id: string;
    alias: string;
    kind: MissionKind;
    score: number;
    reason: string;
    mutual: boolean;
    status: "review" | "accepted" | "waiting";
  }>;
  communities: Array<{
    id: string;
    name: string;
    members: number;
    theme: string;
    introductions: number;
  }>;
  customers: Array<{
    id: string;
    name: string;
    subject: string;
    status: "unassigned" | "agent" | "waiting_human" | "active" | "resolved";
    priority: "low" | "normal" | "high";
    assignee?: string;
  }>;
  missions: Array<{
    id: string;
    kind: MissionKind;
    prompt: string;
    active: boolean;
    lastRunAt: string | Date | null;
  }>;
  organizations: Array<{
    id: string;
    handle: string;
    name: string;
    description: string;
    businessHours: string;
  }>;
  usage: {
    agentReplies: number;
    agentRepliesLimit: number;
    activeMissions: number;
    activeMissionsLimit: number;
  };
}

export const planLimits: Record<PlanName, { missions: number; replies: number; customerThreads: number }> = {
  free: { missions: 1, replies: 80, customerThreads: 20 },
  pro: { missions: 3, replies: 1200, customerThreads: 200 },
  team: { missions: 20, replies: 10000, customerThreads: 3000 }
};

export function canReveal(level: VisibilityLevel, context: "public" | "match" | "agent"): boolean {
  if (level === "never") return false;
  if (level === "public") return true;
  if (level === "match") return context === "match" || context === "agent";
  return context === "agent";
}

export function hasMutualConsent(owner: boolean, candidate: boolean, revoked = false): boolean {
  return !revoked && owner && candidate;
}

export function missionAvailable(plan: PlanName, activeCount: number): boolean {
  return activeCount < planLimits[plan].missions;
}
