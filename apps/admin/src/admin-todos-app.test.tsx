// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const app = vi.hoisted(() => {
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
    if (url === '/api/bootstrap') return {
      data: { admin: { id: 'admin-1', account: 'admin@example.com', name: '管理員', role: '營運管理員' } },
    };
    if (url === '/api/dashboard') return { data: dashboard };
    if (url === '/api/todos') return { data: { items: [] } };
    if (url === '/api/push-members') return { data: { items: [], total: 0, currentPage: 1, totalPages: 1 } };
    if (url === '/api/push-delivery-logs') return { data: { items: [] } };
    return { data: { items: [] } };
  });
  return {
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

describe('AdminApp todo and notification navigation', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it.each([
    { first: '代辦事項', firstPanel: '.adminTodos', firstPaths: ['/api/todos'], second: '通知管理', secondPanel: '.notificationManagement' },
    { first: '通知管理', firstPanel: '.notificationManagement', firstPaths: ['/api/push-members', '/api/push-delivery-logs'], second: '代辦事項', secondPanel: '.adminTodos' },
  ])('opens $first immediately and reads each page only when selected', async ({ first, firstPanel, firstPaths, second, secondPanel }) => {
    const paths = ['/api/todos', '/api/push-members', '/api/push-delivery-logs'];
    const readCount = (path: string) => app.api.get.mock.calls.filter(([url]) => url === path).length;
    const navigate = (name: string) => {
      const button = Array.from(container.querySelectorAll<HTMLButtonElement>('nav button'))
        .find((node) => node.textContent?.includes(name));
      expect(button).toBeDefined();
      act(() => button!.click());
    };

    await act(async () => root.render(<AdminApp />));
    await settle();
    await settle();
    for (const path of paths) expect(readCount(path)).toBe(0);

    navigate(first);
    expect(container.querySelector(firstPanel)).not.toBeNull();
    await settle();
    for (const path of paths) expect(readCount(path)).toBe(firstPaths.includes(path) ? 1 : 0);

    navigate(second);
    expect(container.querySelector(secondPanel)).not.toBeNull();
    await waitFor(() => {
      for (const path of paths) expect(readCount(path)).toBe(1);
    });
    if (second === '代辦事項') {
      expect(container.querySelector('.adminTodos h1')?.textContent).toBe('代辦事項');
      expect(container.querySelector('.tableWrap')).toBeNull();
    }

    navigate('營運概覽');
    await settle();
    for (const path of paths) expect(readCount(path)).toBe(1);
  });
});
