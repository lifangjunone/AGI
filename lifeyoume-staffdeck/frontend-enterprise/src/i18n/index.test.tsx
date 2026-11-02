// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { I18nProvider, useI18n } from './index';

function TranslationProbe() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div>
      <span>{locale}</span>
      <span>{t('新建数字员工')}</span>
      <button type="button" onClick={() => void setLocale('en-US')}>
        English
      </button>
    </div>
  );
}

describe('I18nProvider lazy English catalog', () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.documentElement.lang = 'zh-CN';
  });

  it('loads the English catalog before activating English', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <TranslationProbe />
      </I18nProvider>,
    );

    expect(screen.getByText('zh-CN')).toBeTruthy();
    expect(screen.getByText('新建数字员工')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'English' }));

    await waitFor(() => {
      expect(screen.getByText('en-US')).toBeTruthy();
      expect(screen.getByText('New Digital Employee')).toBeTruthy();
    });
  });
});
