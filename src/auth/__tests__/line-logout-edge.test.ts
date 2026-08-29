import { describe, expect, it, vi } from 'vitest';
import { createLineLogoutHandler } from '../../../supabase/functions/line-logout/handler';

function request(body: unknown) {
  return new Request('https://project.supabase.co/functions/v1/line-logout', {
    method: 'POST',
    headers: { Authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('LINE logout Edge Function', () => {
  it('verifies channel and identity before revoking the provider token', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ client_id: 'channel-id', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sub: 'line-user-id' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    const handler = createLineLogoutHandler({
      getUser: vi.fn().mockResolvedValue({ identities: [{ provider: 'custom:line', provider_id: 'line-user-id' }] }),
      getLineConfig: () => ({ channelId: 'channel-id', channelSecret: 'channel-secret' }),
      fetcher,
    });

    const response = await handler(request({ providerAccessToken: 'provider-token' }));

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(String(fetcher.mock.calls[2]?.[1]?.body)).toContain('client_secret=channel-secret');
  });

  it('fails closed when the provider token is missing', async () => {
    const fetcher = vi.fn();
    const handler = createLineLogoutHandler({
      getUser: vi.fn().mockResolvedValue({ identities: [{ provider: 'custom:line', provider_id: 'line-user-id' }] }),
      getLineConfig: () => ({ channelId: 'channel-id', channelSecret: 'channel-secret' }),
      fetcher,
    });

    const response = await handler(request({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: { code: 'LINE_PROVIDER_TOKEN_REQUIRED' } });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
