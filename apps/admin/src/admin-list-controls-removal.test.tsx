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
      if (path === '/api/bootstrap') return { data: { admin: { id: 'admin', role: '超級管理員', name: '管理員' } } };
      if (path === '/api/dashboard') return { data: dashboard };
      return { data: emptyPage };
    }),
    post: vi.fn(async () => ({ data: {} })),
    put: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({ data: {} })),
  },
}));

import AdminApp from './AdminApp';

async function choose(container: HTMLElement, page: string) {
  const button = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes(page));
  expect(button, `missing navigation button for ${page}`).toBeTruthy();
  await act(async () => { button!.click(); });
  await waitFor(() => expect(container.querySelector('header b')?.textContent).toBe(page));
}

it('keeps the operational search cards compact without date or sort controls', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  try {
    await act(async () => { root.render(<AdminApp />); });
    await waitFor(() => expect(container.querySelector('header b')?.textContent).toBe('營運概覽'));

    const expected = [
      ['用戶管理', '搜尋會員'],
      ['訂閱管理', '搜尋訂閱'],
      ['登入紀錄', '搜尋登入紀錄'],
      ['審計日誌', '搜尋審計日誌'],
    ] as const;

    for (const [page, searchLabel] of expected) {
      await choose(container, page);
      const toolbar = container.querySelector('.managementToolbar');
      expect(toolbar, `${page} should render its compact search card`).not.toBeNull();
      expect(toolbar?.querySelector(`[aria-label="${searchLabel}"]`)).not.toBeNull();
      expect(toolbar?.querySelector('input[type="date"]')).toBeNull();
      expect(toolbar?.querySelector('[aria-label*="排序"]')).toBeNull();
      expect(toolbar?.querySelector('[aria-label*="方向"]')).toBeNull();
      expect(toolbar?.querySelector('.managementCount')).not.toBeNull();
    }

    for (const page of ['登入紀錄', '審計日誌']) {
      await choose(container, page);
      expect(container.querySelector('.toolbar'), `${page} should not duplicate the count in a second toolbar row`).toBeNull();
      expect(container.querySelectorAll('.managementCount')).toHaveLength(1);
    }

    await choose(container, '用戶管理');
    expect(container.querySelector('.managementToolbar [aria-label="篩選會員狀態"]')).not.toBeNull();

    await choose(container, '訂閱管理');
    expect(container.querySelector('.managementToolbar [aria-label="篩選訂閱狀態"]')).not.toBeNull();
    expect(container.querySelector('.managementToolbar [aria-label="篩選訂閱方案"]')).not.toBeNull();

    for (const page of ['管理員權限', '啟動碼管理']) {
      await choose(container, page);
      expect(container.querySelector('.managementToolbar'), `${page} should stay focused on its own actions`).toBeNull();
    }

    await choose(container, '啟動碼管理');
    expect(container.querySelector('.toolbar'), 'activation-code actions and count should keep their dedicated toolbar').not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
