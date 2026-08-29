import { describe, expect, it, vi } from 'vitest';
import { createLineLogoutHandler } from './handler';

const user = {
  identities: [{ provider: 'custom:line', provider_id: 'line-user-id' }],
};

function request(body: unknown, authorization = 'Bearer supabase-user-jwt') {
  return new Request('https://project.supabase.co/functions/v1/line-logout', {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
      Origin: 'https://matrixlottery.idv.tw',
    },
    body: JSON.stringify(body),
  });
}

describe('LINE logout Edge Function handler', () => {
  it('verifies the LINE channel and user identity before revoke', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ client_id: 'channel-id', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sub: 'line-user-id' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    const handler = createLineLogoutHandler({
      getUser: vi.fn().mockResolvedValue(user),
      getLineConfig: () => ({ channelId: 'channel-id', channelSecret: 'channel-secret' }),
      fetcher,
    });

    const response = await handler(request({ providerAccessToken: 'provider-token' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('/oauth2/v2.1/verify?access_token=provider-token');
    expect(String(fetcher.mock.calls[1]?.[0])).toContain('/oauth2/v2.1/userinfo');
    expect(String(fetcher.mock.calls[2]?.[0])).toContain('/oauth2/v2.1/revoke');
    expect(String(fetcher.mock.calls[2]?.[1]?.body)).toContain('client_secret=channel-secret');
  });

  it('fails closed without a provider token and never calls LINE', async () => {
    const fetcher = vi.fn();
    const handler = createLineLogoutHandler({
      getUser: vi.fn().mockResolvedValue(user),
      getLineConfig: () => ({ channelId: 'channel-id', channelSecret: 'channel-secret' }),
      fetcher,
    });

    const response = await handler(request({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: { code: 'LINE_PROVIDER_TOKEN_REQUIRED' } });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a LINE token that belongs to another user before revoke', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ client_id: 'channel-id', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sub: 'different-line-user' }), { status: 200 }));
    const handler = createLineLogoutHandler({
      getUser: vi.fn().mockResolvedValue(user),
      getLineConfig: () => ({ channelId: 'channel-id', channelSecret: 'channel-secret' }),
      fetcher,
    });

    const response = await handler(request({ providerAccessToken: 'provider-token' }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: { code: 'LINE_PROVIDER_REQUEST_FAILED' } });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
