import { describe, expect, it, vi } from 'vitest';
import { createAdminApiProxy } from '../../../functions/admin/api/[[path]]';

describe('Cloudflare Pages admin API proxy', () => {
  it('pins the Supabase target and forwards only the request data required by the admin API', async () => {
    const upstream = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': 'matrix_admin_session=opaque; Path=/admin/; HttpOnly; Secure; SameSite=Strict',
      },
    }));
    const proxy = createAdminApiProxy(upstream);
    const request = new Request('https://matrixlottery.idv.tw/admin/api/todos?view=open', {
      method: 'POST',
      headers: {
        Origin: 'https://matrixlottery.idv.tw',
        Cookie: 'matrix_admin_session=opaque',
        'Content-Type': 'application/json',
        'CF-Connecting-IP': '203.0.113.7',
        'X-Untrusted-Target': 'https://attacker.test',
      },
      body: JSON.stringify({ content: '確認資料' }),
    });

    const response = await proxy(request, {});
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe('https://wcimzbbapfrdotjsfyxa.supabase.co/functions/v1/admin-api/api/todos?view=open');
    expect(init?.method).toBe('POST');
    const headers = new Headers(init?.headers);
    expect(headers.get('cookie')).toBe('matrix_admin_session=opaque');
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.7');
    expect(headers.has('x-untrusted-target')).toBe(false);
    expect(await new Response(init?.body).text()).toBe(JSON.stringify({ content: '確認資料' }));
    expect(response.headers.get('set-cookie')).toContain('Path=/admin/');
  });

  it('does not proxy a path outside /admin/api', async () => {
    const upstream = vi.fn();
    const response = await createAdminApiProxy(upstream)(
      new Request('https://matrixlottery.idv.tw/admin/not-api'),
      {},
    );
    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rejects an oversized request before contacting Supabase', async () => {
    const upstream = vi.fn();
    const response = await createAdminApiProxy(upstream)(
      new Request('https://matrixlottery.idv.tw/admin/api/todos', {
        method: 'POST',
        headers: {
          Origin: 'https://matrixlottery.idv.tw',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: 'x'.repeat(65_537) }),
      }),
      {},
    );
    expect(response.status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });
});
