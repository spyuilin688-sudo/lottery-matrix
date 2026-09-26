// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const dashboard = {
  todayVisitors: 0, monthVisitors: 0, totalVisitors: 0, totalUsers: 1,
  monthlyPro: 0, quarterlyPro: 1, yearlyPro: 0, expiring: 0,
  todayRevenue: 0, monthRevenue: 0, quarterRevenue: 0, yearRevenue: 0, cumulativeRevenue: 0,
  userGrowth: [], revenueGrowth: [],
};

vi.mock('./admin-platform-client', () => ({
  auth: { signIn: vi.fn(), signOut: vi.fn() },
  api: {
    get: vi.fn(async (path: string) => {
      if (path === '/api/bootstrap') return { data: { admin: { id: 'admin', role: '超級管理員', name: '管理員' } } };
      if (path === '/api/dashboard') return { data: dashboard };
      if (path.startsWith('/api/data/subscriptions?')) return { data: { items: [{
        id: 'member-1', memberDisplayName: 'Google 會員', identityDisplay: 'Google ID：google-123',
        planName: '季費', planStartedAt: '2026-09-01T00:00:00Z', planExpiresAt: '2026-12-01T00:00:00Z',
        isLifetime: false, autoRenew: true, status: 'active', registeredAt: '2026-08-01T00:00:00Z', lastOnlineAt: '2026-09-16T08:00:00Z',
      }, {
        id: 'member-2', memberDisplayName: '一般會員', identityDisplay: 'Google ID：google-456',
        planName: null, planStartedAt: null, planExpiresAt: null,
        isLifetime: null, autoRenew: null, subscriptionRevision: null, status: 'active',
      }], total: 2, currentPage: 1, totalPages: 1 } };
      if (path.startsWith('/api/data/loginRecords?')) return { data: { items: [{
        id: 'login-1', account: 'operator', loginAt: '2026-09-16T08:00:00Z', logoutAt: '2026-09-16T09:00:00Z',
        onlineMinutes: 60, ip: '203.0.113.1', estimatedRegion: '台灣・台北市', device: 'Android',
      }], total: 1, currentPage: 1, totalPages: 1 } };
      return { data: { items: [], total: 0, currentPage: 1, totalPages: 1 } };
    }),
    post: vi.fn(async () => ({ data: {} })), put: vi.fn(async () => ({ data: {} })), delete: vi.fn(async () => ({ data: {} })),
  },
}));

import AdminApp from './AdminApp';

async function renderAndOpen(label: string) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(<AdminApp />); });
  await waitFor(() => expect(container.querySelector('header b')?.textContent).toBe('營運概覽'));
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes(label));
  expect(button).toBeTruthy();
  await act(async () => { button!.click(); });
  await waitFor(() => expect(container.querySelector('header b')?.textContent).toBe(label));
  return { container, root };
}

it('shows member name beside provider identity in subscription management', async () => {
  const { container, root } = await renderAndOpen('訂閱管理');
  try {
    const table = [...container.querySelectorAll('table')].find((item) => item.querySelector('thead')?.textContent?.includes('LINE ID／Google ID'));
    expect(table).toBeTruthy();
    expect(table!.querySelector('thead')?.textContent).toContain('會員名稱');
    expect(table!.querySelector('tbody')?.textContent).toContain('Google 會員');
    expect(table!.querySelector('tbody')?.textContent).toContain('Google ID：google-123');
  } finally { await act(async () => root.unmount()); container.remove(); }
});

it('shows redacted renewal data as unknown and does not offer an unusable expiry action', async () => {
  const { container, root } = await renderAndOpen('訂閱管理');
  try {
    const table = [...container.querySelectorAll('table')].find((item) => item.querySelector('thead')?.textContent?.includes('自動續訂'));
    const redactedRow = [...table!.querySelectorAll('tbody tr')].find((row) => row.textContent?.includes('一般會員'));
    expect(redactedRow).toBeTruthy();
    expect(redactedRow!.querySelectorAll('td')[5]?.textContent).toBe('—');
    expect(redactedRow!.querySelector('button')).toBeTruthy();
    expect(redactedRow!.querySelector('button')?.textContent).toBe('用戶資訊');
  } finally { await act(async () => root.unmount()); container.remove(); }
});

it('shows logout time while keeping estimated region in login records', async () => {
  const { container, root } = await renderAndOpen('登入紀錄');
  try {
    const table = [...container.querySelectorAll('table')].find((item) => item.querySelector('thead')?.textContent?.includes('管理員帳號'));
    expect(table).toBeTruthy();
    const header = table!.querySelector('thead')?.textContent ?? '';
    const body = table!.querySelector('tbody')?.textContent ?? '';
    expect(header).toContain('登出時間');
    expect(body).toContain('17:00');
    expect(header).toContain('推估地區');
    expect(header).not.toContain('本次在線時間');
    expect(body).toContain('台灣・台北市');
  } finally { await act(async () => root.unmount()); container.remove(); }
});
