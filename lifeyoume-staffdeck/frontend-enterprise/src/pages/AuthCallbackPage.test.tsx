// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { api } from '../api/client';
import { I18nProvider } from '../i18n';
import AuthCallbackPage from './AuthCallbackPage';

vi.mock('../api/client', () => ({
  api: { post: vi.fn() },
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderCallback(onLogin = vi.fn()) {
  render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/auth/callback']}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallbackPage onLogin={onLogin} />} />
          <Route path="/workspace/gallery" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
  return onLogin;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('AuthCallbackPage', () => {
  it('announces the busy connection state', () => {
    vi.mocked(api.post).mockReturnValue(new Promise(() => undefined));
    renderCallback();

    expect(screen.getByRole('status').textContent).toContain('正在安全连接');
    expect(screen.getByRole('status').closest('section')?.getAttribute('aria-busy')).toBe('true');
  });

  it('focuses an announced error and exposes a login recovery link', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('会话已过期，请重新登录'));
    renderCallback();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('连接没有完成');
    expect(alert.textContent).toContain('会话已过期，请重新登录');
    expect(document.activeElement).toBe(alert);
    expect(alert.closest('section')?.getAttribute('aria-busy')).toBe('false');
    expect(screen.getByRole('link', { name: '重新登录' }).getAttribute('href')).toBe('/auth/login');
  });

  it('stores the exchanged session and replaces the callback route', async () => {
    const session = {
      token: 'test-token',
      user: {
        id: 'user-1',
        tenant_id: 'tenant-1',
        username: 'person@example.com',
        display_name: 'Person',
        is_admin: false,
      },
    };
    vi.mocked(api.post).mockResolvedValue(session);
    const onLogin = renderCallback();

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/workspace/gallery'));
    expect(onLogin).toHaveBeenCalledWith(session);
  });
});
