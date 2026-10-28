export type Mode = 'demo' | 'live';
export type Space = 'teach' | 'publish' | 'delivery';
export type Skill = 'writing' | 'analysis' | 'risk';
export const skills: Record<Skill, string> = {writing: '知识写作', analysis: '问题分类', risk: '例外核对'};
export interface Source {
  id: string; title: string; text: string; method: string; conditions: string; active: boolean;
  confirmed: boolean; audience: string[]; version: number; contributor: string;
  understanding: string; question: string; fact_type: string; error?: string;
}
export interface Employee {
  id: string; name: string; role: string; skill: Skill; avatar: number; fixture: boolean;
  question: string; points: number; valid_skills: Record<Mode, Skill[]>; sources: Source[];
}
export interface Attempt {
  id: string; employee_id: string; kind: 'exam' | 'trial'; mode: Mode; answer: string;
  passed?: boolean; score?: number; approved?: boolean; error?: string; feedback?: string;
}
export interface Member {
  employee_id: string; name: string; skill: Skill; reason: string; joined_at: string;
}
export interface Artifact {
  id: string; title: string; content: string; author: string; citations: string[];
  version: number; affected: boolean; mode: Mode;
}
export interface Task {
  id: string; goal: string; output: string; input_text: string; deadline: string; skills: Skill[];
  mode: Mode; auto_run: boolean; status: string; version: number; artifact_version: number;
  members: Member[]; group_id: string | null; error: string; affected: boolean;
  feedback: string; artifacts: Artifact[];
  review: {checks: Record<string, boolean>; passed: boolean; note: string} | null;
  rewards: {employee_id: string; points: number}[];
  events: {seq: number; action: string; actor: string; created_at: string; detail: {message?: string; [key: string]: unknown}}[];
}
export interface Workspace {
  employees: Employee[]; sources: Source[]; tasks: Task[]; attempts: Attempt[];
  health: {knowledge: {status: string; version: string}; model: {live_available: boolean; model: string}; boundary: string};
}
export interface Account {
  id: string; name: string; email: string; created_at: string; last_login_at?: string;
}
export interface AuthState {
  account: Account | null; accounts: Account[];
}
export async function api<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  const result = await fetch('/api' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? headers : {'Content-Type': 'application/json', ...headers},
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  if (!result.ok) {
    let message = '请求失败，请重试';
    try {const data = await result.json(); message = typeof data.detail === 'string' ? data.detail : '输入格式不符合要求';}
    catch {message = `服务不可用 (${result.status})`;}
    throw new Error(message);
  }
  return result.json();
}
