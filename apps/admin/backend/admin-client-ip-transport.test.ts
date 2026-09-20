import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminApiProxy } from '../../../functions/admin/api/[[path]]';
import { json, router } from '../../../supabase/functions/admin-api/runtime';

const secret = 'test-only-admin-proxy-key-0123456789abcdef';
const env = { MATRIX_ADMIN_PROXY_SECRET: secret };
const origin = 'https://matrixlottery.idv.tw';
const workerChain = '2a06:98c0:3600::103,2a06:98c0:3600::103, 13.248.115.52';
const readIp = (ctx: { event: { clientIp?: string } }) => json({ ip: ctx.event.clientIp || null });

function incoming(ip = '203.0.113.7') {
  return new Request(`${origin}/admin/api/admin-login`, {
    method: 'POST',
    headers: {
      Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip,
      'X-Matrix-Client-IP': '198.51.100.99', 'X-Matrix-Client-IP-Time': '1',
      'X-Matrix-Client-IP-Signature': 'forged',
    },
    body: '{}',
  });
}

describe('admin IP across the Cloudflare to Supabase boundary', () => {
  beforeEach(() => vi.stubGlobal('Deno', { env: { toObject: () => env } }));
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it.each(['203.0.113.7', '2001:db8::7'])(
    'records the entry IP %s after the gateway replaces its forwarding headers', async ip => {
      const handler = router({ 'POST /api/admin-login': [readIp] });
      const proxy = createAdminApiProxy(async (url, init) => {
        const forwarded = new Headers(init?.headers);
        forwarded.set('x-forwarded-for', workerChain);
        forwarded.set('cf-connecting-ip', '2a06:98c0:3600::103');
        return handler(new Request(String(url), { ...init, headers: forwarded }));
      });
      const response = await proxy(incoming(ip), env);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ip });
    },
  );

  it('accepts the verified IP when the gateway shortens the Edge Function URL prefix', async () => {
    const handler = router({ 'POST /api/admin-login': [readIp] });
    const proxy = createAdminApiProxy(async (url, init) => {
      const shortened = String(url).replace('/functions/v1/admin-api/', '/admin-api/');
      return handler(new Request(shortened, init));
    });
    expect(await (await proxy(incoming(), env)).json()).toEqual({ ip: '203.0.113.7' });
  });

  it('does not accept a changed IP with the original signature', async () => {
    const handler = router({ 'POST /api/admin-login': [readIp] });
    const proxy = createAdminApiProxy(async (url, init) => {
      const headers = new Headers(init?.headers);
      headers.set('x-matrix-client-ip', '198.51.100.99');
      headers.set('x-forwarded-for', workerChain);
      return handler(new Request(String(url), { ...init, headers }));
    });
    const response = await proxy(incoming(), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ip: null });
  });

  it('does not accept an expired assertion', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-19T15:00:00Z'));
    const handler = router({ 'POST /api/admin-login': [readIp] });
    const proxy = createAdminApiProxy(async (url, init) => {
      vi.setSystemTime(new Date('2026-09-19T15:02:00Z'));
      return handler(new Request(String(url), init));
    });
    expect(await (await proxy(incoming(), env)).json()).toEqual({ ip: null });
  });

  it('does not reuse an IP assertion on a different route', async () => {
    const handler = router({ 'POST /api/other': [readIp] });
    const proxy = createAdminApiProxy(async (url, init) => handler(new Request(
      String(url).replace('/api/admin-login', '/api/other'), init,
    )));
    expect(await (await proxy(incoming(), env)).json()).toEqual({ ip: null });
  });

  it('does not treat unsigned direct requests as verified IPs', async () => {
    const handler = router({ 'POST /api/admin-login': [readIp] });
    const request = incoming();
    request.headers.set('x-forwarded-for', '203.0.113.7');
    const response = await handler(new Request('https://project.test/functions/v1/admin-api/api/admin-login', request));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ip: null });
  });

  it('keeps login available without guessing an IP when the proxy secret is absent', async () => {
    const handler = router({ 'POST /api/admin-login': [readIp] });
    const proxy = createAdminApiProxy(async (url, init) => handler(new Request(String(url), init)));
    const response = await proxy(incoming(), {});
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ip: null });
  });

  it('does not sign the Cloudflare Worker placeholder as a visitor IP', async () => {
    const handler = router({ 'POST /api/admin-login': [readIp] });
    const proxy = createAdminApiProxy(async (url, init) => handler(new Request(String(url), init)));
    expect(await (await proxy(incoming('2a06:98c0:3600::103'), env)).json()).toEqual({ ip: null });
  });
});
