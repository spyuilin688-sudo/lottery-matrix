import { describe, expect, it, vi } from 'vitest';
import { createConnectionStatus } from './connection-status';

const healthUrl = 'https://api-v2.appdeploy.ai/app/matrix-sanqwn/api/_healthcheck';
const json = (body: unknown) => Response.json(body);
const fixture = (fetcher: typeof fetch) => createConnectionStatus({
  supabase: { selectRows: async () => [] },
  loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'private-service-key' }),
  getWorkerStatus: async () => ({ ok: false, reason: 'APPDEPLOY_CONFIG_MISSING', health: null, jobs: null }),
  fetcher,
  requestTimeoutMs: 20,
});

describe('admin API health evidence', () => {
  it('checks the backend gateway and requires its health contract', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input) === healthUrl
      ? json({ message: 'Success' })
      : new Response('<!doctype html><html>Admin</html>', { headers: { 'Content-Type': 'text/html' } }));
    const result = await fixture(fetcher).get();
    expect(result.items.find(item => item.id === 'admin-api')).toMatchObject({ ok: true, detail: { status: 200 } });
    expect(fetcher).toHaveBeenCalledWith(healthUrl, expect.objectContaining({ redirect: 'error', cache: 'no-store' }));
  });

  it.each([
    ['SPA HTML', '<html>Admin</html>', 'text/html'],
    ['HTML advertised as JSON', '<html>Admin</html>', 'application/json'],
    ['wrong JSON contract', '{"ok":true}', 'application/json'],
    ['null JSON', 'null', 'application/json'],
    ['JSON without JSON media type', '{"message":"Success"}', 'text/plain'],
  ])('rejects HTTP 200 with %s', async (_name, body, contentType) => {
    const result = await fixture(async () => new Response(body, { headers: { 'Content-Type': contentType } })).get();
    expect(result.items.find(item => item.id === 'admin-api')).toMatchObject({ ok: false });
  });

  it('finishes when the health body never arrives', async () => {
    const result = await fixture(async (input) => String(input).endsWith('/api/_healthcheck')
      ? { ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }), json: () => new Promise(() => {}) } as Response
      : json([])).get();
    expect(result.items.find(item => item.id === 'admin-api')).toMatchObject({ ok: false, error: '連線檢查逾時，請重新檢查。' });
  });
});

describe('permission-independent RPC registration evidence', () => {
  it('recognizes a member-only RPC without calling it or relying on the service-role OpenAPI list', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === '/rest/v1/rpc/admin_api_registry') return json([{ rpc_name: 'member_transfer_request_submit' }]);
      return json({ paths: {} });
    });
    const result = await fixture(fetcher).get();
    expect(result.items.find(item => item.id === 'supabase-rpc-member_transfer_request_submit')).toMatchObject({ ok: true, checkEvidence: 'registered' });
    expect(result.items.find(item => item.id === 'supabase-rpc-member_profile')).toMatchObject({ ok: false });
    const registryCalls = fetcher.mock.calls.filter(([input]) => new URL(String(input)).pathname === '/rest/v1/rpc/admin_api_registry');
    expect(registryCalls).toHaveLength(1);
    expect(new URL(String(registryCalls[0][0])).searchParams.get('rpc_name')).toContain('member_transfer_request_submit');
    expect(fetcher.mock.calls.some(([input]) => new URL(String(input)).pathname === '/rest/v1/rpc/member_transfer_request_submit')).toBe(false);
    expect(fetcher.mock.calls.every(([, init]) => !init?.method || ['GET', 'OPTIONS'].includes(init.method))).toBe(true);
    expect(JSON.stringify(result)).not.toContain('private-service-key');
  });

  it.each([null, {}, [{ rpc_name: 17 }], [{ rpc_name: 'member_profile' }, null]])('rejects malformed registry results %j', async (body) => {
    const result = await fixture(async () => json(body)).get();
    expect(result.items.find(item => item.id === 'supabase-rpc-member_profile')).toMatchObject({ ok: false });
  });
});
