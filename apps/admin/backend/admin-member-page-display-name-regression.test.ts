import { expect, it, vi } from 'vitest';
import { listAdminMemberPage } from './admin-data';

it('keeps the stored LINE nickname and identity on paged subscription rows', async () => {
  const request = vi.fn(async (path: string) => {
    if (path.includes('/member_latest_connections?')) return [];
    if (path.includes('/member_online_sessions?')) return [];
    return [];
  });
  const requestPage = vi.fn(async () => ({ items: [{
    id: 'm1', auth_user_id: 'u1', line_user_id: 'line-user-1', line_display_name: 'LINE 暱稱',
    registered_at: '2026-09-01T00:00:00Z', current_plan_id: 'p1', plan_started_at: '2026-09-01T00:00:00Z',
    plan_expires_at: '2027-09-01T00:00:00Z', is_lifetime: false, auto_renew: false, status: 'active',
    last_online_at: '2026-09-16T00:00:00Z', current_plan: { name: '年費方案', price: 17800, duration_days: 365 },
  }], total: 1 }));

  const result = await listAdminMemberPage('subscriptions', { page: 1, plan: 'all' }, { request, requestPage }, new Date('2026-09-16T00:00:00Z'));

  expect(result.items[0]).toMatchObject({
    memberDisplayName: 'LINE 暱稱',
    identityDisplay: 'LINE ID：line-user-1',
    planName: '年費方案',
  });
  const url = new URL(requestPage.mock.calls[0][0], 'https://example.test');
  expect(url.searchParams.get('select')).toContain('line_display_name');
  expect(url.searchParams.get('select')).toContain('line_user_id');
  expect(url.searchParams.get('select')).toContain('auth_user_id');
});
