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

it('shows the three visitor counts alongside existing member counts', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => { root.render(<AdminApp />); });
    const metrics = [...container.querySelectorAll('.metric')].map(el => el.textContent);
    expect(metrics).toContain('本日瀏覽人數2');
    expect(metrics).toContain('本月瀏覽人數7');
    expect(metrics).toContain('總瀏覽人數12');
    expect(metrics).toContain('總用戶數4');
    const grid = container.querySelector('.overviewCards')!;
    expect(grid.children).toHaveLength(9);
    expect(grid.children[4].getAttribute('role')).toBe('separator');
    expect([...grid.children].slice(5)).toHaveLength(4);
  } finally { await act(async () => root.unmount()); container.remove(); }
});
