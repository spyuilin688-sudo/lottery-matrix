import { expect, test, vi } from 'vitest';
import { listAdminMemberPage } from './admin-data';

const memberId = '11111111-1111-4111-8111-111111111111';
const authId = '22222222-2222-4222-8222-222222222222';
const member = { id: memberId, auth_user_id: authId, line_display_name: null, line_user_id: null };
const now = new Date('2026-09-26T06:00:00Z');

test('starts independent enrichment reads together and requests one scoped online summary', async () => {
  let releaseIdentity!: (value: unknown[]) => void;
  const identity = new Promise<unknown[]>(resolve => { releaseIdentity = resolve; });
  const request = vi.fn(async (path: string) => {
    if (path.includes('admin_member_auth_profiles')) return identity;
    if (path.includes('admin_member_online_summary')) return [{ member_id: memberId, online_seconds: '91' }];
    return [];
  });
  const pending = listAdminMemberPage('users', {}, {
    request: request as never,
    requestPage: vi.fn().mockResolvedValue({ items: [member], total: 1 }),
  }, now);
  await vi.waitFor(() => expect(request).toHaveBeenCalledWith(
    '/rest/v1/rpc/admin_member_online_summary', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ p_member_ids: [memberId], p_since: '2026-09-23T06:00:00.000Z' }),
    }),
  ));
  expect(request.mock.calls.some(([path]) => path.includes('member_latest_connections'))).toBe(true);
  releaseIdentity([]);
  const result = await pending;
  expect(result.items[0].recentOnlineMinutes).toBe(2);
  expect(request.mock.calls.some(([path]) => path.includes('/member_online_sessions?'))).toBe(false);
});

test('does not read summaries for an empty member page', async () => {
  const request = vi.fn();
  const result = await listAdminMemberPage('users', {}, {
    request, requestPage: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  }, now);
  expect(result.items).toEqual([]);
  expect(request).not.toHaveBeenCalled();
});
