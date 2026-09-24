// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

const app = vi.hoisted(() => {
  const state = {
    expiresAt: null as string | null,
    revision: 0,
    writeError: null as Error | null,
    pendingWrite: null as Promise<void> | null,
  };
  return {
    state,
    api: {
      get: vi.fn(async (url: string) => {
        if (url === '/api/bootstrap') return { data: { admin: {
          id: 'admin-1', account: 'owner@example.com', name: '管理員', role: '超級管理員',
          permissions: { view: true, add: true, edit: true, delete: true },
        } } };
        if (url === '/api/dashboard') return { data: {
          todayVisitors: 0, monthVisitors: 0, totalVisitors: 0, totalUsers: 1,
          monthlyPro: 0, quarterlyPro: 0, yearlyPro: 0, expiring: 0,
          todayRevenue: 0, monthRevenue: 0, quarterRevenue: 0, yearRevenue: 0, cumulativeRevenue: 0,
          userGrowth: [], revenueGrowth: [],
        } };
        if (url.startsWith('/api/data/plans?')) return { data: { total: 1, currentPage: 1, totalPages: 1, items: [{
          id: 'plan-monthly', name: '月費方案', price: 2880, durationDays: 30,
        }] } };
        if (url.startsWith('/api/data/subscriptions?')) return { data: { total: 1, currentPage: 1, totalPages: 1, items: [{
          id: 'member-1', authUserId: 'auth-1', lineDisplayName: '測試會員', status: 'active',
          currentPlanId: 'plan-monthly', planName: '月費方案', planStartedAt: null,
          planExpiresAt: state.expiresAt, subscriptionRevision: state.revision, isLifetime: false, autoRenew: false,
        }] } };
        return { data: { items: [] } };
      }),
      put: vi.fn(async (url: string, payload: { action: string; expiresAt?: string; expectedRevision?: number }) => {
        if (url !== '/api/subscriptions/member-1' || payload.action !== 'adjustExpiry') {
          throw new Error('Unexpected write');
        }
        if (state.pendingWrite) await state.pendingWrite;
        if (state.writeError) throw state.writeError;
        if (payload.expectedRevision !== state.revision) throw new Error('SUBSCRIPTION_CONFLICT');
        state.expiresAt = `${payload.expiresAt}T00:00:00Z`;
        state.revision += 1;
        return { data: { id: 'member-1', planExpiresAt: state.expiresAt } };
      }),
      post: vi.fn(), delete: vi.fn(),
    },
    auth: { signIn: vi.fn(), signOut: vi.fn() },
  };
});

vi.mock('./admin-platform-client', () => app);
import AdminApp from './AdminApp';

async function openEditor() {
  render(<AdminApp />);
  fireEvent.click(await screen.findByRole('button', { name: /訂閱管理/ }));
  const trigger = await screen.findByRole('button', { name: '調整到期日' });
  trigger.focus();
  fireEvent.click(trigger);
  return screen.getByRole('dialog');
}

function setDate(editor: HTMLElement, value = '2026-09-11') {
  fireEvent.change(within(editor).getByLabelText('到期日'), { target: { value } });
}

async function confirmSave(editor: HTMLElement) {
  fireEvent.click(within(editor).getByRole('button', { name: '確認', exact: true }));
  const confirmation = await screen.findByRole('alertdialog');
  fireEvent.click(within(confirmation).getByRole('button', { name: '確認修改' }));
}

