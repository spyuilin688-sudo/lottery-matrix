import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdminApiClient } from './admin-platform-client';
import { loadAdminBootstrap } from './admin-recovery';

describe('Cloudflare admin API client', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.doUnmock('@supabase/supabase-js');
    vi.resetModules();
  });

  it.each(['returned', 'thrown'])('preserves a %s owner session failure as unavailable without sending an anonymous request', async (kind) => {
    const failure = new Error('session transport failed');
    const getSession = kind === 'returned'
      ? vi.fn().mockResolvedValue({ data: { session: null }, error: failure })
      : vi.fn().mockRejectedValue(failure);
    vi.doMock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: {
      getSession,
      getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'owner@example.com', email_confirmed_at: '2026-09-01T00:00:00Z', is_anonymous: false } }, error: null }),
    } }) }));
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ url: 'https://project.supabase.co', publicKey: 'public-test-key' })));
    vi.stubGlobal('fetch', fetcher);
    vi.resetModules();
    const platform = await import('./admin-platform-client');
    await platform.auth.signIn();
    fetcher.mockClear();

    await expect(platform.api.get('/api/bootstrap')).rejects.toMatchObject({
      message: 'ADMIN_AUTH_SESSION_UNAVAILABLE', status: 503, statusCode: 503, response: { status: 503 },
    });
    expect(await loadAdminBootstrap(platform.api as Parameters<typeof loadAdminBootstrap>[0])).toMatchObject({
      kind: 'unavailable', message: 'ADMIN_AUTH_SESSION_UNAVAILABLE',
    });
    expect(getSession).toHaveBeenCalledTimes(2);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['token', 'fetch', 'body'] as const)('bounds the whole request when %s ignores abort', async (stage) => {
    vi.useFakeTimers();
    let resolveToken!: (token: string) => void;
    const pending = new Promise<never>(() => {});
    const token = new Promise<string>(resolve => { resolveToken = resolve; });
    const fetcher = vi.fn(async () => stage === 'fetch' ? pending : ({
      status: 200, ok: true, json: () => pending,
    } as unknown as Response));
    const client = createAdminApiClient({ fetcher, timeoutMs: 20, bearerToken: () => stage === 'token' ? token : Promise.resolve(null) });
    const result = expect(client.get('/api/bootstrap')).rejects.toMatchObject({ message: 'ADMIN_API_TIMEOUT', status: 504 });
    await vi.advanceTimersByTimeAsync(20);
    await result;
    expect(vi.getTimerCount()).toBe(0);
    if (stage === 'token') {
      resolveToken('late-token');
      await Promise.resolve();
      expect(fetcher).not.toHaveBeenCalled();
    }
  });

  it('preserves authentication status when the server returns a non-JSON error', async () => {
    const client = createAdminApiClient({ fetcher: vi.fn(async () => new Response('Unauthorized', { status: 401 })) });
    await expect(client.get('/api/bootstrap')).rejects.toMatchObject({ status: 401 });
  });
  it('keeps the existing /api contract while calling the same-origin /admin/api route', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const client = createAdminApiClient({ fetcher });

    await expect(client.post('/api/todos?view=open', { content: '確認資料' })).resolves.toEqual({ data: { ok: true } });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/admin/api/todos?view=open');
    expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(init?.body).toBe(JSON.stringify({ content: '確認資料' }));
  });

  it('preserves a response status on sanitized API failures', async () => {
    const client = createAdminApiClient({
      fetcher: vi.fn(async () => new Response(JSON.stringify({ error: '管理員登入已失效' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })),
    });

    await expect(client.get('/api/bootstrap')).rejects.toMatchObject({
      message: '管理員登入已失效',
      status: 401,
      statusCode: 401,
      response: { status: 401 },
    });
  });

  it('sends DELETE payloads without retrying a failed write', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'WRITE_FAILED' } }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    }));
    const client = createAdminApiClient({ fetcher });

    await expect(client.delete('/api/admin-transfer-push', { data: { endpoint: 'https://push.test/device' } }))
      .rejects.toMatchObject({ message: 'WRITE_FAILED', status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects paths outside the canonical admin API namespace', async () => {
    const client = createAdminApiClient({ fetcher: vi.fn() });
    await expect(client.get('https://attacker.test/collect')).rejects.toThrow('ADMIN_API_PATH_INVALID');
  });
});
