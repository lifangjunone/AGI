export type AutonomyMode = "observe" | "collaborate" | "autonomous";
export type AgentStatus = "working" | "idle" | "reviewing";
export type TaskStatus =
  | "backlog"
  | "ready"
  | "running"
  | "review"
  | "approval"
  | "blocked"
  | "done";

export interface Agent {
  id: string;
  name: string;
  initials: string;
  role: string;
  specialty: string;
  color: string;
  status: AgentStatus;
  trust: number;
  load: number;
  memoryCount: number;
}

export interface Task {
  id: string;
  title: string;
  summary: string;
  status: TaskStatus;
  agentId: string;
  dependsOn: string[];
  progress: number;
  confidence: number;
  risk: number;
  attempts: number;
  requiresApproval?: boolean;
  artifact?: string;
}

export interface Event {
  id: string;
  cycle: number;
  agentId: string;
  kind: "claim" | "progress" | "handoff" | "review" | "memory" | "system";
  message: string;
}

export interface Memory {
  id: string;
  agentId: string;
  title: string;
  detail: string;
  importance: number;
  cycle: number;
  tags: string[];
}

export interface MissionState {
  id: string;
  title: string;
  objective: string;
  mode: AutonomyMode;
  running: boolean;
  cycle: number;
  riskBudget: number;
  agents: Agent[];
  tasks: Task[];
  events: Event[];
  memories: Memory[];
}
