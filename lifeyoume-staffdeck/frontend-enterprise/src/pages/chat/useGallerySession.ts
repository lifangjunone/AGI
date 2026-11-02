import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api, isAuthError, TENANT_ID } from '@/api/client';
import { clearEnterpriseAuthSession, getEnterpriseAuthSession } from '@/auth';
import { notify } from '@/components/ui/app-toast';
import { visibleChatEmployees } from '@/employee';
import {
  emitAgentScopeChange,
  persistSharedAgentScope,
  SELECTED_AGENT_STORAGE_KEY,
  sessionFilterStorageKey,
  teamIdFromScope,
} from '@/lib/agent-scope-storage';
import type { AgentProfileRead, ChatSession, HumanHandoffRead, TeamRead } from '@/types';

import { buildSessionFilterOptions } from './sessionFilterOptions';
import { loadSessionReadTimes, persistSessionReadTimes } from './sessionReadState';

const ENTERPRISE_SIDEBAR_STORAGE_KEY = 'ultrarag_enterprise_sidebar_expanded';

export function useGallerySession() {
  const navigate = useNavigate();
  const [auth] = useState(() => getEnterpriseAuthSession());
  const tenantId = auth?.user.tenant_id || TENANT_ID;
  const userId = auth?.user.id || '';
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionReadTimes, setSessionReadTimes] = useState<Record<string, string>>(
    () => loadSessionReadTimes(userId),
  );
  const [agents, setAgents] = useState<AgentProfileRead[]>([]);
  const [teams, setTeams] = useState<TeamRead[]>([]);
  const [teamsLoadFailed, setTeamsLoadFailed] = useState(false);
  const [sessionAgentFilter, setSessionAgentFilterState] = useState(
    () => window.localStorage.getItem(sessionFilterStorageKey(userId))
      || window.localStorage.getItem(SELECTED_AGENT_STORAGE_KEY)
      || 'all',
  );
  const [handoffs, setHandoffs] = useState<HumanHandoffRead[]>([]);
  const [handoffsLoading, setHandoffsLoading] = useState(false);
  const [showHandoffInbox, setShowHandoffInbox] = useState(false);
  const [handoffReplies, setHandoffReplies] = useState<Record<string, string>>({});
  const [renameSession, setRenameSession] = useState<ChatSession | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [pendingDelete, setPendingDelete] = useState<ChatSession | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.localStorage.getItem(ENTERPRISE_SIDEBAR_STORAGE_KEY) === '0',
  );
  const sessionsInitialized = useRef(false);

  const logout = useCallback(() => {
    clearEnterpriseAuthSession();
    window.location.href = import.meta.env.BASE_URL;
  }, []);

  const handleError = useCallback((error: unknown, fallback: string) => {
    if (isAuthError(error)) {
      logout();
      return;
    }
    notify.error(error instanceof Error ? error.message : fallback);
  }, [logout]);

  const refreshAgents = useCallback(async (preferredAgentId?: string) => {
    try {
      const rows = await api.get<AgentProfileRead[]>(
        `/api/chat/agents?tenant_id=${tenantId}&view=summary`,
      );
      setAgents(rows);
      if (preferredAgentId) {
        window.localStorage.setItem(SELECTED_AGENT_STORAGE_KEY, preferredAgentId);
      }
    } catch (error) {
      handleError(error, '员工目录加载失败');
      setAgents([]);
    }
  }, [handleError, tenantId]);

  const refreshTeams = useCallback(async () => {
    try {
      setTeams(await api.get<TeamRead[]>(`/api/enterprise/teams?tenant_id=${tenantId}`));
      setTeamsLoadFailed(false);
    } catch (error) {
      handleError(error, '团队加载失败');
      setTeams([]);
      setTeamsLoadFailed(true);
    }
  }, [handleError, tenantId]);

  const loadSessions = useCallback(async () => {
    try {
      const rows = await api.get<ChatSession[]>(`/api/chat/sessions?tenant_id=${tenantId}`);
      if (!sessionsInitialized.current) {
        const existing = loadSessionReadTimes(userId);
        if (Object.keys(existing).length === 0) {
          const initial = Object.fromEntries(
            rows.map((session) => [session.id, session.updated_at || new Date().toISOString()]),
          );
          setSessionReadTimes(initial);
          persistSessionReadTimes(userId, initial);
        }
        sessionsInitialized.current = true;
      }
      setSessions(rows);
    } catch (error) {
      handleError(error, '会话加载失败');
    } finally {
      setSessionsLoading(false);
    }
  }, [handleError, tenantId, userId]);

  const loadHandoffs = useCallback(async () => {
    setHandoffsLoading(true);
    try {
      setHandoffs(await api.get<HumanHandoffRead[]>(
        `/api/chat/handoffs?tenant_id=${tenantId}&status=pending`,
      ));
    } catch (error) {
      handleError(error, '待回答加载失败');
    } finally {
      setHandoffsLoading(false);
    }
  }, [handleError, tenantId]);

  useEffect(() => {
    void refreshAgents();
    void refreshTeams();
    void loadSessions();
    void loadHandoffs();
  }, [loadHandoffs, loadSessions, refreshAgents, refreshTeams]);

  useEffect(() => {
    const sessionTimer = window.setInterval(loadSessions, 15_000);
    const handoffTimer = window.setInterval(loadHandoffs, 15_000);
    return () => {
      window.clearInterval(sessionTimer);
      window.clearInterval(handoffTimer);
    };
  }, [loadHandoffs, loadSessions]);

  const availableAgents = useMemo(
    () => visibleChatEmployees(agents, auth?.user),
    [agents, auth?.user],
  );
  const sessionFilterOptions = useMemo(
    () => buildSessionFilterOptions(availableAgents, sessions),
    [availableAgents, sessions],
  );
  const visibleSidebarSessions = useMemo(() => {
    const teamId = teamIdFromScope(sessionAgentFilter);
    if (teamId) return sessions.filter((session) => session.team_id === teamId);
    return sessionAgentFilter === 'all'
      ? sessions
      : sessions.filter((session) => !session.team_id && session.agent_id === sessionAgentFilter);
  }, [sessionAgentFilter, sessions]);

  useEffect(() => {
    if (teamIdFromScope(sessionAgentFilter)) return;
    if (!sessionFilterOptions.some((option) => option.value === sessionAgentFilter)) {
      setSessionAgentFilterState('all');
      window.localStorage.setItem(sessionFilterStorageKey(userId), 'all');
    }
  }, [sessionAgentFilter, sessionFilterOptions, userId]);

  const setSessionAgentFilter = useCallback((value: string) => {
    const next = value || 'all';
    setSessionAgentFilterState(next);
    window.localStorage.setItem(sessionFilterStorageKey(userId), next);
    if (next !== 'all') {
      persistSharedAgentScope(next, userId);
      emitAgentScopeChange(next);
    }
  }, [userId]);

  const openSession = useCallback((id: string) => navigate(`/workspace/chat/${id}`), [navigate]);
  const openDraftForAgent = useCallback((agentId: string) => {
    if (!agentId) return;
    setSessionAgentFilter(agentId);
    navigate(`/workspace/chat/draft/${encodeURIComponent(agentId)}`);
  }, [navigate, setSessionAgentFilter]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(ENTERPRISE_SIDEBAR_STORAGE_KEY, next ? '0' : '1');
      return next;
    });
  }, []);

  const openRename = useCallback((session: ChatSession) => {
    setRenameSession(session);
    setRenameTitle(session.title || session.summary || session.last_agent_question || '');
  }, []);
  const saveRename = useCallback(async () => {
    if (!renameSession) return;
    const title = renameTitle.trim();
    if (!title) {
      notify.warning('请输入会话名称');
      return;
    }
    try {
      const updated = await api.put<ChatSession>(`/api/chat/sessions/${renameSession.id}`, {
        tenant_id: tenantId,
        title,
      });
      setSessions((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      setRenameSession(null);
      setRenameTitle('');
      notify.success('已重命名');
    } catch (error) {
      handleError(error, '重命名失败');
    }
  }, [handleError, renameSession, renameTitle, tenantId]);

  const confirmDeleteSession = useCallback(async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await api.delete(`/api/chat/sessions/${target.id}?tenant_id=${tenantId}`);
      setSessions((items) => items.filter((item) => item.id !== target.id));
      notify.success('已删除');
    } catch (error) {
      handleError(error, '删除失败');
    }
  }, [handleError, pendingDelete, tenantId]);

  const submitHandoffReply = useCallback(async (handoff: HumanHandoffRead) => {
    const reply = (handoffReplies[handoff.id] || '').trim();
    if (!reply) {
      notify.warning('请输入回复内容');
      return;
    }
    try {
      await api.post(`/api/chat/handoffs/${handoff.id}/reply`, { tenant_id: tenantId, reply });
      setHandoffs((items) => items.filter((item) => item.id !== handoff.id));
      setHandoffReplies((items) => {
        const next = { ...items };
        delete next[handoff.id];
        return next;
      });
      notify.success('已回复，原会话会继续执行');
      void loadSessions();
    } catch (error) {
      handleError(error, '回复失败');
    }
  }, [handleError, handoffReplies, loadSessions, tenantId]);

  return {
    sessionsLoading,
    visibleSidebarSessions,
    agents,
    teams,
    teamsLoadFailed,
    refreshTeams,
    sessionReadTimes,
    sessionAgentFilter,
    setSessionAgentFilter,
    sessionFilterOptions,
    refreshAgents,
    sidebarCollapsed,
    toggleSidebar,
    openSession,
    openDraftForAgent,
    openGallery: () => navigate('/workspace/gallery'),
    openAdmin: () => navigate('/enterprise/dashboard'),
    logout,
    handoffs,
    handoffsLoading,
    showHandoffInbox,
    setShowHandoffInbox,
    openHandoffInbox: () => {
      setShowHandoffInbox(true);
      void loadHandoffs();
    },
    handoffReplies,
    setHandoffReplies,
    submitHandoffReply,
    renameSession,
    setRenameSession,
    renameTitle,
    setRenameTitle,
    openRename,
    saveRename,
    pendingDelete,
    setPendingDelete,
    requestDelete: setPendingDelete,
    confirmDeleteSession,
  };
}

export type UseGallerySession = ReturnType<typeof useGallerySession>;
