import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_TRANSFER_PUSH_PUBLIC_KEY, createAdminTransferPush } from './admin-transfer-push';
import { DEFAULT_WEB_PUSH_PUBLIC_KEY } from '../../../src/push-public-key';

const config = { url: 'https://example.supabase.co', serviceRoleKey: 'server-secret' };
const ADMIN = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const endpoint = 'https://web.push.apple.com/Qdevice?token=abc';
const subscription = { endpoint, keys: { p256dh: btoa('\x04' + '\x01'.repeat(64)).replace(/=+$/, ''), auth: btoa('\x02'.repeat(16)).replace(/=+$/, '') } };
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

const routeDeps = vi.hoisted(() => ({
  fetcher: vi.fn<typeof fetch>(),
  getAdminFromHeaders: vi.fn(),
}));
// Admin CI runs without the repository-root Vitest SDK alias.
vi.mock('@appdeploy/sdk', () => import('../../../test/appdeploy-sdk'));
vi.mock('./admin-credential-auth', () => ({
  createAdminCredentialAuth: () => ({ getAdminFromHeaders: routeDeps.getAdminFromHeaders }),
}));
vi.mock('./supabase', async (original) => {
  const module = await original<typeof import('./supabase')>();
  return { ...module,
    getSupabaseConfig: async () => ({ url: 'https://example.supabase.co', serviceRoleKey: 'server-secret' }),
    createSupabaseTransport: (source: Parameters<typeof module.createSupabaseTransport>[0], fetcher?: typeof fetch) => module.createSupabaseTransport(source, fetcher ?? routeDeps.fetcher),
  };
});

// The SDK test adapter exposes the registered route handlers as the router result.
import { handler } from './index';
type Context = { params: Record<string, string>; body?: unknown; query?: Record<string, string>; event?: Record<string, unknown>; admin?: unknown };
type Result = { body: unknown; statusCode: number };
const routes = handler as unknown as Record<string, Array<(ctx: Context) => Promise<Result | undefined>>>;
async function request(method: string, ctx: Context = { params: {} }) {
  for (const handle of routes[`${method} /api/admin-transfer-push`]) {
    const result = await handle(ctx);
    if (result) return result;
  }
}

beforeEach(() => {
  routeDeps.fetcher.mockReset().mockImplementation(async () => response([]));
  routeDeps.getAdminFromHeaders.mockReset().mockResolvedValue({ id: ADMIN, role: '超級管理員' });
});