describe('subscription expiry save recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    app.state.expiresAt = null;
    app.state.revision = 0;
    app.state.writeError = null;
    app.state.pendingWrite = null;
    window.history.replaceState(null, '', '/');
  });

  it('opens a native modal and returns focus to the edit control after Escape', async () => {
    const editor = await openEditor();
    expect(editor.tagName).toBe('DIALOG');
    expect((editor as HTMLDialogElement).open).toBe(true);
    expect(document.activeElement).toBe(within(editor).getByRole('button', { name: '取消' }));
    fireEvent(editor, new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '調整到期日' }));
    expect(app.api.put).not.toHaveBeenCalled();
  });

  it('keeps an empty date editable and explains the correction before confirmation or a write', async () => {
    const editor = await openEditor();
    fireEvent.click(within(editor).getByRole('button', { name: '確認', exact: true }));

    const field = within(editor).getByLabelText('到期日');
    expect(within(editor).getByRole('alert').textContent).toContain('請選擇到期日');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toBe(within(editor).getByRole('alert').id);
    expect(document.activeElement).toBe(field);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(app.api.put).not.toHaveBeenCalled();
  });

  it('opens the expiry editor on the Taiwan calendar day across UTC midnight', async () => {
    app.state.expiresAt = '2026-09-11T20:30:00Z';
    const editor = await openEditor();
    expect((within(editor).getByLabelText('到期日') as HTMLInputElement).value).toBe('2026-09-12');
  });

  it('preserves the entered date after a failed write and closes only after an explicit successful retry', async () => {
    app.state.writeError = new Error('Request failed with status code 503');
    const editor = await openEditor();
    setDate(editor);
    await confirmSave(editor);

    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toContain('訂閱更新失敗'));
    expect((within(editor).getByLabelText('到期日') as HTMLInputElement).value).toBe('2026-09-11');
    expect(app.api.put).toHaveBeenCalledTimes(1);
    expect(app.api.put).toHaveBeenCalledWith('/api/subscriptions/member-1', {
      action: 'adjustExpiry', expiresAt: '2026-09-11', expectedRevision: 0,
    });
    expect(screen.queryByText('2026/09/11 08:00')).toBeNull();

    app.state.writeError = null;
    await confirmSave(editor);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('2026/09/11 08:00')).toBeTruthy();
    expect(app.api.put).toHaveBeenCalledTimes(2);
  });

  it('refreshes a saved subscription without rereading unrelated plan pages, then refreshes plans on a new visit', async () => {
    const editor = await openEditor();
    await waitFor(() => expect(app.api.get.mock.calls.filter(([url]) => url.startsWith('/api/data/plans?'))).toHaveLength(1));
    setDate(editor);
    await confirmSave(editor);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(app.api.get.mock.calls.filter(([url]) => url.startsWith('/api/data/plans?'))).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /營運概覽/ }));
    fireEvent.click(screen.getByRole('button', { name: /訂閱管理/ }));
    await waitFor(() => expect(app.api.get.mock.calls.filter(([url]) => url.startsWith('/api/data/plans?'))).toHaveLength(2));
  });

  it('keeps the other administrator’s expiry and explains a stale edit conflict', async () => {
    const editor = await openEditor();
    app.state.revision = 1;
    app.state.expiresAt = '2026-12-01T00:00:00Z';
    setDate(editor, '2026-12-20');
    await confirmSave(editor);

    await waitFor(() => expect(within(editor).getByRole('alert').textContent).toContain('重新開啟'));
    expect(app.state.expiresAt).toBe('2026-12-01T00:00:00Z');
    expect(app.api.put).toHaveBeenCalledWith('/api/subscriptions/member-1', {
      action: 'adjustExpiry', expiresAt: '2026-12-20', expectedRevision: 0,
    });
    expect(screen.getByRole('dialog')).toBe(editor);

    fireEvent.click(within(editor).getByRole('button', { name: '取消' }));
    expect(await screen.findByText('2026/12/01 08:00')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '調整到期日' }));
    const updatedEditor = screen.getByRole('dialog');
    setDate(updatedEditor, '2026-12-20');
    await confirmSave(updatedEditor);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(app.api.put).toHaveBeenLastCalledWith('/api/subscriptions/member-1', {
      action: 'adjustExpiry', expiresAt: '2026-12-20', expectedRevision: 1,
    });
  });

  it('keeps the draft without writing when the administrator cancels confirmation', async () => {
    const editor = await openEditor();
    setDate(editor);
    fireEvent.click(within(editor).getByRole('button', { name: '確認', exact: true }));
    const confirmation = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmation).getByRole('button', { name: '取消' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByRole('dialog')).toBe(editor);
    expect((within(editor).getByLabelText('到期日') as HTMLInputElement).value).toBe('2026-09-11');
    expect((within(editor).getByRole('button', { name: '確認', exact: true }) as HTMLButtonElement).disabled).toBe(false);
    expect(app.api.put).not.toHaveBeenCalled();
  });

  it('prevents duplicate submissions and draft changes while a save is in progress', async () => {
    let finish!: () => void;
    app.state.pendingWrite = new Promise<void>((resolve) => { finish = resolve; });
    const editor = await openEditor();
    setDate(editor);
    await confirmSave(editor);

    await waitFor(() => expect(app.api.put).toHaveBeenCalledTimes(1));
    const save = within(editor).getByRole('button', { name: '確認', exact: true }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect((within(editor).getByLabelText('到期日') as HTMLInputElement).disabled).toBe(true);
    expect((within(editor).getByRole('button', { name: '取消' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(save);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(app.api.put).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('2026/09/11 08:00')).toBeTruthy();
  });
});
