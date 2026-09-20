import { expect, it, vi } from 'vitest';
import { normalizeIpAddress, lookupLocations } from './member-login-history';
import { listAdminLoginRecordPage } from './admin-data';

it('does not locate historical Cloudflare Worker chains using the cached Portland result', async () => {
  const ip = '2a06:98c0:3600::103,2a06:98c0:3600::103, 99.82.170.148';
  const request = vi.fn(async () => [{ ip: '2a06:98c0:3600::103', country_code: 'US', city: 'Portland', checked_at: new Date().toISOString() }]);
  const requestPage = async () => ({ items: [{ id: 'r1', ip, admin_account: { role: '營運管理員' } }], total: 1 });
  const result = await listAdminLoginRecordPage({}, { request, requestPage } as never);
  expect(result.items[0].estimatedRegion).toBeNull();
  expect(request).not.toHaveBeenCalled();
});

it.each([
  '2a06:98c0:3600::103',
  '2A06:98C0:3600:0000:0000:0000:0000:0103, 13.248.115.52',
  '::ffff:2a06:98c0:3600::103',
  '999.1.2.3',
  ':::1',
  'bad',
])('does not use invalid or known Worker IP %s for geolocation', value => {
  expect(normalizeIpAddress(value)).toBeNull();
});

it('normalizes the first forwarded IP before geolocation and maps the region back to the admin record', async () => {
  expect(normalizeIpAddress('203.0.113.1, 198.51.100.2')).toBe('203.0.113.1');
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ success: true, country_code: 'TW', city: 'Taipei' }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetcher);
  const request = vi.fn(async () => []);
  const requestPage = vi.fn(async () => ({ items: [{ id: 'r1', admin_id: 'a1', account: 'operator', login_at: '2026-09-16T08:00:00Z', logout_at: null, online_minutes: null, ip: '203.0.113.1, 198.51.100.2', device: 'Android', admin_account: { role: '營運管理員' } }], total: 1 }));
  try {
    const result = await listAdminLoginRecordPage({}, { request, requestPage } as never);
    expect(result.items[0].estimatedRegion).toBe('台灣・台北市');
    expect(String(fetcher.mock.calls[0][0])).toContain('ipwho.is/203.0.113.1?');
    expect(String(fetcher.mock.calls[0][0])).not.toContain('%2C');
  } finally { vi.unstubAllGlobals(); }
});

it('falls back to live geolocation when the location cache read is unavailable', async () => {
  let requestCount = 0;
  const request = vi.fn(async () => {
    requestCount += 1;
    if (requestCount === 1) throw new Error('cache unavailable');
    return [];
  });
  const requestPage = vi.fn(async () => ({ items: [{ id: 'r1', admin_id: 'a1', account: 'operator', login_at: '2026-09-16T08:00:00Z', logout_at: null, online_minutes: null, ip: '203.0.113.1', device: 'Android', admin_account: { role: '營運管理員' } }], total: 1 }));
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ success: true, country_code: 'TW', city: 'Taipei' }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetcher);
  try {
    const result = await listAdminLoginRecordPage({}, { request, requestPage } as never);
    expect(result.items[0].estimatedRegion).toBe('台灣・台北市');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][1]).toMatchObject({ method: 'POST' });
  } finally { vi.unstubAllGlobals(); }
});

it('negative-caches a provider exception without hiding the record', async () => {
  const request = vi.fn(async () => []);
  const result = await lookupLocations(['203.0.113.1'], { request } as never, vi.fn(async () => { throw new Error('provider unavailable'); }));
  expect(result.get('203.0.113.1')).toBeNull();
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[1][1]).toMatchObject({ method: 'POST' });
});
