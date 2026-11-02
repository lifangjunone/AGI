// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '@/i18n';
import { ENTERPRISE_AGENT_STORAGE_KEY } from '@/lib/agent-scope-storage';
import type { AgentProfileRead, ChatSession, TeamRead } from '@/types';

import { useGallerySession } from './useGallerySession';

const agent: AgentProfileRead = {
  id: 'agent-1',
  tenant_id: 'tenant_demo',
  name: '小艾',
  is_overall: false,
  status: 'active',
  metadata: {},
  resources: [],
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};
const team: TeamRead = {
  id: 'team-1',
  tenant_id: 'tenant_demo',
  name: '增长团队',
  description: '',
  owner_user_id: 'user-1',
  config: {},
  status: 'active',
  members: [],
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};
const sessions: ChatSession[] = [
  {
    id: 'session-agent',
    tenant_id: 'tenant_demo',
    agent_id: 'agent-1',
    status: 'active',
    title: '员工会话',
    updated_at: '2026-08-01T00:00:00Z',
  },
  {
    id: 'session-team',
    tenant_id: 'tenant_demo',
    team_id: 'team-1',
    team_name: '增长团队',
    status: 'active',
    title: '团队会话',
    updated_at: '2026-08-01T00:00:00Z',
  },
];

function response(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify(body),
  } as Response;
}

function stubFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/chat/agents')) return response([agent]);
    if (url.includes('/api/enterprise/teams')) return response([team]);
    if (url.includes('/api/chat/handoffs')) return response([]);
    if (url.includes('/api/chat/sessions/session-agent') && init?.method === 'PUT') {
      return response({ ...sessions[0], title: '新名称' });
    }
    if (url.includes('/api/chat/sessions/session-agent') && init?.method === 'DELETE') {
      return response({});
    }
    if (url.includes('/api/chat/sessions')) return response(sessions);
    return response({});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider><MemoryRouter>{children}</MemoryRouter></I18nProvider>;
}

beforeEach(() => {
  window.localStorage.setItem('ultrarag_auth', JSON.stringify({
    token: 'token',
    user: { id: 'user-1', tenant_id: 'tenant_demo', username: 'demo', role: 'admin' },
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('useGallerySession', () => {
  it('loads only gallery directory, session and handoff data', async () => {
    const fetchMock = stubFetch();
    const { result } = renderHook(() => useGallerySession(), { wrapper });

    await waitFor(() => expect(result.current.sessionsLoading).toBe(false));
    expect(result.current.agents).toEqual([agent]);
    expect(result.current.teams).toEqual([team]);
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes('/api/chat/sessions?'))).toBe(true);
    expect(urls.some((url) => url.includes('/api/chat/agents?'))).toBe(true);
    expect(urls.some((url) => url.includes('/api/chat/handoffs?'))).toBe(true);
    expect(urls.some((url) => url.includes('/model-configs'))).toBe(false);
    expect(urls.some((url) => url.includes('/ui-config'))).toBe(false);
    expect(urls.some((url) => url.includes('/slash-commands'))).toBe(false);
  });

  it('shares employee and team filters with the management scope', async () => {
    stubFetch();
    const { result } = renderHook(() => useGallerySession(), { wrapper });
    await waitFor(() => expect(result.current.sessionsLoading).toBe(false));

    act(() => result.current.setSessionAgentFilter('team:team-1'));
    expect(result.current.visibleSidebarSessions.map((item) => item.id)).toEqual(['session-team']);
    expect(window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY)).toBe('team:team-1');

    act(() => result.current.setSessionAgentFilter('agent-1'));
    expect(result.current.visibleSidebarSessions.map((item) => item.id)).toEqual(['session-agent']);
    expect(window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY)).toBe('agent-1');
  });

  it('keeps rename and delete actions functional without the full chat runtime', async () => {
    const fetchMock = stubFetch();
    const { result } = renderHook(() => useGallerySession(), { wrapper });
    await waitFor(() => expect(result.current.sessionsLoading).toBe(false));

    act(() => result.current.openRename(sessions[0]));
    act(() => result.current.setRenameTitle('新名称'));
    await act(async () => result.current.saveRename());
    expect(result.current.visibleSidebarSessions[0]?.title).toBe('新名称');

    act(() => result.current.requestDelete(sessions[0]));
    await act(async () => result.current.confirmDeleteSession());
    expect(result.current.visibleSidebarSessions.some((item) => item.id === 'session-agent')).toBe(false);
    expect(fetchMock.mock.calls.some(([url, init]) => (
      String(url).includes('session-agent') && init?.method === 'DELETE'
    ))).toBe(true);
  });
});
