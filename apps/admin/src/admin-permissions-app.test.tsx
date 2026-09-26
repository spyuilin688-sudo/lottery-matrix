// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const app = vi.hoisted(() => {
  const state = {
    admin: {
      id: 'admin-1',
      account: 'owner@example.com',
      name: '超級管理員',
      role: '超級管理員',
      permissions: { view: true, add: true, edit: true, delete: true },
    } as Record<string, unknown>,
    adminRows: null as Array<Record<string, unknown>> | null,
    failPaymentRead: false,
    memberStatus: 'active',
    memberRows: null as Array<{ id: string; memberDisplayName: string; status: string }> | null,
    transferRequests: [] as Array<{ id: string; status: string; amount: number }>,
    activationCodeRows: null as Array<{ id: string; code: string; status: string; redeemedAt: string | null; redeemedByLineDisplayName: string | null }> | null,
    nextSubscriptionRead: null as Promise<{ data: { items: Array<{ id: string; status: string }> } }> | null,
    permissionSettings: {
      subscriptionPurchaseVisible: true,
      registeredMemberFreeAccess: false,
      revision: 7,
      updatedAt: '2026-09-10T08:00:00.000Z',
    },
  };
  const otherAdmin = {
    id: 'admin-2',
    revision: 7,
    account: 'other@example.com',
    name: '其他管理員',
    role: '營運管理員',
    status: '啟用',
    permissions: { view: true, add: false, edit: true, delete: false },
    lastLoginAt: null,
  };
  const dashboard = {
    todayVisitors: 0,
    monthVisitors: 0,
    totalVisitors: 0,
    totalUsers: 0,
    monthlyPro: 0,
    quarterlyPro: 0,
    yearlyPro: 0,
    expiring: 0,
    todayRevenue: 0,
    monthRevenue: 0,
    quarterRevenue: 0,
    yearRevenue: 0,
    cumulativeRevenue: 0,
    userGrowth: [],
    revenueGrowth: [],
  };
  const get = vi.fn(async (url: string) => {
    const path = url.split("?")[0];
    if (url === '/api/bootstrap') return {
      data: {
        admin: state.admin,
      },
    };
    if (url === '/api/dashboard') return { data: dashboard };
    if (url === '/api/system-status') return { data: {
      checkedAt: '2026-09-18T10:00:00.000Z',
      items: [{
        id: 'supabase-health', name: 'Supabase 主機連線', description: '測試', group: '系統',
        location: 'Supabase', endpoint: '/health', checkMode: 'live', checkEvidence: 'live',
        ok: true, healthState: 'healthy', checkedAt: '2026-09-18T10:00:00.000Z', responseMs: 12, detail: {},
      }],
    } };
    if (url === '/api/permission-settings') return { data: state.permissionSettings };
    if (path === '/api/data/admins') return { data: { items: state.adminRows ?? [otherAdmin], total: 37, currentPage: 1, totalPages: 2 } };
    if (url.startsWith('/api/data/users?')) {
      const items = state.memberRows ?? [{ id: 'member-1', memberDisplayName: '測試會員', status: state.memberStatus }];
      return { data: { items, total: items.length, currentPage: 1, totalPages: 1 } };
    }
    if (url.startsWith('/api/data/subscriptions?')) {
      if (state.nextSubscriptionRead) {
        const pending = state.nextSubscriptionRead;
        state.nextSubscriptionRead = null;
        return pending;
      }
      return { data: { items: [{ id: 'member-1', status: 'active' }], total: 1, currentPage: 1, totalPages: 1 } };
    }
    if (path === '/api/data/subscriptionRecords') {
      if (state.failPaymentRead) throw new Error('payment offline');
      return { data: { items: [{
      id: 'payment-1', memberId: 'member-1', lineDisplayName: '王小明', planId: 'plan-1',
      planName: '月費方案', amount: 2880, paidAt: '2026-09-01T02:00:00Z', status: 'confirmed',
      }], total: 1, currentPage: 1, totalPages: 1 } };
    }
    if (path === '/api/data/transferRequests') return { data: { items: state.transferRequests, total: state.transferRequests.length, currentPage: 1, totalPages: 1 } };
    if (path === '/api/data/plans') return { data: { items: [], total: 0, currentPage: 1, totalPages: 1 } };
    if (path === '/api/data/activationCodes') {
      const items = state.activationCodeRows ?? [
      { id: 'code-1', code: 'ABCD-EFGH-IJKL-MNOP', status: 'unused', redeemedAt: null, redeemedByLineDisplayName: null },
      { id: 'code-2', code: 'QRST-UVWX-YZ12-3456', status: 'used', redeemedAt: '2026-09-05T01:00:00Z', redeemedByLineDisplayName: '兌換者' },
      ];
      return { data: { items, total: items.length, currentPage: 1, totalPages: 1 } };
    }
    if (path === '/api/data/privateActivationCodes') {
      return { data: { items: [
        { id: 'secret-code', code: 'SECR-ET00-0000-0001', status: 'unused', redeemedAt: null, redeemedByLineDisplayName: null },
      ], total: 1, currentPage: 1, totalPages: 1 } };
    }
    return { data: { items: [], total: 0, currentPage: 1, totalPages: 1 } };
  });
  return {
    state,
    api: {
      get,
      post: vi.fn(async () => ({ data: {} })),
      put: vi.fn(async () => ({ data: {} })),
      delete: vi.fn(async () => ({ data: {} })),
    },
    auth: { signIn: vi.fn(), signOut: vi.fn() },
  };
});

vi.mock('./admin-platform-client', () => app);

import AdminApp from './AdminApp';

async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

function buttonWithText(container: HTMLElement, label: string) {
  return [...container.querySelectorAll('button')].find((button) => button.textContent?.includes(label));
}

