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
    if (url === '/api/data/admins') return { data: { items: [otherAdmin] } };
    if (url === '/api/data/users') return { data: { items: [{ id: 'member-1', status: 'active' }] } };
    if (url === '/api/data/subscriptions') return { data: { items: [{ id: 'member-1', status: 'active' }] } };
    if (url === '/api/data/plans' || url === '/api/data/transferRequests') return { data: { items: [] } };
    if (url === '/api/data/activationCodes') return { data: { items: [{ id: 'code-1', code: 'ABC-123' }] } };
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
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
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
    expect(container.querySelector('[aria-label="刪除啟動碼 ABC-123"]')).toBeNull();
  });
});
