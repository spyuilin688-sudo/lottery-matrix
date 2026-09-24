// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const dashboard = {
  todayVisitors: 0,
  monthVisitors: 0,
  totalVisitors: 0,
  totalUsers: 1,
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

vi.mock('./admin-platform-client', () => ({
  auth: { signIn: vi.fn(), signOut: vi.fn() },
  api: {
    get: vi.fn(async (path: string) => {
      if (path === '/api/bootstrap') {
        return { data: { admin: { id: 'admin', role: '超級管理員', name: '管理員' } } };
      }
      if (path === '/api/dashboard') return { data: dashboard };
      if (path.startsWith('/api/data/users?')) {
        return {
          data: {
            items: [{
              id: 'member-1',
              memberDisplayName: null,
              lineDisplayName: '蔡源輝',
              identityDisplay: 'LINE ID：U123456789',
              registeredAt: '2026-09-15T06:01:45.508129Z',
              lastOnlineAt: null,
              recentOnlineMinutes: 0,
              status: 'active',
              recentIp: null,
              estimatedRegion: null,
            }],
            total: 1,
            currentPage: 1,
            totalPages: 1,
          },
        };
      }
      return { data: { items: [], total: 0, currentPage: 1, totalPages: 1 } };
    }),
    post: vi.fn(async () => ({ data: {} })),
    put: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({ data: {} })),
  },
}));

import AdminApp from './AdminApp';

it('shows the member name and does not expose a member identity column in user management', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  try {
    await act(async () => { root.render(<AdminApp />); });
    await waitFor(() => expect(container.querySelector('header b')?.textContent).toBe('營運概覽'));

    const userManagement = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('用戶管理'));
    expect(userManagement).toBeTruthy();
    await act(async () => { userManagement!.click(); });

    await waitFor(() => expect(container.querySelector('header b')?.textContent).toBe('用戶管理'));
    await waitFor(() => expect(container.querySelector('.managementList tbody')?.textContent).toContain('蔡源輝'));

    const header = container.querySelector('.managementList thead')?.textContent ?? '';
    const table = container.querySelector('.managementList table')?.textContent ?? '';
    expect(header).toContain('會員名稱');
    expect(header).not.toContain('LINE ID／Google ID');
    expect(header).not.toContain('會員ID');
    expect(table).not.toContain('U123456789');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