function subscriptionTab(container: HTMLElement, name: '訂閱會員' | '付款紀錄' | '轉帳申請') {
  return within(container).getByRole('tab', { name });
}

describe('administrator operation permission editing', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    app.state.admin = {
      id: 'admin-1',
      account: 'owner@example.com',
      name: '超級管理員',
      role: '超級管理員',
      permissions: { view: true, add: true, edit: true, delete: true },
    };
    app.state.failPaymentRead = false;
    app.state.adminRows = null;
    app.state.memberStatus = 'active';
    app.state.memberRows = null;
    app.state.transferRequests = [];
    app.state.activationCodeRows = null;
    app.state.nextSubscriptionRead = null;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) },
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it.each(['超級管理員', '營運管理員', '查看人員'])('opens architecture subscriptions using system-settings view permission for %s without reading system health', async role => {
    app.state.admin = { ...app.state.admin, role, modulePermissions: { systemSettings: { view: true, edit: false } } };
    await act(async () => root.render(<AdminApp />));
    await settle();
    expect(buttonWithText(container, '架構總彙')).toBeTruthy();
    expect(app.api.get).not.toHaveBeenCalledWith('/api/architecture-overview');
    await act(async () => buttonWithText(container, '架構總彙')?.click());
    await settle();
    await waitFor(() => expect(within(container).getAllByRole('article')).toHaveLength(4));
    expect(app.api.get.mock.calls.filter(([url]) => url === '/api/architecture-overview')).toHaveLength(1);
    expect(app.api.get).not.toHaveBeenCalledWith('/api/system-status');
  });

  it('hides architecture subscriptions without view permission', async () => {
    app.state.admin = { ...app.state.admin, role: '查看人員', permissions: { view: false } };
    await act(async () => root.render(<AdminApp />));
    await settle();
    expect(buttonWithText(container, '架構總彙')).toBeUndefined();
    expect(app.api.get).not.toHaveBeenCalledWith('/api/architecture-overview');
  });

  it('opens transfer requests from a notification on cold start', async () => {
    window.history.replaceState(null, '', '/#transfer-requests');
    try {
      await act(async () => root.render(<AdminApp />));
      await settle();
      expect(container.querySelector('#transfer-requests')).not.toBeNull();
      expect(container.querySelector('[aria-label="新轉帳手機通知"]')).not.toBeNull();
      expect(subscriptionTab(container, '轉帳申請').getAttribute('aria-selected')).toBe('true');
      expect(app.api.get).toHaveBeenCalledWith(expect.stringContaining('/api/data/transferRequests?page=1&'), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    } finally { window.history.replaceState(null, '', '/'); }
  });

  it('opens transfer requests on a notification hash change in an existing tab', async () => {
    await act(async () => root.render(<AdminApp />));
    await settle();
    try {
      await act(async () => {
        window.history.replaceState(null, '', '/#transfer-requests');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
      await settle();
      expect(container.querySelector('#transfer-requests')).not.toBeNull();
      expect(subscriptionTab(container, '轉帳申請').getAttribute('aria-selected')).toBe('true');
    } finally { window.history.replaceState(null, '', '/'); }
  });

  it('loads payment history and records a confirmed reversal through the shared dialog', async () => {
    await act(async () => root.render(<AdminApp />));
    await settle();
    await act(async () => buttonWithText(container, '訂閱管理')?.click());
    await settle();

    expect(subscriptionTab(container, '訂閱會員').getAttribute('aria-selected')).toBe('true');
    await act(async () => subscriptionTab(container, '付款紀錄').click());

    await waitFor(() => expect(app.api.get).toHaveBeenCalledWith(expect.stringContaining('/api/data/subscriptionRecords?page=1&'), expect.objectContaining({ signal: expect.any(AbortSignal) })));
    await waitFor(() => expect(container.querySelector('[aria-label="記錄沖銷 payment-1"]')).not.toBeNull());
    const open = container.querySelector<HTMLButtonElement>('[aria-label="記錄沖銷 payment-1"]');
    await act(async () => open?.click());
    const reason = container.querySelector<HTMLTextAreaElement>('[aria-label="沖銷原因"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(reason, '銀行退款已完成');
      reason?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => buttonWithText(container, '記錄已完成沖銷')?.click());
    const dialog = container.querySelector<HTMLElement>('[role="alertdialog"]');
    expect(dialog?.textContent).toContain('此操作只記錄外部已完成的款項沖銷');
    expect(dialog?.textContent).toContain('方案與效期會依剩餘有效付款重新計算');
    await act(async () => buttonWithText(dialog as HTMLElement, '記錄已退款')?.click());
    await settle();

    expect(app.api.put).toHaveBeenCalledWith('/api/payments/payment-1/reversal', {
      status: 'refunded', reason: '銀行退款已完成',
    });
    expect(app.api.get).toHaveBeenCalledWith(expect.stringContaining('/api/data/subscriptions?page=1&'), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(container.querySelector('[role="status"]')?.textContent).toContain('付款紀錄已更新');
    expect(container.querySelector('[role="status"]')?.textContent).toContain('會員訂閱清單將於開啟時重新載入');
    expect(app.api.get.mock.calls.filter(([url]) => String(url).startsWith('/api/data/subscriptions?'))).toHaveLength(1);
    await act(async () => subscriptionTab(container, '訂閱會員').click());
    await waitFor(() => expect(app.api.get.mock.calls.filter(([url]) => String(url).startsWith('/api/data/subscriptions?'))).toHaveLength(2));
  });

  it('switches among three subscription tabs without mixing their controls', async () => {
    await act(async () => root.render(<AdminApp />));
    await settle();
    await act(async () => buttonWithText(container, '訂閱管理')?.click());
    await settle();

    expect(subscriptionTab(container, '訂閱會員').getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[aria-label="篩選訂閱方案"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="記錄沖銷 payment-1"]')).toBeNull();
    await act(async () => fireEvent.change(container.querySelector('[aria-label="篩選訂閱方案"]')!, { target: { value: 'monthly' } }));
    await act(async () => fireEvent.keyDown(subscriptionTab(container, '訂閱會員'), { key: 'ArrowRight' }));
    await waitFor(() => expect(container.querySelector('[aria-label="記錄沖銷 payment-1"]')).not.toBeNull());
    expect(document.activeElement).toBe(subscriptionTab(container, '付款紀錄'));
    expect(subscriptionTab(container, '付款紀錄').getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[aria-label="篩選訂閱方案"]')).toBeNull();
    expect(container.querySelector('[aria-label="記錄沖銷 payment-1"]')).not.toBeNull();
    await act(async () => subscriptionTab(container, '轉帳申請').click());
    expect(subscriptionTab(container, '轉帳申請').getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('.transferPanel')).not.toBeNull();
    expect(container.querySelector('[aria-label="記錄沖銷 payment-1"]')).toBeNull();
    await act(async () => subscriptionTab(container, '訂閱會員').click());
    expect(container.querySelector<HTMLSelectElement>('[aria-label="篩選訂閱方案"]')?.value).toBe('monthly');
  });

  it('allows an operations admin to read payments but not record reversals', async () => {
    app.state.admin = { ...app.state.admin, role: '營運管理員', modulePermissions: { subscriptions: { view: true, edit: true } } };
    await act(async () => root.render(<AdminApp />));
    await settle();
    await act(async () => buttonWithText(container, '訂閱管理')?.click());
    await settle();
    await act(async () => subscriptionTab(container, '付款紀錄').click());
    await waitFor(() => expect(container.textContent).toContain('王小明'));
    expect(container.querySelector('[aria-label="記錄沖銷 payment-1"]')).toBeNull();
  });

  it('shows a payment read error instead of false empty or stale actions and recovers inline', async () => {
    app.state.failPaymentRead = true;
    await act(async () => root.render(<AdminApp />));
    await settle();
    await act(async () => buttonWithText(container, '訂閱管理')?.click());
    await settle();
    await act(async () => subscriptionTab(container, '付款紀錄').click());

    await waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain('付款紀錄載入失敗'));
    expect(container.textContent).not.toContain('目前沒有付款紀錄');
    expect(container.querySelector('[aria-label="記錄沖銷 payment-1"]')).toBeNull();

    app.state.failPaymentRead = false;
    await act(async () => buttonWithText(container, '重新載入付款紀錄')?.click());
    await settle();
    expect(container.querySelector('[aria-label="記錄沖銷 payment-1"]')).not.toBeNull();
  });

  it('does not let an old subscription failure erase newer payment rows after navigation and re-entry', async () => {
    let rejectOldRead!: (reason: Error) => void;
    app.state.nextSubscriptionRead = new Promise((_resolve, reject) => { rejectOldRead = reject; });
    await act(async () => root.render(<AdminApp />));
    await settle();

    await act(async () => buttonWithText(container, '訂閱管理')?.click());
    await settle();
    await act(async () => subscriptionTab(container, '付款紀錄').click());
    await act(async () => buttonWithText(container, '營運概覽')?.click());
    await settle();
    await act(async () => buttonWithText(container, '訂閱管理')?.click());
    await settle();
    await act(async () => subscriptionTab(container, '付款紀錄').click());
    await waitFor(() => expect(container.querySelector('[aria-label="記錄沖銷 payment-1"]')).not.toBeNull());

    await act(async () => rejectOldRead(new Error('old subscriptions read failed')));
    await settle();

    expect(container.querySelector('[aria-label="記錄沖銷 payment-1"]')).not.toBeNull();
    expect(container.textContent).not.toContain('付款紀錄載入失敗');
  });

  it('lets a super administrator edit and save all four permissions for another administrator', async () => {
    await act(async () => root.render(<AdminApp />));
    await settle();
    await settle();

    const permissionNavigation = buttonWithText(container, '管理員權限');
    expect(permissionNavigation).toBeDefined();
    await act(async () => permissionNavigation?.click());
    await settle();

    expect(container.textContent).toContain('37 個管理員帳號');
    const accountCell = [...container.querySelectorAll('td')]
      .find((cell) => cell.textContent === 'other@example.com');
    expect(accountCell).toBeDefined();
    const row = accountCell?.closest('tr');
    const editButton = within(row!).getByRole('button', { name: '編輯管理員 other@example.com' });
    expect(within(row!).getByRole('button', { name: '刪除管理員 other@example.com' })).toBeDefined();
    await act(async () => editButton.click());

    const checkbox = (label: string) => container.querySelector<HTMLInputElement>(
      `input[type="checkbox"][aria-label="${label}"]`,
    );
    const view = checkbox('查看');
    const add = checkbox('新增');
    const edit = checkbox('修改');
    const remove = checkbox('刪除');
    expect([view, add, edit, remove].every(Boolean)).toBe(true);
    expect(view?.checked).toBe(true);
    expect(add?.checked).toBe(false);
    expect(edit?.checked).toBe(true);
    expect(remove?.checked).toBe(false);

    await act(async () => {
      view?.click();
      add?.click();
      edit?.click();
      remove?.click();
    });
    const save = buttonWithText(container, '儲存');
    await act(async () => save?.click());
    const dialog = container.querySelector('[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    const confirm = buttonWithText(dialog as HTMLElement, '確認修改');
    await act(async () => confirm?.click());
    await settle();

    expect(app.api.put).toHaveBeenCalledWith('/api/admins/admin-2', expect.objectContaining({
      expectedRevision: 7,
      permissions: { view: false, add: true, edit: false, delete: true },
    }));
  });

  it('disables protected credentials, role, status and deletion for a different super administrator', async () => {
    app.state.adminRows = [{ id: 'protected-owner', account: 'spyuilin688@gmail.com', name: 'Owner',
      role: '超級管理員', status: '啟用', revision: 2, permissions: { view: true, add: true, edit: true, delete: true } }];
    await act(async () => root.render(<AdminApp />));
    await settle();
    await act(async () => buttonWithText(container, '管理員權限')?.click());
    await settle();
    expect(within(container).getByRole<HTMLButtonElement>('button', { name: '刪除管理員 spyuilin688@gmail.com' }).disabled).toBe(true);
    await act(async () => within(container).getByRole('button', { name: '編輯管理員 spyuilin688@gmail.com' }).click());
    for (const label of ['管理員帳號', '新密碼（留空不變）', '角色', '帳號狀態']) {
      expect((within(container).getByLabelText(label) as HTMLInputElement).disabled).toBe(true);
    }
    expect((within(container).getByLabelText('管理員名稱') as HTMLInputElement).disabled).toBe(false);
  });

  it('allows the protected owner to change their own password but keeps the identity fields locked', async () => {
    app.state.admin = { ...app.state.admin, id: 'protected-owner', account: 'spyuilin688@gmail.com' };
    app.state.adminRows = [{ id: 'protected-owner', account: 'spyuilin688@gmail.com', name: 'Owner',
      role: '超級管理員', status: '啟用', revision: 2, permissions: { view: true, add: true, edit: true, delete: true } }];
    await act(async () => root.render(<AdminApp />));
    await settle();
    await act(async () => buttonWithText(container, '管理員權限')?.click());
    await settle();
    await act(async () => within(container).getByRole('button', { name: '編輯管理員 spyuilin688@gmail.com' }).click());
    expect((within(container).getByLabelText('新密碼（留空不變）') as HTMLInputElement).disabled).toBe(false);
    for (const label of ['管理員帳號', '角色', '帳號狀態']) {
      expect((within(container).getByLabelText(label) as HTMLInputElement).disabled).toBe(true);
    }
  });

  it('retains the edit draft and shows a conflict without silently retrying stale permissions', async () => {
    await act(async () => root.render(<AdminApp />));
    await settle();
    await act(async () => buttonWithText(container, '管理員權限')?.click());
    await settle();
    await act(async () => within(container).getByRole('button', { name: '編輯管理員 other@example.com' }).click());
    await act(async () => fireEvent.change(within(container).getByLabelText('管理員名稱'), { target: { value: '新名稱' } }));
    app.api.put.mockRejectedValueOnce(new Error('管理員資料已變更，請取消編輯並重新載入後再試'));
    await act(async () => within(container).getByRole('button', { name: '儲存' }).click());
    await act(async () => within(within(container).getByRole('alertdialog')).getByRole('button', { name: '確認修改' }).click());
    await settle();
    expect(container.textContent).toContain('管理員資料已變更，請取消編輯並重新載入後再試');
    expect((within(container).getByLabelText('管理員名稱') as HTMLInputElement).value).toBe('新名稱');
    expect(app.api.put).toHaveBeenCalledTimes(1);
    expect(app.api.put).toHaveBeenCalledWith('/api/admins/admin-2', expect.objectContaining({ expectedRevision: 7 }));
  });

  it('opens confirmation as a native modal, focuses cancel, and restores focus after Escape', async () => {
    await act(async () => root.render(<AdminApp />));
    await settle();
    await act(async () => buttonWithText(container, '管理員權限')?.click());
    await settle();
    const trigger = within(container).getByRole('button', { name: '刪除管理員 other@example.com' });
    trigger.focus();
    await act(async () => trigger.click());
    const dialog = within(container).getByRole('alertdialog');
    expect(dialog.tagName).toBe('DIALOG');
    expect((dialog as HTMLDialogElement).open).toBe(true);
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: '取消' }));
    await act(async () => fireEvent(dialog, new Event('cancel', { cancelable: true })));
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(app.api.delete).not.toHaveBeenCalled();
  });

  it('shows own-name update failures inside the keyboard-safe edit dialog and preserves the draft', async () => {
    await act(async () => root.render(<AdminApp />));
    await settle();
    const trigger = within(container).getByRole('button', { name: '超級管理員' });
    trigger.focus();
    await act(async () => trigger.click());
    const editor = within(container).getByRole('dialog');
    expect(editor.tagName).toBe('DIALOG');
    expect((editor as HTMLDialogElement).open).toBe(true);
    const input = within(editor).getByLabelText('管理員名稱') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    await act(async () => fireEvent.change(input, { target: { value: '新的管理員名稱' } }));
    app.api.put.mockRejectedValueOnce(new Error('網路斷線'));
    await act(async () => within(editor).getByRole('button', { name: '儲存' }).click());
    await act(async () => within(within(container).getByRole('alertdialog')).getByRole('button', { name: '確認修改' }).click());
    await waitFor(() => expect(within(editor).getByRole('alert').textContent).toContain('網路斷線'));
    expect(input.value).toBe('新的管理員名稱');
    expect(container.querySelector('.content > .error')).toBeNull();
    await act(async () => fireEvent(editor, new Event('cancel', { cancelable: true })));
    expect(within(container).queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps the own-name dialog open while its update is in progress', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    app.api.put.mockImplementationOnce(async () => { await pending; return { data: { admin: { name: '新的管理員名稱' } } }; });
    await act(async () => root.render(<AdminApp />));
    await settle();
    await act(async () => within(container).getByRole('button', { name: '超級管理員' }).click());
    const editor = within(container).getByRole('dialog');
    await act(async () => fireEvent.change(within(editor).getByLabelText('管理員名稱'), { target: { value: '新的管理員名稱' } }));
    await act(async () => within(editor).getByRole('button', { name: '儲存' }).click());
    await act(async () => within(within(container).getByRole('alertdialog')).getByRole('button', { name: '確認修改' }).click());
    await waitFor(() => expect(app.api.put).toHaveBeenCalledTimes(1));
    expect((within(editor).getByRole('button', { name: '儲存' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(editor).getByRole('button', { name: '取消' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => fireEvent(editor, new Event('cancel', { cancelable: true })));
    expect(within(container).getByRole('dialog')).toBe(editor);
    await act(async () => release());
    await waitFor(() => expect(within(container).queryByRole('dialog')).toBeNull());
    expect(within(container).getByRole('button', { name: '新的管理員名稱' })).toBeDefined();
  });

  it('blocks a duplicate member status write until the pending attempt ends', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    app.api.put.mockImplementationOnce(async () => { await pending; throw new Error('暫時無法更新'); });
    await act(async () => root.render(<AdminApp />));
    await settle();
    await act(async () => buttonWithText(container, '用戶管理')?.click());
    await settle();
    const trigger = within(container).getByRole('button', { name: '停權' });
    await act(async () => trigger.click());
    await act(async () => within(within(container).getByRole('alertdialog')).getByRole('button', { name: '確認停權' }).click());
    await waitFor(() => expect(app.api.put).toHaveBeenCalledTimes(1));
    expect((trigger as HTMLButtonElement).disabled).toBe(true);
    await act(async () => trigger.click());
    expect(within(container).queryByRole('alertdialog')).toBeNull();
    expect(app.api.put).toHaveBeenCalledTimes(1);
    await act(async () => release());
    await waitFor(() => expect((trigger as HTMLButtonElement).disabled).toBe(false));
  });

  it('waits for a member status write before allowing another member status write', async () => {
    app.state.memberRows = [
      { id: 'member-1', memberDisplayName: '甲會員', status: 'active' },
      { id: 'member-2', memberDisplayName: '乙會員', status: 'active' },
    ];
    let release!: () => void;
    app.api.put.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => { release = resolve; });
      return { data: {} };
    });
    await act(async () => root.render(<AdminApp />));
    await settle();
    await act(async () => buttonWithText(container, '用戶管理')?.click());
    await settle();
    const rows = [...container.querySelectorAll('tbody tr')];
    const first = within(rows[0]).getByRole('button', { name: '停權' });
    const second = within(rows[1]).getByRole('button', { name: '停權' });
    const userReads = () => app.api.get.mock.calls.filter(([url]) => String(url).startsWith('/api/data/users?')).length;
    const initialReads = userReads();
    await act(async () => first.click());
    await act(async () => within(within(container).getByRole('alertdialog')).getByRole('button', { name: '確認停權' }).click());
    await waitFor(() => expect(app.api.put).toHaveBeenCalledTimes(1));
    expect((second as HTMLButtonElement).disabled).toBe(true);
    await act(async () => second.click());
    expect(app.api.put).toHaveBeenCalledTimes(1);
    expect(within(container).queryByRole('alertdialog')).toBeNull();
    await act(async () => release());
    await waitFor(() => expect((within([...container.querySelectorAll('tbody tr')][1]).getByRole('button', { name: '停權' }) as HTMLButtonElement).disabled).toBe(false));
    await act(async () => within([...container.querySelectorAll('tbody tr')][1]).getByRole('button', { name: '停權' }).click());
    await act(async () => within(within(container).getByRole('alertdialog')).getByRole('button', { name: '確認停權' }).click());
    expect(app.api.put).toHaveBeenCalledWith('/api/members/member-2/status', { status: 'disabled' });
    expect(app.api.put).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(userReads()).toBeGreaterThanOrEqual(initialReads + 2));
  });

  it('blocks both decisions for one transfer during a pending review', async () => {
    app.state.transferRequests = [{ id: 'transfer-1', status: 'pending', amount: 2880 }];
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    app.api.put.mockImplementationOnce(async () => { await pending; return { data: {} }; });
    await act(async () => root.render(<AdminApp />));
    await settle();
    await act(async () => buttonWithText(container, '訂閱管理')?.click());
    await settle();
    await act(async () => subscriptionTab(container, '轉帳申請').click());
    await settle();
    const row = container.querySelector<HTMLElement>('.transferRow')!;
    const approve = within(row).getByRole('button', { name: '確認' });
    const reject = within(row).getByRole('button', { name: '拒絕' });
    await act(async () => approve.click());
    await act(async () => within(within(container).getByRole('alertdialog')).getByRole('button', { name: '確認通過' }).click());
    await waitFor(() => expect(app.api.put).toHaveBeenCalledTimes(1));
    expect((approve as HTMLButtonElement).disabled).toBe(true);
    expect((reject as HTMLButtonElement).disabled).toBe(true);
    await act(async () => reject.click());
    expect(within(container).queryByRole('alertdialog')).toBeNull();
    expect(app.api.put).toHaveBeenCalledTimes(1);
    await act(async () => release());
    await waitFor(() => expect((within(container.querySelector<HTMLElement>('.transferRow')!).getByRole('button', { name: '確認' }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('waits for a transfer decision before allowing another transfer decision', async () => {
    app.state.transferRequests = [
      { id: 'transfer-1', status: 'pending', amount: 2880 },
      { id: 'transfer-2', status: 'pending', amount: 2880 },
    ];
    let release!: () => void;
    app.api.put.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => { release = resolve; });
      return { data: {} };
    });
    await act(async () => root.render(<AdminApp />));
    await settle();
    await act(async () => buttonWithText(container, '訂閱管理')?.click());
    await settle();
    await act(async () => subscriptionTab(container, '轉帳申請').click());
    await settle();
    const rows = [...container.querySelectorAll<HTMLElement>('.transferRow')];
    const transferReads = () => app.api.get.mock.calls.filter(([url]) => String(url).startsWith('/api/data/transferRequests?')).length;
    const initialReads = transferReads();
    await act(async () => within(rows[0]).getByRole('button', { name: '確認' }).click());
    await act(async () => within(within(container).getByRole('alertdialog')).getByRole('button', { name: '確認通過' }).click());
    await waitFor(() => expect(app.api.put).toHaveBeenCalledTimes(1));
    expect((within(rows[1]).getByRole('button', { name: '確認' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(rows[1]).getByRole('button', { name: '拒絕' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => within(rows[1]).getByRole('button', { name: '拒絕' }).click());
    expect(app.api.put).toHaveBeenCalledTimes(1);
    expect(within(container).queryByRole('alertdialog')).toBeNull();
    await act(async () => release());
    await waitFor(() => expect((within([...container.querySelectorAll<HTMLElement>('.transferRow')][1]).getByRole('button', { name: '拒絕' }) as HTMLButtonElement).disabled).toBe(false));
    await act(async () => within([...container.querySelectorAll<HTMLElement>('.transferRow')][1]).getByRole('button', { name: '拒絕' }).click());
    await act(async () => within(within(container).getByRole('alertdialog')).getByRole('button', { name: '確認拒絕' }).click());
    expect(app.api.put).toHaveBeenCalledWith('/api/transfer-requests/transfer-2', { decision: 'rejected' });
    expect(app.api.put).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(transferReads()).toBeGreaterThanOrEqual(initialReads + 2));
  });

  it('blocks a duplicate activation-code deletion until the pending attempt ends', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    app.api.delete.mockImplementationOnce(async () => { await pending; throw new Error('刪除失敗'); });
    await act(async () => root.render(<AdminApp />));
    await settle();
    await act(async () => buttonWithText(container, '啟動碼管理')?.click());
    await settle();
    const trigger = within(container).getByRole('button', { name: '刪除啟動碼 ABCD-EFGH-IJKL-MNOP' });
    await act(async () => trigger.click());
    await act(async () => within(within(container).getByRole('alertdialog')).getByRole('button', { name: '確認刪除' }).click());
    await waitFor(() => expect(app.api.delete).toHaveBeenCalledTimes(1));
    expect((trigger as HTMLButtonElement).disabled).toBe(true);
    await act(async () => trigger.click());
    expect(within(container).queryByRole('alertdialog')).toBeNull();
    expect(app.api.delete).toHaveBeenCalledTimes(1);
    await act(async () => release());
    await waitFor(() => expect((trigger as HTMLButtonElement).disabled).toBe(false));
  });

  it('waits for an activation-code deletion before allowing another code deletion', async () => {
    app.state.activationCodeRows = [
      { id: 'code-1', code: 'ABCD-EFGH-IJKL-MNOP', status: 'unused', redeemedAt: null, redeemedByLineDisplayName: null },
      { id: 'code-2', code: 'QRST-UVWX-YZ12-3456', status: 'unused', redeemedAt: null, redeemedByLineDisplayName: null },
    ];
    let release!: () => void;
    app.api.delete.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => { release = resolve; });
      return { data: {} };
    });
    await act(async () => root.render(<AdminApp />));
    await settle();
    await act(async () => buttonWithText(container, '啟動碼管理')?.click());
    await settle();
    const first = within(container).getByRole('button', { name: '刪除啟動碼 ABCD-EFGH-IJKL-MNOP' });
    const second = within(container).getByRole('button', { name: '刪除啟動碼 QRST-UVWX-YZ12-3456' });
    const codeReads = () => app.api.get.mock.calls.filter(([url]) => String(url).startsWith('/api/data/activationCodes?')).length;
    const initialReads = codeReads();
    await act(async () => first.click());
    await act(async () => within(within(container).getByRole('alertdialog')).getByRole('button', { name: '確認刪除' }).click());
    await waitFor(() => expect(app.api.delete).toHaveBeenCalledTimes(1));
    expect((second as HTMLButtonElement).disabled).toBe(true);
    await act(async () => second.click());
    expect(app.api.delete).toHaveBeenCalledTimes(1);
    expect(within(container).queryByRole('alertdialog')).toBeNull();
    await act(async () => release());
    await waitFor(() => expect((within(container).getByRole('button', { name: '刪除啟動碼 QRST-UVWX-YZ12-3456' }) as HTMLButtonElement).disabled).toBe(false));
    await act(async () => within(container).getByRole('button', { name: '刪除啟動碼 QRST-UVWX-YZ12-3456' }).click());
    await act(async () => within(within(container).getByRole('alertdialog')).getByRole('button', { name: '確認刪除' }).click());
    expect(app.api.delete).toHaveBeenCalledWith('/api/activation-codes/code-2');
    expect(app.api.delete).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(codeReads()).toBeGreaterThanOrEqual(initialReads + 2));
  });

  it('allows a member status write while an activation-code deletion is pending', async () => {
    let release!: () => void;
    app.api.delete.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => { release = resolve; });
      return { data: {} };
    });
    await act(async () => root.render(<AdminApp />));
    await settle();
    await act(async () => buttonWithText(container, '啟動碼管理')?.click());
    await settle();
    await act(async () => within(container).getByRole('button', { name: '刪除啟動碼 ABCD-EFGH-IJKL-MNOP' }).click());
    await act(async () => within(within(container).getByRole('alertdialog')).getByRole('button', { name: '確認刪除' }).click());
    await waitFor(() => expect(app.api.delete).toHaveBeenCalledTimes(1));
    await act(async () => buttonWithText(container, '用戶管理')?.click());
    await settle();
    await act(async () => within(container).getByRole('button', { name: '停權' }).click());
    await act(async () => within(within(container).getByRole('alertdialog')).getByRole('button', { name: '確認停權' }).click());
    expect(app.api.put).toHaveBeenCalledWith('/api/members/member-1/status', { status: 'disabled' });
    await act(async () => release());
  });

  it('starts a clean create after cancelling an administrator edit and posts the new account', async () => {
    await act(async () => root.render(<AdminApp />));
    await settle();
    await act(async () => buttonWithText(container, '管理員權限')?.click());
    await settle();
    const accountCell = [...container.querySelectorAll('td')].find(cell => cell.textContent === 'other@example.com');
    const editButton = accountCell?.closest('tr')?.querySelector('button');
    expect(editButton).toBeDefined();
    await act(async () => editButton?.click());
    expect(within(container).getByRole('heading', { name: '修改管理員' })).toBeDefined();
    await act(async () => within(container).getByRole('button', { name: '取消', exact: true }).click());
    await act(async () => within(container).getByRole('button', { name: '新增管理員', exact: true }).click());
    expect(within(container).getByRole('heading', { name: '新增管理員' })).toBeDefined();
    expect((within(container).getByLabelText('管理員帳號') as HTMLInputElement).value).toBe('');
    expect((within(container).getByLabelText('管理員名稱') as HTMLInputElement).value).toBe('');
    expect((within(container).getByLabelText('角色') as HTMLSelectElement).value).toBe('查看人員');
    for (const [label, value] of [['管理員帳號', 'new@example.com'], ['管理員名稱', '新管理員'], ['初始密碼', 'new-admin-password']]) {
      await act(async () => fireEvent.change(within(container).getByLabelText(label), { target: { value } }));
    }
    await act(async () => within(container).getByRole('button', { name: '儲存', exact: true }).click());
    const confirmation = within(container).getByRole('alertdialog');
    await act(async () => within(confirmation).getByRole('button', { name: '確認新增', exact: true }).click());
    await settle();
    expect(app.api.post).toHaveBeenCalledWith('/api/admins', expect.objectContaining({
      account: 'new@example.com', name: '新管理員', password: 'new-admin-password', role: '查看人員',
    }));
    expect(app.api.put).not.toHaveBeenCalled();
  });

  it('shows an inactive member as disabled', async () => {
    app.state.memberStatus = 'inactive';
    await act(async () => root.render(<AdminApp />));
    await settle();
    await act(async () => buttonWithText(container, '用戶管理')?.click());
    await settle();

    const memberCell = [...container.querySelectorAll('td')].find(cell => cell.textContent === '測試會員');
    const memberRow = memberCell?.closest('tr');
    expect(memberRow).toBeDefined();
    expect(within(memberRow!).getByText('停用')).toBeDefined();
    expect(memberRow?.textContent).not.toContain('inactive');
  });

  it('shows the independent permission switch menu and lets a super administrator operate it', async () => {
    await act(async () => root.render(<AdminApp />));
    await settle();

    const navigation = buttonWithText(container, '權限切換');
    expect(navigation).toBeDefined();
    await act(async () => navigation?.click());
    await settle();

    expect(app.api.get).toHaveBeenCalledWith('/api/permission-settings');
    expect(container.querySelector<HTMLInputElement>('[role="switch"][aria-label="顯示訂閱購買"]')?.disabled).toBe(false);
    expect(container.querySelector<HTMLInputElement>('[role="switch"][aria-label="註冊會員免費使用"]')?.disabled).toBe(false);
  });

  it.each(['營運管理員', '查看人員'])('shows permission switches read-only for %s', async (role) => {
    app.state.admin = {
      id: 'admin-1',
      account: 'readonly@example.com',
      name: role,
      role,
      permissions: { view: true, add: false, edit: false, delete: false },
    };
    await act(async () => root.render(<AdminApp />));
    await settle();

    const navigation = buttonWithText(container, '權限切換');
    expect(navigation).toBeDefined();
    await act(async () => navigation?.click());
    await settle();

    expect(container.textContent).toContain('僅超級管理員可修改');
    expect(container.querySelector<HTMLInputElement>('[role="switch"][aria-label="顯示訂閱購買"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLInputElement>('[role="switch"][aria-label="註冊會員免費使用"]')?.disabled).toBe(true);
  });
  it.each(['營運管理員', '查看人員'])('hides administrator management and Railway mutations for %s', async (role) => {
    const operator = role === '營運管理員';
    app.state.admin = {
      id: 'admin-1',
      account: 'restricted@example.com',
      name: role,
      role,
      permissions: operator
        ? { view: true, add: true, edit: true, delete: false }
        : { view: true, add: false, edit: false, delete: false },
      modulePermissions: {
        users: { view: true, edit: operator },
        subscriptions: { view: true, edit: operator },
        activationCodes: { view: true, edit: operator },
        systemSettings: { view: true, edit: false },
        admins: { view: false, edit: false },
      },
    };
    await act(async () => root.render(<AdminApp />));
    await settle();

    expect(buttonWithText(container, '管理員權限')).toBeUndefined();
    await act(async () => buttonWithText(container, '系統設定')?.click());
    await settle();

    expect(container.querySelector('.statusGroupHeader')?.textContent).toContain('正常 1 · 等待 0 · 無需處理 0 · 需處理 0');
    expect(container.querySelector<HTMLSelectElement>('#railway-operation-lottery')?.disabled).toBe(true);
    expect(buttonWithText(container, '手動更新')?.disabled).toBe(true);
    expect(buttonWithText(container, '復原')?.disabled).toBe(true);
  });

  it('hides protected mutations when module access exists but the stored operation permission is disabled', async () => {
    app.state.admin = {
      id: 'admin-1',
      account: 'operator@example.com',
      name: '營運管理員',
      role: '營運管理員',
      permissions: { view: true, add: false, edit: false, delete: false },
      modulePermissions: {
        users: { view: true, edit: true },
        subscriptions: { view: true, edit: true },
        activationCodes: { view: true, edit: true },
      },
    };
    await act(async () => root.render(<AdminApp />));
    await settle();
    await settle();

    await act(async () => buttonWithText(container, '用戶管理')?.click());
    await settle();
    expect(buttonWithText(container, '停權')).toBeUndefined();

    await act(async () => buttonWithText(container, '訂閱管理')?.click());
    await settle();
    expect(buttonWithText(container, '調整到期日')).toBeUndefined();

    await act(async () => buttonWithText(container, '啟動碼管理')?.click());
    await settle();
    expect(buttonWithText(container, '新增')).toBeUndefined();
    expect(container.querySelector('[aria-label="刪除啟動碼 ABCD-EFGH-IJKL-MNOP"]')).toBeNull();
  });

  it('copies multiple checked activation codes one per line', async () => {
    await act(async () => root.render(<AdminApp />));
    await settle();
    await settle();

    await act(async () => buttonWithText(container, '啟動碼管理')?.click());
    await settle();
    await act(async () => buttonWithText(container, '選取')?.click());

    const first = container.querySelector<HTMLInputElement>('[aria-label="選取啟動碼 ABCD-EFGH-IJKL-MNOP"]');
    const second = container.querySelector<HTMLInputElement>('[aria-label="選取啟動碼 QRST-UVWX-YZ12-3456"]');
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    await act(async () => {
      first?.click();
      second?.click();
    });
    await act(async () => buttonWithText(container, '複製')?.click());
    await settle();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'ABCD-EFGH-IJKL-MNOP\nQRST-UVWX-YZ12-3456',
    );
    expect(container.querySelector('[role="status"]')?.textContent).toContain('已複製 2 組啟動碼');
  });

  it('disables redeemed-code deletion for an operations administrator but keeps unused deletion available', async () => {
    app.state.admin = {
      id: 'admin-1',
      account: 'operator@example.com',
      name: '營運管理員',
      role: '營運管理員',
      permissions: { view: true, add: true, edit: true, delete: true },
      modulePermissions: { activationCodes: { view: true, edit: true } },
    };
    await act(async () => root.render(<AdminApp />));
    await settle();
    await settle();
    await act(async () => buttonWithText(container, '啟動碼管理')?.click());
    await settle();

    expect(container.querySelector<HTMLButtonElement>('[aria-label="刪除啟動碼 ABCD-EFGH-IJKL-MNOP"]')?.disabled).toBe(false);
    expect(container.querySelector<HTMLButtonElement>('[aria-label="刪除啟動碼 QRST-UVWX-YZ12-3456"]')?.disabled).toBe(true);
    expect(container.textContent).toContain('已兌換，僅超級管理員可刪除');
  });

  it('keeps redeemed-code deletion enabled for a super administrator', async () => {
    await act(async () => root.render(<AdminApp />));
    await settle();
    await settle();
    await act(async () => buttonWithText(container, '啟動碼管理')?.click());
    await settle();

    expect(container.querySelector<HTMLButtonElement>('[aria-label="刪除啟動碼 QRST-UVWX-YZ12-3456"]')?.disabled).toBe(false);
  });

  it('opens the owner-only hidden page on two title taps and creates a private batch there', async () => {
    app.state.admin = { ...app.state.admin, account: 'spyuilin688@gmail.com' };
    await act(async () => root.render(<AdminApp />));
    await settle();
    await act(async () => buttonWithText(container, '啟動碼管理')?.click());
    await settle();
    const title = container.querySelector<HTMLButtonElement>('header .privateActivationTitle');
    expect(title).not.toBeNull();
    await act(async () => title?.click());
    expect(container.querySelector('header')?.textContent).toContain('啟動碼管理');
    await act(async () => title?.click());
    await waitFor(() => expect(app.api.get).toHaveBeenCalledWith(expect.stringContaining('/api/data/privateActivationCodes?'), expect.objectContaining({ signal: expect.any(AbortSignal) })));
    expect(container.querySelector('header')?.textContent).toContain('隱藏啟動碼管理');
    expect(container.textContent).toContain('SECR-ET00-0000-0001');
    expect(container.querySelector('nav')?.textContent).not.toContain('隱藏啟動碼管理');

    await act(async () => buttonWithText(container, '新增')?.click());
    await act(async () => buttonWithText(container, '建立')?.click());
    await act(async () => within(within(container).getByRole('alertdialog')).getByRole('button', { name: '確認建立' }).click());
    await waitFor(() => expect(app.api.post).toHaveBeenCalledWith('/api/activation-codes/batch',
      expect.objectContaining({ private: true, durationType: '30_days', quantity: 10 })));
    expect(app.api.get).toHaveBeenCalledWith(expect.stringContaining('/api/data/privateActivationCodes?'), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('does not offer the hidden entry to other super administrators', async () => {
    await act(async () => root.render(<AdminApp />));
    await settle();
    await act(async () => buttonWithText(container, '啟動碼管理')?.click());
    await settle();
    expect(container.querySelector('header .privateActivationTitle')).toBeNull();
    expect(app.api.get).not.toHaveBeenCalledWith(expect.stringContaining('/api/data/privateActivationCodes?'), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
});