describe('admin transfer push registration', () => {
  it('keeps the self-contained admin public key aligned with the existing sender key', () => {
    expect(ADMIN_TRANSFER_PUSH_PUBLIC_KEY).toBe(DEFAULT_WEB_PUSH_PUBLIC_KEY);
  });

  it.each([
    'http://fcm.googleapis.com/send/id', 'https://localhost/push', 'https://127.0.0.1/push',
    'https://fcm.googleapis.com.evil.test/push', 'https://evil.test/fcm.googleapis.com',
    'https://user:password@web.push.apple.com/id', 'https://web.push.apple.com:8443/id',
    'https://web.push.apple.com:443/id', 'https://web.push.apple.com/id#secret',
    'https://web.push.apple.com/id#', 'https://web.push.apple.com\\@evil.test/id',
  ])('rejects unsafe push endpoint %s without transport access', async (badEndpoint) => {
    const api = createAdminTransferPush(config, routeDeps.fetcher);
    await expect(api.enable(ADMIN, { ...subscription, endpoint: badEndpoint })).rejects.toMatchObject({ statusCode: 400 });
    expect(routeDeps.fetcher).not.toHaveBeenCalled();
  });

  it.each([
    'https://fcm.googleapis.com/fcm/send/device',
    'https://updates.push.services.mozilla.com/wpush/v2/device',
    'https://web.push.apple.com/device',
    'https://wns2-db5p.notify.windows.com/w/?token=abc',
  ])('accepts known browser push service endpoint %s', async (pushEndpoint) => {
    await expect(createAdminTransferPush(config, routeDeps.fetcher).enable(ADMIN, { ...subscription, endpoint: pushEndpoint })).resolves.toEqual({ enabled: true });
  });

  it.each([null, [], {}, { endpoint }, { endpoint, keys: null }])('rejects incomplete subscription %j', async (input) => {
    await expect(createAdminTransferPush(config, routeDeps.fetcher).enable(ADMIN, input)).rejects.toMatchObject({ statusCode: 400 });
    expect(routeDeps.fetcher).not.toHaveBeenCalled();
  });

  it.each([
    { p256dh: 'invalid', auth: subscription.keys.auth },
    { ...subscription.keys, auth: 'a'.repeat(21) },
    { ...subscription.keys, auth: '!'.repeat(22) },
    { ...subscription.keys, p256dh: btoa('\x01'.repeat(65)).replace(/=+$/, '') },
  ])('rejects invalid subscription keys', async (keys) => {
    await expect(createAdminTransferPush(config, routeDeps.fetcher).enable(ADMIN, { endpoint, keys })).rejects.toMatchObject({ statusCode: 400 });
    expect(routeDeps.fetcher).not.toHaveBeenCalled();
  });

  it('upserts repeated registration by endpoint and transfers device ownership', async () => {
    const api = createAdminTransferPush(config, routeDeps.fetcher);
    await api.enable(ADMIN, subscription);
    await api.enable(ADMIN, subscription);
    await expect(api.enable(OTHER, subscription)).resolves.toEqual({ enabled: true });
    const calls = routeDeps.fetcher.mock.calls;
    expect(calls.map(([url]) => url)).toEqual(Array(3).fill('https://example.supabase.co/rest/v1/admin_push_subscriptions?on_conflict=endpoint'));
    expect(JSON.parse(String(calls[0][1]?.body))).toMatchObject({ admin_id: ADMIN, endpoint, enabled: true, p256dh: subscription.keys.p256dh, auth_key: subscription.keys.auth });
    expect(JSON.parse(String(calls[2][1]?.body)).admin_id).toBe(OTHER);
    expect(new Headers(calls[0][1]?.headers).get('Prefer')).toContain('resolution=merge-duplicates');
    expect(new Headers(calls[0][1]?.headers).get('Authorization')).toBe('Bearer server-secret');
  });

  it('disables only the session owner endpoint without deleting it', async () => {
    await expect(createAdminTransferPush(config, routeDeps.fetcher).disable(ADMIN, endpoint)).resolves.toEqual({ enabled: false });
    const [url, init] = routeDeps.fetcher.mock.calls[0];
    const query = new URL(String(url)).searchParams;
    expect(query.get('admin_id')).toBe(`eq.${ADMIN}`);
    expect(query.get('endpoint')).toBe(`eq.${endpoint}`);
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(String(init?.body))).toMatchObject({ enabled: false });
  });

  it('reads enabled status from the owned server subscription', async () => {
    const api = createAdminTransferPush(config, routeDeps.fetcher);
    await expect(api.getConfig(ADMIN)).resolves.toMatchObject({ enabled: false });
    expect(routeDeps.fetcher).not.toHaveBeenCalled();
    await expect(api.getConfig(ADMIN, endpoint)).resolves.toMatchObject({ enabled: false });
    const query = new URL(String(routeDeps.fetcher.mock.calls[0][0])).searchParams;
    expect(query.get('admin_id')).toBe(`eq.${ADMIN}`);
    expect(query.get('endpoint')).toBe(`eq.${endpoint}`);
    expect(query.get('enabled')).toBe('eq.true');
    routeDeps.fetcher.mockResolvedValue(response([{ id: 'subscription' }]));
    await expect(api.getConfig(ADMIN, endpoint)).resolves.toMatchObject({ enabled: true });
  });
});

describe('admin transfer push route authorization', () => {
  it.each(['GET', 'POST', 'DELETE'])('%s rejects absent sessions and non-superadmins before storage access', async (method) => {
    routeDeps.getAdminFromHeaders.mockRejectedValueOnce(Object.assign(new Error('管理員登入已失效'), { statusCode: 401 }));
    expect(await request(method)).toMatchObject({ statusCode: 401 });
    routeDeps.getAdminFromHeaders.mockResolvedValueOnce({ id: ADMIN, role: '一般管理員' });
    expect(await request(method)).toMatchObject({ statusCode: 403, body: { error: '僅超級管理員可管理匯款推播通知' } });
    expect(routeDeps.fetcher).not.toHaveBeenCalled();
  });

  it('uses the session identity and ignores request-supplied administrator ids', async () => {
    expect(await request('POST', { params: {}, body: { adminId: OTHER, subscription: { ...subscription, admin_id: OTHER } } })).toMatchObject({ statusCode: 200, body: { enabled: true } });
    expect(JSON.parse(String(routeDeps.fetcher.mock.calls[0][1]?.body)).admin_id).toBe(ADMIN);
  });

  it('scopes disable to the session identity despite a forged body owner', async () => {
    expect(await request('DELETE', { params: {}, body: { endpoint, adminId: OTHER } })).toMatchObject({ statusCode: 200, body: { enabled: false } });
    expect(new URL(String(routeDeps.fetcher.mock.calls[0][0])).searchParams.get('admin_id')).toBe(`eq.${ADMIN}`);
  });

  it('returns the public key and optional owned endpoint status', async () => {
    routeDeps.fetcher.mockResolvedValue(response([{ id: 'subscription' }]));
    expect(await request('GET', { params: {}, query: { endpoint } })).toMatchObject({ statusCode: 200, body: { publicKey: expect.any(String), enabled: true } });
  });
});
