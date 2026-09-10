import { describe, expect, it, vi } from 'vitest';
import { apiPath, json, router } from '../../../supabase/functions/admin-api/runtime';

describe('Supabase admin Edge runtime', () => {
  it('normalizes only the deployed and proxied admin API prefixes', () => {
    expect(apiPath(new Request('https://project.test/functions/v1/admin-api/api/bootstrap'))).toBe('/api/bootstrap');
    expect(apiPath(new Request('https://project.test/admin-api/api/bootstrap'))).toBe('/api/bootstrap');
    expect(apiPath(new Request('https://project.test/api/bootstrap'))).toBeNull();
  });

  it('keeps the credential cookie scoped to the admin surface', async () => {
    const handler = router({
      'POST /api/admin-login': [async () => ({
        ...json({ ok: true }),
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': 'matrix_admin_session=opaque; Path=/; HttpOnly; Secure; SameSite=Strict',
        },
      })],
    });
    const response = await handler(new Request('https://project.test/functions/v1/admin-api/api/admin-login', {
      method: 'POST',
      headers: { Origin: 'https://matrixlottery.idv.tw', 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: 'owner', password: 'secret' }),
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('Path=/admin/');
  });

  it('passes the Cloudflare visitor IP to existing security and audit code', async () => {
    const seen = vi.fn();
    const handler = router({
      'POST /api/action': [async (ctx) => {
        seen(ctx.event.headers['x-forwarded-for']);
        return json({ ok: true });
      }],
    });
    const response = await handler(new Request('https://project.test/functions/v1/admin-api/api/action', {
      method: 'POST',
      headers: {
        Origin: 'https://matrixlottery.idv.tw',
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.7',
      },
      body: '{}',
    }));
    expect(response.status).toBe(200);
    expect(seen).toHaveBeenCalledWith('203.0.113.7');
  });
});
