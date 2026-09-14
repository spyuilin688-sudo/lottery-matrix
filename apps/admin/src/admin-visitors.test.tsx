// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('@appdeploy/client', () => ({
  auth: { signIn: vi.fn(), signOut: vi.fn() },
  api: { get: vi.fn(async (path: string) => ({ data: path === '/api/bootstrap'
    ? { admin: { id: 'admin', role: '超級管理員', name: '管理員' } }
    : { todayVisitors: 2, monthVisitors: 7, totalVisitors: 12, totalUsers: 4, monthlyPro: 1, quarterlyPro: 1, yearlyPro: 1, expiring: 0 } })) },
}));
import AdminApp from './AdminApp';

it('prioritizes operational overview metrics and groups Matrix Pro subscription counts without a fake chart', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => { root.render(<AdminApp />); });

    const metrics = [...container.querySelectorAll('.metric')].map(el => el.textContent);
    expect(metrics).toEqual([
      '本日瀏覽人數2',
      '本月瀏覽人數7',
      '總瀏覽人數12',
      '總用戶數4',
      '即將到期用戶數0',
    ]);

    expect(container.querySelector('[role="separator"]')).toBeNull();
    expect(container.querySelector('.emptyChart')).toBeNull();

    const subscriptionPanel = [...container.querySelectorAll('.panel')]
      .find(panel => panel.querySelector('h2')?.textContent === 'Matrix Pro 訂閱');
    expect(subscriptionPanel).toBeTruthy();
    expect(subscriptionPanel?.textContent).toContain('月費用戶數1');
    expect(subscriptionPanel?.textContent).toContain('季費用戶數1');
    expect(subscriptionPanel?.textContent).toContain('年費用戶數1');
  } finally { await act(async () => root.unmount()); container.remove(); }
});
