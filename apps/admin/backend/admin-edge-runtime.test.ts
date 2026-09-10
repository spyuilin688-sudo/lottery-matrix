import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { apiPath, json, router } from '../../../supabase/functions/admin-api/runtime';

describe('Supabase admin Edge runtime', () => {
  it('maps every new permission settings module into the Edge bundle', () => {
    const importMap = JSON.parse(readFileSync(
      new URL('../../../supabase/functions/admin-api/deno.json', import.meta.url),
      'utf8',
    ));
    expect(importMap.imports['../../../apps/admin/backend/permission-settings'])
      .toBe('../../../apps/admin/backend/permission-settings.ts');
  });

  it('normalizes only the deployed and proxied admin API prefixes', () => {
    expect(apiPath(new Request('https://project.test/functions/v1/admin-api/api/bootstrap'))).toBe('/api/bootstrap');
    expect(apiPath(new Request('https://project.test/admin-api/api/bootstrap'))).toBe('/api/bootstrap');
    expect(apiPath(new Request('https://project.test/api/bootstrap'))).toBeNull();
  });

  it('preserves the root-scoped credential cookie for the Cloudflare session roundtrip', async () => {
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
    expect(response.headers.get('set-cookie')).toContain('Path=/;');
    expect(response.headers.get('set-cookie')).not.toContain('Path=/admin/');
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

  it('passes only the dedicated watchdog credential to the internal canonical route', async () => {
    const seen = vi.fn();
    const handler = router({
      'POST /api/internal/matrix-watchdog': [async (ctx) => {
        seen(ctx.event.headers['x-matrix-watchdog-token']);
        return json({ ok: true });
      }],
    });
    const response = await handler(new Request('https://project.test/functions/v1/admin-api/api/internal/matrix-watchdog', {
      method: 'POST',
      headers: {
        Origin: 'https://matrixlottery.idv.tw',
        'Content-Type': 'application/json',
        'X-Matrix-Watchdog-Token': 'cron-secret',
        'X-Untrusted-Token': 'untrusted',
      },
      body: '{}',
    }));
    expect(response.status).toBe(200);
    expect(seen).toHaveBeenCalledWith('cron-secret');
  });
});
