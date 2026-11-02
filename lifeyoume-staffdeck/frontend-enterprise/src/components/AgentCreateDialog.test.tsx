// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '@/i18n';

import AgentCreateDialog, { type AgentCreateFormState } from './AgentCreateDialog';

const INITIAL_FORM: AgentCreateFormState = {
  name: '',
  description: '',
  roleName: '',
  sourceMode: 'copy',
  copyFromAgentId: 'agent_source',
};

describe('AgentCreateDialog', () => {
  afterEach(cleanup);

  function renderDialog(props: Partial<Parameters<typeof AgentCreateDialog>[0]> = {}) {
    const defaultProps: Parameters<typeof AgentCreateDialog>[0] = {
      form: INITIAL_FORM,
      isAdmin: true,
      sourceAgents: [],
      onFormChange: vi.fn(),
      onClose: vi.fn(),
      onCreate: vi.fn(),
    };
    return render(
      <I18nProvider>
        <AgentCreateDialog {...defaultProps} {...props} />
      </I18nProvider>,
    );
  }

  it('keeps blank creation and submission available behind the lazy boundary', async () => {
    const onClose = vi.fn();
    const onCreate = vi.fn();
    const onFormChange = vi.fn();
    const user = userEvent.setup();

    renderDialog({ onFormChange, onClose, onCreate });

    expect(screen.getByRole('heading', { name: '新建数字员工' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '从空白开始' }));
    expect(onFormChange).toHaveBeenCalledOnce();

    const updater = onFormChange.mock.calls[0][0];
    expect(updater(INITIAL_FORM)).toEqual({
      ...INITIAL_FORM,
      sourceMode: 'blank',
      copyFromAgentId: '',
    });

    await user.click(screen.getByRole('button', { name: '创建' }));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it('closes from both the cancel button and dialog open-state callback', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderDialog({ isAdmin: false, onClose });

    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
