import { describe, expect, it, vi } from 'vitest';
import { createLineLogout, LineLogoutError } from './line-logout';
import { createLineLogoutRoutes } from './line-logout-routes';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function lineUser() {
  return { identities: [{ provider: 'custom:line', provider_id: 'line-user-1' }] };
}

describe('LINE logout routes', () => {
  it('returns ok after forwarding the bearer and provider token to the logout service', async () => {
    const logout = vi.fn(async () => undefined);
    const routes = createLineLogoutRoutes({ logout });

    await expect(routes.post({
      authorization: 'Bearer session-token',
      body: { providerAccessToken: 'provider-token' },
    })).resolves.toEqual({ status: 200, body: { ok: true } });

    expect(logout).toHaveBeenCalledWith('Bearer session-token', 'provider-token');
  });

  it.each([
    [new LineLogoutError('AUTH_REQUIRED', 401), 401, 'AUTH_REQUIRED'],
    [new LineLogoutError('LINE_IDENTITY_REQUIRED', 403), 403, 'LINE_IDENTITY_REQUIRED'],
    [new LineLogoutError('LINE_LOGIN_NOT_CONFIGURED', 503), 503, 'LINE_LOGIN_NOT_CONFIGURED'],
    [new LineLogoutError('LINE_PROVIDER_REQUEST_FAILED', 502), 502, 'LINE_PROVIDER_REQUEST_FAILED'],
  ])('serializes %s as only its fixed status and code', async (failure, status, code) => {
    const routes = createLineLogoutRoutes({
      logout: async () => { throw failure; },
    });

    await expect(routes.post({
      authorization: 'Bearer secret-session-token',
      body: { providerAccessToken: 'provider-token' },
    })).resolves.toEqual({ status, body: { error: { code } } });
  });

  it('does not expose unknown failure details', async () => {
    const routes = createLineLogoutRoutes({
      logout: async () => { throw new Error('upstream exposed provider-token and channel-secret'); },
    });

    const response = await routes.post({
      authorization: 'Bearer secret-session-token',
      body: { providerAccessToken: 'provider-token' },
    });

    expect(response).toEqual({ status: 502, body: { error: { code: 'LINE_PROVIDER_REQUEST_FAILED' } } });
    expect(JSON.stringify(response)).not.toContain('provider-token');
    expect(JSON.stringify(response)).not.toContain('channel-secret');
  });

  it.each([null, 7, { token: 'provider-token' }, '', '   '])(
    'rejects an invalid provider access token without loading LINE configuration or making provider calls (%o)',
    async (providerAccessToken) => {
      const fetcher = vi.fn(async () => json(lineUser()));
      const loadLineConfig = vi.fn(() => ({ channelId: 'line-channel', channelSecret: 'line-secret' }));
      const service = createLineLogout(
        () => ({ url: 'https://project.supabase.co', anonKey: 'anon-key' }),
        loadLineConfig,
        fetcher as typeof fetch,
      );
      const routes = createLineLogoutRoutes({ logout: service.logout });

      await expect(routes.post({
        authorization: 'Bearer session-token',
        body: { providerAccessToken },
      })).resolves.toEqual({
        status: 400,
        body: { error: { code: 'LINE_PROVIDER_TOKEN_REQUIRED' } },
      });

      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(loadLineConfig).not.toHaveBeenCalled();
    },
  );
});
