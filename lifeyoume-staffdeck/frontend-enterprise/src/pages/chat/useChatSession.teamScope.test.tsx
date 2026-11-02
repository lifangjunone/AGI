// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '@/i18n';
import { ENTERPRISE_AGENT_STORAGE_KEY } from '@/lib/agent-scope-storage';
import type { AgentProfileRead, ChatSession } from '@/types';

import { useChatSession } from './useChatSession';

const AUTH_STORAGE_KEY = 'ultrarag_auth';

const teamSession: ChatSession = {
  id: 'session-team-1',
  tenant_id: 'tenant_demo',
  status: 'active',
  team_id: 'team-1',
  team_name: '增长团队',
  title: '团队 增长团队 · TL 对话',
  updated_at: '2026-08-01T00:00:00Z',
};

const employeeSession: ChatSession = {
  id: 'session-emp-1',
  tenant_id: 'tenant_demo',
  agent_id: 'agent-1',
  status: 'active',
  updated_at: '2026-08-01T00:00:00Z',
};

const employee: AgentProfileRead = {
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

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify(body ?? {}),
    json: async () => body,
  } as Response;
}

function stubChatFetch(sessions: ChatSession[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/chat/sessions/session-team-1?')) return jsonResponse(teamSession);
    if (url.includes('/api/chat/sessions/session-emp-1?')) return jsonResponse(employeeSession);
    if (url.includes('/api/chat/sessions?')) return jsonResponse(sessions);
    if (url.includes('/api/chat/')) return jsonResponse([]);
    if (url.includes('/api/enterprise/')) return jsonResponse([]);
    return jsonResponse({});
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderChatSession(
  initialPath: string,
  options: Parameters<typeof useChatSession>[0] = {},
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <I18nProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/workspace/chat/:sessionId" element={<>{children}</>} />
          <Route path="/workspace/chat/draft/:draftAgentId" element={<>{children}</>} />
          <Route path="/workspace/chat" element={<>{children}</>} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>
  );
  return renderHook(() => useChatSession(options), { wrapper });
}

beforeEach(() => {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
    token: 'token-1',
    user: { id: 'user-1', tenant_id: 'tenant_demo', username: 'demo', role: 'admin' },
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('useChatSession team scope', () => {
  it('loads its model catalog on a direct chat entry without visiting management', async () => {
    const fetchMock = stubChatFetch([]);
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes('/model-configs')) return jsonResponse([
        { id: 'cold-model', tenant_id: 'tenant_demo', enabled: true, is_default: true, model: 'test' },
      ]);
      return jsonResponse([]);
    });
    const { result } = renderChatSession('/workspace/chat');
    await waitFor(() => expect(result.current.modelConfigsLoading).toBe(false));
    expect(result.current.selectedModelConfig?.id).toBe('cold-model');
  });

  it('does not let an older catalog response overwrite a newer same-tenant update', async () => {
    const fetchMock = stubChatFetch([]);
    let complete!: (response: Response) => void;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes('/model-configs')) return new Promise<Response>((resolve) => { complete = resolve; });
      return jsonResponse([]);
    });
    const { result } = renderChatSession('/workspace/chat');
    await waitFor(() => expect(complete).toBeDefined());
    act(() => window.dispatchEvent(new CustomEvent('ultrarag-enterprise-model-configs-updated', { detail: {
      models: [{ id: 'new-model', tenant_id: 'tenant_demo', enabled: true, is_default: true }],
    } })));
    expect(result.current.modelConfigsLoading).toBe(false);
    await act(async () => complete(jsonResponse([{ id: 'old-model', tenant_id: 'tenant_demo', enabled: true }])));
    expect(result.current.selectedModelConfig?.id).toBe('new-model');
  });

  it('leaves loading after catalog failure and does not treat it as an empty setup', async () => {
    const fetchMock = stubChatFetch([]);
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes('/model-configs')) throw new TypeError('offline');
      return jsonResponse([]);
    });
    const { result } = renderChatSession('/workspace/chat');
    await waitFor(() => expect(result.current.modelConfigsLoading).toBe(false));
    expect(result.current.showModelSetupNotice).toBe(false);
    expect(result.current.selectedModelConfig).toBeNull();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/model-configs'))).toHaveLength(2);
  });

  it('syncs the shared scope for an active team group', async () => {
    window.localStorage.setItem(ENTERPRISE_AGENT_STORAGE_KEY, 'agent-1');
    stubChatFetch([teamSession, employeeSession]);
    renderChatSession('/workspace/chat/session-team-1');

    await waitFor(() => {
      expect(window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY)).toBe('team:team-1');
    });
  });

  it('keeps the employee scope for regular employee sessions', async () => {
    window.localStorage.setItem(ENTERPRISE_AGENT_STORAGE_KEY, 'agent-1');
    stubChatFetch([teamSession, employeeSession]);
    renderChatSession('/workspace/chat/session-emp-1');

    await waitFor(() => {
      expect(window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY)).toBe('agent-1');
    });
    // 给员工会话留足同步窗口，确认不会被误写成团队作用域。
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(window.localStorage.getItem(ENTERPRISE_AGENT_STORAGE_KEY)).toBe('agent-1');
  });

  it('filters the unified session list to a selected team group', async () => {
    window.localStorage.setItem(ENTERPRISE_AGENT_STORAGE_KEY, 'team:team-1');
    stubChatFetch([teamSession, employeeSession]);
    const { result } = renderChatSession('/workspace/chat');

    await waitFor(() => {
      expect(result.current.sessionsLoading).toBe(false);
    });
    expect(result.current.visibleSidebarSessions.map((session) => session.id)).toEqual(['session-team-1']);
  });

  it('keeps polling messages after a team leader turn hands work to members', async () => {
    vi.useFakeTimers();
    const fetchMock = stubChatFetch([teamSession, employeeSession]);
    renderChatSession('/workspace/chat/session-team-1');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    const messageRequestCount = () => fetchMock.mock.calls.filter(([input]) => (
      String(input).includes('/api/chat/sessions/session-team-1/messages?')
    )).length;
    expect(messageRequestCount()).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    expect(messageRequestCount()).toBeGreaterThan(1);
  });

  it('restores a first-message draft when the server session was never confirmed', async () => {
    const fetchMock = stubChatFetch([]);
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/chat/agents')) return jsonResponse([employee]);
      if (url.includes('/model-configs')) return jsonResponse([
        {
          id: 'model-1',
          tenant_id: 'tenant_demo',
          enabled: true,
          is_default: true,
          model: 'test',
        },
      ]);
      if (url.includes('/api/chat/stream')) throw new TypeError('network disconnected');
      if (url.includes('/api/chat/sessions?')) return jsonResponse([]);
      if (url.includes('/api/chat/')) return jsonResponse([]);
      if (url.includes('/api/enterprise/')) return jsonResponse([]);
      return jsonResponse({});
    });
    const { result } = renderChatSession('/workspace/chat/draft/agent-1');

    await waitFor(() => {
      expect(result.current.sessionsLoading).toBe(false);
      expect(result.current.modelConfigsLoading).toBe(false);
      expect(result.current.displayedAgent?.id).toBe('agent-1');
    });

    act(() => result.current.setInput('请帮我整理这份需求'));
    await act(async () => result.current.send());

    expect(result.current.input).toBe('请帮我整理这份需求');
    expect(result.current.displayedMessages).toEqual([]);
    expect(result.current.currentSessionRunning).toBe(false);
    expect(fetchMock.mock.calls.filter(([url]) => (
      String(url).includes('/api/chat/stream')
    ))).toHaveLength(1);
  });

  it('restores ready attachments and scheduled intent with an unconfirmed first message', async () => {
    const fetchMock = stubChatFetch([]);
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/chat/agents')) return jsonResponse([employee]);
      if (url.includes('/model-configs')) return jsonResponse([
        {
          id: 'model-1',
          tenant_id: 'tenant_demo',
          enabled: true,
          is_default: true,
          model: 'test',
        },
      ]);
      if (url.includes('/api/chat/attachments')) return jsonResponse([{
        id: 'attachment-1',
        filename: 'brief.txt',
        content_type: 'text/plain',
        size: 12,
        kind: 'text',
        text: 'project brief',
        sha256: 'attachment-sha',
      }]);
      if (url.includes('/api/chat/stream')) throw new TypeError('network disconnected');
      if (url.includes('/api/chat/sessions?')) return jsonResponse([]);
      if (url.includes('/api/chat/')) return jsonResponse([]);
      if (url.includes('/api/enterprise/')) return jsonResponse([]);
      return jsonResponse({});
    });
    const { result } = renderChatSession('/workspace/chat/draft/agent-1');

    await waitFor(() => {
      expect(result.current.modelConfigsLoading).toBe(false);
      expect(result.current.displayedAgent?.id).toBe('agent-1');
    });
    act(() => result.current.uploadComposerFiles([
      new File(['project brief'], 'brief.txt', { type: 'text/plain' }),
    ]));
    await waitFor(() => expect(result.current.readyComposerAttachments).toHaveLength(1));
    act(() => result.current.setInput('明天早上整理需求'));
    await act(async () => result.current.send('scheduled_task'));

    expect(result.current.input).toBe('明天早上整理需求');
    expect(result.current.readyComposerAttachments).toEqual([
      expect.objectContaining({
        id: 'attachment-1',
        filename: 'brief.txt',
        uploadStatus: 'ready',
      }),
    ]);
    expect(result.current.composerIntent).toBe('scheduled_task');
    expect(result.current.displayedMessages).toEqual([]);
    expect(fetchMock.mock.calls.filter(([url]) => (
      String(url).includes('/api/chat/stream')
    ))).toHaveLength(1);
  });

  it('preserves text typed during a failed first-message request', async () => {
    let rejectStream!: (error: unknown) => void;
    const fetchMock = stubChatFetch([]);
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/chat/agents')) return jsonResponse([employee]);
      if (url.includes('/model-configs')) return jsonResponse([
        {
          id: 'model-1',
          tenant_id: 'tenant_demo',
          enabled: true,
          is_default: true,
          model: 'test',
        },
      ]);
      if (url.includes('/api/chat/stream')) {
        return new Promise<Response>((_resolve, reject) => {
          rejectStream = reject;
        });
      }
      if (url.includes('/api/chat/sessions?')) return jsonResponse([]);
      if (url.includes('/api/chat/')) return jsonResponse([]);
      if (url.includes('/api/enterprise/')) return jsonResponse([]);
      return jsonResponse({});
    });
    const { result } = renderChatSession('/workspace/chat/draft/agent-1');

    await waitFor(() => {
      expect(result.current.modelConfigsLoading).toBe(false);
      expect(result.current.displayedAgent?.id).toBe('agent-1');
    });
    act(() => result.current.setInput('第一条没有发出去的内容'));
    let sendPromise!: Promise<void>;
    act(() => {
      sendPromise = result.current.send();
    });
    await waitFor(() => expect(rejectStream).toBeDefined());
    expect(result.current.input).toBe('');
    act(() => result.current.setInput('网络等待时补充的新内容'));
    await act(async () => {
      rejectStream(new TypeError('network disconnected'));
      await sendPromise;
    });

    expect(result.current.input).toBe(
      '第一条没有发出去的内容\n\n网络等待时补充的新内容',
    );
    expect(fetchMock.mock.calls.filter(([url]) => (
      String(url).includes('/api/chat/stream')
    ))).toHaveLength(1);
  });

  it('does not restore a regular session turn whose server outcome is uncertain', async () => {
    const fetchMock = stubChatFetch([employeeSession]);
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/chat/agents')) return jsonResponse([employee]);
      if (url.includes('/model-configs')) return jsonResponse([
        {
          id: 'model-1',
          tenant_id: 'tenant_demo',
          enabled: true,
          is_default: true,
          model: 'test',
        },
      ]);
      if (url.includes('/api/chat/stream')) throw new TypeError('stream disconnected');
      if (url.includes('/api/chat/sessions/session-emp-1?')) return jsonResponse(employeeSession);
      if (url.includes('/api/chat/sessions?')) return jsonResponse([employeeSession]);
      if (url.includes('/api/chat/')) return jsonResponse([]);
      if (url.includes('/api/enterprise/')) return jsonResponse([]);
      return jsonResponse({});
    });
    const { result } = renderChatSession('/workspace/chat/session-emp-1');

    await waitFor(() => {
      expect(result.current.sessionsLoading).toBe(false);
      expect(result.current.modelConfigsLoading).toBe(false);
    });
    act(() => result.current.setInput('不要造成重复提交'));
    await act(async () => result.current.send());

    expect(result.current.input).toBe('');
    expect(fetchMock.mock.calls.filter(([url]) => (
      String(url).includes('/api/chat/stream')
    ))).toHaveLength(1);
  });
});
