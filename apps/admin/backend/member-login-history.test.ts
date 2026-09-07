import { describe, expect, it, vi } from 'vitest';
import { listMemberLoginHistory, lookupLocations, locationLabel } from './member-login-history';
const member = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
describe('member login history', () => {
  it('rejects invalid IDs and page numbers before querying', async () => {
    const api = { request: vi.fn() };
    for (const [id, page] of [['bad', 1], [member, 0], [member, 1.5], [member, '1&limit=999']]) await expect(listMemberLoginHistory(String(id), page, api)).rejects.toThrow('查詢條件');
    expect(api.request).not.toHaveBeenCalled();
  });
  it('returns only five records and uses the looked-up auth owner', async () => {
    const request = vi.fn(async (path: string) => path.includes('/members?') ? [{ auth_user_id: user }] : Array.from({ length: 6 }, (_, i) => ({ id: i, login_at: '2026-09-07', login_ip: null })));
    const result = await listMemberLoginHistory(member, 2, { request } as never);
    expect(result.items).toHaveLength(5); expect(result.hasMore).toBe(true);
    expect(request.mock.calls[1][0]).toContain(`auth_user_id=eq.${user}`);
    expect(request.mock.calls[1][0]).toContain('limit=6&offset=5');
    expect(result.items[0].ip).toBeNull();
  });
  it('uses cached geolocation without disclosing account information', async () => {
    const fetcher = vi.fn();
    const request = vi.fn(async () => [{ ip: '203.0.113.1', country_code: 'TW', city: 'Taipei', checked_at: new Date().toISOString() }]);
    const result = await lookupLocations(['203.0.113.1'], { request } as never, fetcher);
    expect(result.get('203.0.113.1')).toBe('台灣・台北市'); expect(fetcher).not.toHaveBeenCalled();
  });
  it('keeps records usable when the location provider fails', async () => {
    const request = vi.fn(async () => []);
    const result = await lookupLocations(['203.0.113.1'], { request } as never, vi.fn(async () => new Response('', { status: 429 })));
    expect(result.get('203.0.113.1')).toBeNull();
    expect(locationLabel(undefined)).toBeNull();
  });
});
