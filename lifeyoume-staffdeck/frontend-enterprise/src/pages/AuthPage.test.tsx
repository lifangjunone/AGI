// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { BRAND } from '../config/brand';
import { I18nProvider } from '../i18n';
import AuthPage from './AuthPage';

const bootstrapHtml = '<form><input name="csrf_token" value="csrf-test"></form>';

function response(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    redirected: false,
    url: '',
    text: async () => body,
  } as Response;
}

function renderAuth(path = '/auth/login') {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <AuthPage />
      </MemoryRouter>
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  document.documentElement.lang = 'zh-CN';
});

describe('AuthPage accessibility', () => {
  it('uses the authentication task as the only page heading and document title', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(bootstrapHtml)));
    const user = userEvent.setup();
    renderAuth();

    expect(await screen.findByRole('heading', { level: 1, name: '欢迎回来' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: /一次登录/ })).toBeTruthy();
    expect(document.title).toBe(`欢迎回来 · ${BRAND.name}`);

    await user.click(screen.getByRole('button', { name: /^注册$/ }));
    expect(await screen.findByRole('heading', { level: 1, name: '创建统一账号' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(document.title).toBe(`创建统一账号 · ${BRAND.name}`);
  });

  it('exposes selected auth mode and password visibility state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(bootstrapHtml)));
    const user = userEvent.setup();
    renderAuth();

    await waitFor(() => expect(screen.getByRole('button', { name: '进入数字团队' }).hasAttribute('disabled')).toBe(false));
    expect(screen.getByRole('button', { name: /^登录$/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /^注册$/ }).getAttribute('aria-pressed')).toBe('false');

    const toggle = screen.getByRole('button', { name: '显示密码' });
    expect(toggle.getAttribute('aria-controls')).toBe('auth-password');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    await user.click(toggle);
    expect(screen.getByRole('button', { name: '隐藏密码' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('密码').getAttribute('type')).toBe('text');
  });

  it('focuses and connects a server password error to the password field', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(bootstrapHtml))
      .mockResolvedValueOnce(response('<p role="alert">密码错误，请重试</p>', 401));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderAuth();

    await user.type(screen.getByLabelText('邮箱'), 'user@example.com');
    await user.type(screen.getByLabelText('密码'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: '进入数字团队' }));

    const error = await screen.findByRole('alert');
    expect(error.id).toBe('auth-password-error');
    expect(document.activeElement).toBe(screen.getByLabelText('密码'));
    expect(screen.getByLabelText('密码').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('密码').getAttribute('aria-describedby')).toBe('auth-password-error');
  });

  it('keeps ambiguous credential errors on the form summary', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(bootstrapHtml))
      .mockResolvedValueOnce(response('<p role="alert">邮箱或密码不正确</p>', 401));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderAuth();

    await user.type(screen.getByLabelText('邮箱'), 'user@example.com');
    await user.type(screen.getByLabelText('密码'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: '进入数字团队' }));

    const error = await screen.findByRole('alert');
    expect(document.activeElement).toBe(error);
    expect(screen.getByLabelText('邮箱').hasAttribute('aria-invalid')).toBe(false);
    expect(screen.getByLabelText('密码').hasAttribute('aria-invalid')).toBe(false);
  });

  it('reconnects after bootstrap failure without losing entered fields', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response('<p role="alert">身份服务暂时不可用</p>', 503))
      .mockResolvedValueOnce(response(bootstrapHtml));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderAuth();

    const error = await screen.findByRole('alert');
    expect(error.textContent).toContain('身份服务暂时不可用');
    expect(document.activeElement).toBe(error);
    const submit = screen.getByRole('button', { name: '进入数字团队' });
    expect(submit.hasAttribute('disabled')).toBe(true);

    await user.type(screen.getByLabelText('邮箱'), 'user@example.com');
    await user.type(screen.getByLabelText('密码'), 'saved-password');
    await user.click(screen.getByRole('button', { name: '重新连接' }));

    await waitFor(() => expect(submit.hasAttribute('disabled')).toBe(false));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('邮箱').getAttribute('value')).toBe('user@example.com');
    expect(screen.getByLabelText('密码').getAttribute('value')).toBe('saved-password');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps registration password requirements visible and associated while typing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(bootstrapHtml)));
    const user = userEvent.setup();
    renderAuth('/auth/register');

    const password = screen.getByLabelText('密码');
    const help = screen.getByText('至少 12 位，可使用密码管理器生成并填入。');
    expect(help.id).toBe('auth-password-help');
    expect(password.getAttribute('aria-describedby')).toBe('auth-password-help');

    await user.type(password, 'partial');
    expect(screen.getByText('至少 12 位，可使用密码管理器生成并填入。')).toBeTruthy();
    expect(password.getAttribute('aria-describedby')).toBe('auth-password-help');
    expect(screen.getByLabelText('确认密码').getAttribute('autocomplete')).toBe('new-password');
  });

  it('validates registration fields in order without calling the identity submit endpoint', async () => {
    const fetchMock = vi.fn(async () => response(bootstrapHtml));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderAuth('/auth/register');

    const submit = await screen.findByRole('button', { name: '创建账号并进入' });
    await waitFor(() => expect(submit.hasAttribute('disabled')).toBe(false));

    await user.click(submit);
    let error = await screen.findByRole('alert');
    expect(error.id).toBe('auth-display-name-error');
    expect(error.textContent).toBe('显示名称至少需要 2 个字符');
    expect(document.activeElement).toBe(screen.getByLabelText('显示名称'));
    expect(screen.getByLabelText('显示名称').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('显示名称').getAttribute('aria-describedby')).toBe('auth-display-name-error');

    await user.type(screen.getByLabelText('显示名称'), '小明');
    expect(screen.queryByRole('alert')).toBeNull();
    await user.click(submit);
    error = await screen.findByRole('alert');
    expect(error.id).toBe('auth-email-error');
    expect(error.textContent).toBe('请输入邮箱');
    expect(document.activeElement).toBe(screen.getByLabelText('邮箱'));

    await user.type(screen.getByLabelText('邮箱'), 'invalid-email');
    await user.click(submit);
    error = await screen.findByRole('alert');
    expect(error.textContent).toBe('请输入有效的邮箱地址');
    expect(document.activeElement).toBe(screen.getByLabelText('邮箱'));

    await user.clear(screen.getByLabelText('邮箱'));
    await user.type(screen.getByLabelText('邮箱'), 'user@example.com');
    await user.click(submit);
    error = await screen.findByRole('alert');
    expect(error.id).toBe('auth-password-error');
    expect(error.textContent).toBe('请输入密码');
    expect(document.activeElement).toBe(screen.getByLabelText('密码'));
    expect(screen.getByLabelText('密码').getAttribute('aria-describedby')).toBe(
      'auth-password-help auth-password-error',
    );

    await user.type(screen.getByLabelText('密码'), 'short');
    await user.click(submit);
    error = await screen.findByRole('alert');
    expect(error.textContent).toBe('密码至少需要 12 位');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.clear(screen.getByLabelText('密码'));
    await user.type(screen.getByLabelText('密码'), 'long-enough-password');
    await user.click(submit);
    error = await screen.findByRole('alert');
    expect(error.id).toBe('auth-confirm-password-error');
    expect(error.textContent).toBe('请再次输入密码');
    expect(document.activeElement).toBe(screen.getByLabelText('确认密码'));

    await user.type(screen.getByLabelText('确认密码'), 'different-password');
    await user.click(submit);
    error = await screen.findByRole('alert');
    expect(error.textContent).toBe('两次输入的密码不一致');
    expect(screen.getByLabelText('确认密码').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('确认密码').getAttribute('aria-describedby')).toBe(
      'auth-confirm-password-error',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('validates password confirmation on blur and offers an independent visibility control', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(bootstrapHtml)));
    const user = userEvent.setup();
    renderAuth('/auth/register');

    await user.type(screen.getByLabelText('显示名称'), '小明');
    await user.type(screen.getByLabelText('邮箱'), 'user@example.com');
    await user.type(screen.getByLabelText('密码'), 'long-enough-password');
    const confirmation = screen.getByLabelText('确认密码');
    await user.type(confirmation, 'different-password');
    await user.tab();

    const error = await screen.findByRole('alert');
    expect(error.id).toBe('auth-confirm-password-error');
    expect(error.textContent).toBe('两次输入的密码不一致');
    expect(document.activeElement).not.toBe(confirmation);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '显示确认密码' }));
    await user.click(screen.getByRole('button', { name: '创建账号并进入' }));
    expect(document.activeElement).toBe(confirmation);
    const toggle = screen.getByRole('button', { name: '显示确认密码' });
    expect(toggle.getAttribute('aria-controls')).toBe('auth-confirm-password');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    await user.click(toggle);
    expect(confirmation.getAttribute('type')).toBe('text');
    expect(screen.getByRole('button', { name: '隐藏确认密码' }).getAttribute('aria-pressed'))
      .toBe('true');
  });

  it('clears a stale confirmation mismatch when the original password is corrected', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(bootstrapHtml)));
    const user = userEvent.setup();
    renderAuth('/auth/register');

    const password = screen.getByLabelText('密码');
    const confirmation = screen.getByLabelText('确认密码');
    await user.type(password, 'first-long-password');
    await user.type(confirmation, 'second-long-password');
    await user.tab();

    expect((await screen.findByRole('alert')).textContent).toBe('两次输入的密码不一致');
    expect(confirmation.getAttribute('aria-invalid')).toBe('true');

    await user.clear(password);
    await user.type(password, 'second-long-password');

    expect(screen.queryByRole('alert')).toBeNull();
    expect(confirmation.hasAttribute('aria-invalid')).toBe(false);
    expect(confirmation.hasAttribute('aria-describedby')).toBe(false);
    expect(document.activeElement).toBe(password);
  });

  it('reports a new confirmation mismatch when the original password loses focus', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(bootstrapHtml)));
    const user = userEvent.setup();
    renderAuth('/auth/register');

    const password = screen.getByLabelText('密码');
    const confirmation = screen.getByLabelText('确认密码');
    await user.type(password, 'matching-long-password');
    await user.type(confirmation, 'matching-long-password');
    await user.click(password);
    await user.clear(password);
    await user.type(password, 'changed-long-password');
    await user.tab();

    const error = await screen.findByRole('alert');
    expect(error.textContent).toBe('两次输入的密码不一致');
    expect(confirmation.getAttribute('aria-invalid')).toBe('true');
    expect(confirmation.getAttribute('aria-describedby')).toBe('auth-confirm-password-error');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '显示密码' }));
  });

  it('localizes registration validation errors in English', async () => {
    window.localStorage.setItem('staffdeck_locale', 'en-US');
    const fetchMock = vi.fn(async () => response(bootstrapHtml));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderAuth('/auth/register');

    const submit = await screen.findByRole('button', { name: 'Create account and enter' });
    await waitFor(() => expect(submit.hasAttribute('disabled')).toBe(false));
    await user.click(submit);

    const error = await screen.findByRole('alert');
    expect(error.textContent).toBe('Display name must be at least 2 characters.');
    expect(document.activeElement).toBe(screen.getByLabelText('Display name'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Confirm password')).toBeTruthy();
  });
});
