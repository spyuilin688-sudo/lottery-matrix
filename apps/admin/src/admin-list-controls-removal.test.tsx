// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const emptyPage = { items: [], total: 0, currentPage: 1, totalPages: 1 };
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
};

vi.mock('@appdeploy/client', () => ({
  auth: { signIn: vi.fn(), signOut: vi.fn() },
  api: {
    get: vi.fn(async (path: string) => {
      if (path === '/api/bootstrap') {
        return { data: { admin: { id: 'admin', role: '超級管理員', name: '管理員' } } };
      }
      if (path === '/api/dashboard') return { data: dashboard };
      return { data: emptyPage };
    }),
    post: vi.fn(async () => ({ data: {} })),
    put: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({ data: {} })),
  },
}));

import AdminApp from './AdminApp';

it('removes the shared list filter card from admin data pages', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  try {
    await act(async () => { root.render(<AdminApp />); });
    await waitFor(() => expect(container.querySelector('header b')?.textContent).toBe('營運概覽'));

    for (const page of ['用戶管理', '訂閱管理', '登入紀錄', '審計日誌', '管理員權限', '啟動碼管理']) {
      const button = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes(page));
      expect(button, `missing navigation button for ${page}`).toBeTruthy();
      await act(async () => { button!.click(); });
      await waitFor(() => expect(container.querySelector('header b')?.textContent).toBe(page));
      expect(container.querySelector('.managementToolbar'), `${page} still renders the removed filter card`).toBeNull();
    }
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
