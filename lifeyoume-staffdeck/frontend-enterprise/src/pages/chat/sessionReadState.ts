import type { ChatSession } from '@/types';

export const SESSION_READ_STORAGE_PREFIX = 'skill_agent_session_read_at';

export function sessionReadStorageKey(userId: string): string {
  return `${SESSION_READ_STORAGE_PREFIX}:${userId || 'anonymous'}`;
}

export function loadSessionReadTimes(userId: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(sessionReadStorageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function persistSessionReadTimes(userId: string, values: Record<string, string>): void {
  window.localStorage.setItem(sessionReadStorageKey(userId), JSON.stringify(values));
}

export function sessionHasUnreadReply(
  session: ChatSession,
  readTimes: Record<string, string>,
  activeSessionId?: string,
): boolean {
  if (session.id === activeSessionId) return false;
  const summary = session.summary || session.last_agent_question || '';
  if (!summary) return false;
  if (session.status === 'running' || session.status === 'executing') return false;
  const updatedAt = Date.parse(session.updated_at || '');
  const readAt = Date.parse(readTimes[session.id] || '');
  return Number.isFinite(updatedAt) && (!Number.isFinite(readAt) || updatedAt > readAt + 1000);
}
