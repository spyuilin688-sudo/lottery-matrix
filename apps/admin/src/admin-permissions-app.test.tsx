// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
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
    failPaymentRead: false,
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
    account: 'other@example.com',
    name: '其他管理員',
    role: '營運管理員',
    status: '啟用',
    permissions: { view: true, add: false, edit: true, delete: false },
    lastLoginAt: null,
  };
  const dashboard = {
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
  };
  const get = vi.fn(async (url: string) => {
    if (url === '/api/bootstrap') return {
      data: {
        admin: state.admin,
      },
    };
    if (url === '/api/dashboard') return { data: dashboard };
    if (url === '/api/permission-settings') return { data: state.permissionSettings };
    if (url === '/api/data/admins') return { data: { items: [otherAdmin] } };
    if (url.startsWith('/api/data/users?')) return { data: { items: [{ id: 'member-1', status: 'active' }], total: 1, currentPage: 1, totalPages: 1 } };
    if (url.startsWith('/api/data/subscriptions?')) {
      if (state.nextSubscriptionRead) {
        const pending = state.nextSubscriptionRead;
        state.nextSubscriptionRead = null;
        return pending;
      }
      return { data: { items: [{ id: 'member-1', status: 'active' }], total: 1, currentPage: 1, totalPages: 1 } };
    }
    if (url === '/api/data/subscriptionRecords') {
      if (state.failPaymentRead) throw new Error('payment offline');
      return { data: { items: [{
      id: 'payment-1', memberId: 'member-1', lineDisplayName: '王小明', planId: 'plan-1',
      planName: '月費方案', amount: 2880, paidAt: '2026-09-01T02:00:00Z', status: 'confirmed',
      }] } };
    }
    if (url === '/api/data/plans' || url === '/api/data/transferRequests') return { data: { items: [] } };
    if (url === '/api/data/activationCodes') return { data: { items: [
      { id: 'code-1', code: 'ABCD-EFGH-IJKL-MNOP', status: 'unused', redeemedAt: null, redeemedByLineDisplayName: null },
      { id: 'code-2', code: 'QRST-UVWX-YZ12-3456', status: 'used', redeemedAt: '2026-09-05T01:00:00Z', redeemedByLineDisplayName: '兌換者' },
    ] } };
    return { data: { items: [] } };
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

vi.mock('@appdeploy/client', () => app);

import AdminApp from './AdminApp';

async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

function buttonWithText(container: HTMLElement, label: string) {
  return [...container.querySelectorAll('button')].find((button) => button.textContent?.includes(label));
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

  it('opens transfer requests from a notification on cold start', async () => {
    window.history.replaceState(null, '', '/#transfer-requests');
    try {
      await act(async () => root.render(<AdminApp />));
      await settle();
      expect(container.querySelector('#transfer-requests')).not.toBeNull();
      expect(container.querySelector('[aria-label="新轉帳手機通知"]')).not.toBeNull();
      expect(app.api.get).toHaveBeenCalledWith('/api/data/transferRequests');
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
    } finally { window.history.replaceState(null, '', '/'); }
  });

  it('loads payment history and records a confirmed reversal through the shared dialog', async () => {
    await act(async () => root.render(<AdminApp />));
    await settle();
    await act(async () => buttonWithText(container, '訂閱管理')?.click());
    await settle();

    expect(app.api.get).toHaveBeenCalledWith('/api/data/subscriptionRecords');
    const open = container.querySelector<HTMLButtonElement>('[aria-label="記錄沖銷 payment-1"]');
    expect(open).not.toBeNull();
    await act(async () => open?.click());
    const reason = container.querySelector<HTMLTextAreaElement>('[aria-label="沖銷原因"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(reason, '銀行退款已完成');
      reason?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => buttonWithText(container, '記錄已完成沖銷')?.click());
    const dialog = container.querySelector<HTMLElement>('[role="alertdialog"]');
    expect(dialog?.textContent).toContain('此操作只記錄外部已完成的款項沖銷');
    await act(async () => buttonWithText(dialog as HTMLElement, '記錄已退款')?.click());
    await settle();

    expect(app.api.put).toHaveBeenCalledWith('/api/payments/payment-1/reversal', {
      status: 'refunded', reason: '銀行退款已完成',
    });
  });

  it('shows a payment read error instead of false empty or stale actions and recovers inline', async () => {
    app.state.failPaymentRead = true;
    await act(async () => root.render(<AdminApp />));
    await settle();
    await act(async () => buttonWithText(container, '訂閱管理')?.click());
    await settle();

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('付款紀錄載入失敗');
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
    await act(async () => buttonWithText(container, '營運概覽')?.click());
    await settle();
    await act(async () => buttonWithText(container, '訂閱管理')?.click());
    await settle();
    expect(container.querySelector('[aria-label="記錄沖銷 payment-1"]')).not.toBeNull();

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

    const accountCell = [...container.querySelectorAll('td')]
      .find((cell) => cell.textContent === 'other@example.com');
    expect(accountCell).toBeDefined();
    const row = accountCell?.closest('tr');
    const editButton = row?.querySelector('button');
    expect(editButton).not.toBeNull();
    await act(async () => editButton?.click());

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
      permissions: { view: false, add: true, edit: false, delete: true },
    }));
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
});
