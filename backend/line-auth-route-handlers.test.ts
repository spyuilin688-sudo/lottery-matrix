import { describe, expect, it, vi } from 'vitest';
import { createLineAuthRouteHandlers } from './line-auth-route-handlers';

describe('LINE auth route handlers', () => {
  it('registers the logout path and forwards the request transport shape', async () => {
    const logoutPost = vi.fn(async () => ({ status: 200, body: { ok: true } }));
    const handlers = createLineAuthRouteHandlers({
      logoutPost,
      authorizationHeader: event => event?.headers?.authorization ?? event?.headers?.Authorization,
      json: (body, status) => ({ body, statusCode: status ?? 200 }),
    });

    expect(Object.keys(handlers)).toContain('POST /api/auth/line/logout');
    await expect(handlers['POST /api/auth/line/logout'][0]({
      event: { headers: { Authorization: 'Bearer session-token' } },
      body: { providerAccessToken: 'provider-token' },
    })).resolves.toEqual({ body: { ok: true }, statusCode: 200 });
    expect(logoutPost).toHaveBeenCalledWith({
      authorization: 'Bearer session-token',
      body: { providerAccessToken: 'provider-token' },
    });
  });

  it('preserves a sanitized route error without adding response details', async () => {
    const handlers = createLineAuthRouteHandlers({
      logoutPost: async () => ({ status: 502, body: { error: { code: 'LINE_PROVIDER_REQUEST_FAILED' } } }),
      authorizationHeader: event => event?.headers?.authorization ?? event?.headers?.Authorization,
      json: (body, status) => ({ body, statusCode: status ?? 200 }),
    });

    await expect(handlers['POST /api/auth/line/logout'][0]({
      event: { headers: { authorization: 'Bearer session-token' } },
      body: { providerAccessToken: 'provider-token' },
    })).resolves.toEqual({
      body: { error: { code: 'LINE_PROVIDER_REQUEST_FAILED' } },
      statusCode: 502,
    });
  });
});
