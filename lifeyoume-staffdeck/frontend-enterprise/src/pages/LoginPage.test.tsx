// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type EnterpriseAuthSession } from '../auth';
import { I18nProvider } from '../i18n';

import LoginPage from './LoginPage';

function renderLogin(onLogin = vi.fn()) {
  render(
    <I18nProvider>
      <LoginPage onLogin={onLogin} />
    </I18nProvider>,
  );
  return onLogin;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('LoginPage', () => {
  it('shows the product preview and sends the entry action to a dedicated auth page', () => {
    renderLogin();

    expect(screen.queryByText('LifeYouMe AI 工程产品')).toBeNull();
    expect(screen.queryByText('把你的经验，变成一支随时上岗的 AI 团队')).toBeNull();
    expect(screen.queryByText('创建、培养和管理数字员工，让知识、流程与工具成为可复用、可追踪的工作能力。')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'LifeYouMe 数字团队' })).toBeTruthy();
    expect(screen.getByAltText('LifeYouMe · 数字团队产品界面预览')).toBeTruthy();
    expect(screen.queryByLabelText('账号')).toBeNull();
    expect(screen.getByRole('link', { name: '进入数字团队' }).getAttribute('href'))
      .toBe('/auth/login');
    expect(screen.getByRole('link', { name: '返回产品目录' }).getAttribute('href'))
      .toBe('https://lifeyoume.icu/#products');
    expect(screen.getByRole('button', { name: '切换语言' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'OpenBMB StaffDeck' }).className)
      .toContain('min-h-[44px]');
  });

  it('lets a signed-out visitor switch the public experience to English', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole('button', { name: '切换语言' }));
    await user.click(screen.getByRole('menuitem', { name: /English/ }));

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Enter Digital Team' })).toBeTruthy();
      expect(screen.getByRole('heading', { level: 1, name: 'LifeYouMe Digital Team' })).toBeTruthy();
      expect(document.documentElement.lang).toBe('en-US');
    });
    expect(window.localStorage.getItem('staffdeck_locale')).toBe('en-US');
    expect(screen.getByRole('button', { name: 'Switch language' })).toBeTruthy();
  });
});
