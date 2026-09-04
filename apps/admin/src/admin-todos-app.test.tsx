// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const app = vi.hoisted(() => {
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
      data: { admin: { id: 'admin-1', account: 'admin@example.com', name: '管理員', role: '營運管理員' } },
    };
    if (url === '/api/dashboard') return { data: dashboard };
    if (url === '/api/todos') return { data: { items: [] } };
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

vi.mock('@appdeploy/client', () => app);

import AdminApp from './AdminApp';

async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

describe('AdminApp todo navigation', () => {
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

  it('opens the shared todo page from the main navigation without using a generic data table', async () => {
    await act(async () => root.render(<AdminApp />));
    await settle();
    await settle();

    const todoNavigation = Array.from(container.querySelectorAll('nav button'))
      .find((node) => node.textContent?.includes('代辦事項')) as HTMLButtonElement | undefined;
    expect(todoNavigation).toBeDefined();

    await act(async () => todoNavigation?.click());
    await settle();

    expect(container.querySelector('.adminTodos')).not.toBeNull();
    expect(container.querySelector('.adminTodos h1')?.textContent).toBe('代辦事項');
    expect(app.api.get).toHaveBeenCalledWith('/api/todos');
    expect(container.querySelector('.tableWrap')).toBeNull();
  });
});
