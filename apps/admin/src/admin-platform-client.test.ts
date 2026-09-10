import { describe, expect, it, vi } from 'vitest';
import { createAdminApiClient } from './admin-platform-client';

describe('Cloudflare admin API client', () => {
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
