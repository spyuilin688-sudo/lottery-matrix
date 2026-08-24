import { describe, expect, it, vi } from 'vitest';
import { createLineLogout } from './line-logout';

const supabaseConfig = () => ({
  url: 'https://project.supabase.co',
  anonKey: 'anon-key',
});

const lineConfig = () => ({
  channelId: 'line-channel',
  channelSecret: 'line-secret',
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function invalidJson(status = 200) {
  return new Response('{', {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function responseLikeJson(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

function supabaseUser(providerId = 'line-user-1') {
  return {
    id: 'supabase-user-1',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'member@example.com',
    identities: [{
      identity_id: 'identity-1',
      id: 'identity-1',
      user_id: 'supabase-user-1',
      provider: 'custom:line',
      provider_id: providerId,
      identity_data: { sub: providerId },
      created_at: '2026-08-24T00:00:00.000Z',
      updated_at: '2026-08-24T00:00:00.000Z',
      last_sign_in_at: '2026-08-24T00:00:00.000Z',
    }],
  };
}

function validResponses() {
  return [
    json(supabaseUser()),
    json({ client_id: 'line-channel', expires_in: 3600 }),
    json({ sub: 'line-user-1', name: 'LINE member' }),
    new Response(null, { status: 200 }),
  ];
}

function deferred<T>() {
  let resolve: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve: resolve! };
}

function expectCode(code: string, status: number) {
  return expect.objectContaining({ code, status, message: code });
}

describe('LINE logout service', () => {
  it('rejects a missing or invalid Supabase bearer before any request or LINE config load', async () => {
    const fetcher = vi.fn();
    const loadLineConfig = vi.fn(lineConfig);
    const service = createLineLogout(supabaseConfig, loadLineConfig, fetcher as typeof fetch);

    await expect(service.logout('Basic not-a-bearer', 'provider-token'))
      .rejects.toMatchObject(expectCode('AUTH_REQUIRED', 401));

    expect(fetcher).not.toHaveBeenCalled();
    expect(loadLineConfig).not.toHaveBeenCalled();
  });

  it('rejects a verified Supabase user without a custom:line provider identity', async () => {
    const fetcher = vi.fn(async () => json({
      ...supabaseUser(),
      identities: [{ provider: 'email', provider_id: 'email-member' }],
    }));
    const loadLineConfig = vi.fn(lineConfig);
    const service = createLineLogout(supabaseConfig, loadLineConfig, fetcher as typeof fetch);

    await expect(service.logout('Bearer supabase-token', 'provider-token'))
      .rejects.toMatchObject(expectCode('LINE_IDENTITY_REQUIRED', 403));

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(loadLineConfig).not.toHaveBeenCalled();
  });

  it('requires a non-empty provider token after resolving the Supabase identity', async () => {
    const fetcher = vi.fn(async () => json(supabaseUser()));
    const loadLineConfig = vi.fn(lineConfig);
    const service = createLineLogout(supabaseConfig, loadLineConfig, fetcher as typeof fetch);

    await expect(service.logout('Bearer supabase-token', '   '))
      .rejects.toMatchObject(expectCode('LINE_PROVIDER_TOKEN_REQUIRED', 400));

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(loadLineConfig).not.toHaveBeenCalled();
  });

  it('maps a rejected but syntactically valid Supabase bearer to AUTH_REQUIRED without loading LINE config', async () => {
    const fetcher = vi.fn(async () => json({ private: 'unauthorized' }, 401));
    const loadLineConfig = vi.fn(lineConfig);
    const service = createLineLogout(supabaseConfig, loadLineConfig, fetcher as typeof fetch);

    await expect(service.logout('Bearer rejected-token', 'provider-token'))
      .rejects.toMatchObject(expectCode('AUTH_REQUIRED', 401));

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe('https://project.supabase.co/auth/v1/user');
    expect(fetcher.mock.calls[0]?.[1]).toEqual({
      method: 'GET',
      headers: {
        apikey: 'anon-key',
        Authorization: 'Bearer rejected-token',
      },
    });
    expect(loadLineConfig).not.toHaveBeenCalled();
  });

  it.each([
    [{ channelId: '', channelSecret: 'line-secret' }],
    [{ channelId: 'line-channel', channelSecret: '   ' }],
  ])('requires a complete lazy LINE Channel configuration (%o)', async (configuration) => {
    const fetcher = vi.fn(async () => json(supabaseUser()));
    const loadLineConfig = vi.fn(() => configuration);
    const service = createLineLogout(supabaseConfig, loadLineConfig, fetcher as typeof fetch);

    await expect(service.logout('Bearer supabase-token', 'provider-token'))
      .rejects.toMatchObject(expectCode('LINE_LOGIN_NOT_CONFIGURED', 503));

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(loadLineConfig).toHaveBeenCalledTimes(1);
  });

  it('performs verify, userinfo, and form-encoded revoke in the required order and waits for revoke', async () => {
    const revoke = deferred<Response>();
    const responses = [...validResponses().slice(0, 3), revoke.promise];
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetcher = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return responses[calls.length - 1];
    });
    const service = createLineLogout(supabaseConfig, lineConfig, fetcher as typeof fetch);

    let settled = false;
    const logout = service.logout('Bearer supabase-token', 'provider-token').then(() => { settled = true; });
    await vi.waitFor(() => expect(calls).toHaveLength(4));

    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      '/auth/v1/user',
      '/oauth2/v2.1/verify',
      '/oauth2/v2.1/userinfo',
      '/oauth2/v2.1/revoke',
    ]);
    expect(calls[0]?.init?.headers).toMatchObject({
      apikey: 'anon-key',
      Authorization: 'Bearer supabase-token',
    });
    expect(calls[0]?.init?.method).toBe('GET');
    expect(calls[1]?.url).toBe(
      'https://api.line.me/oauth2/v2.1/verify?access_token=provider-token',
    );
    expect(calls[1]?.init?.method).toBe('GET');
    expect(calls[2]?.init).toMatchObject({
      method: 'GET',
      headers: { Authorization: 'Bearer provider-token' },
    });
    expect(calls[3]?.init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    expect(String(calls[3]?.init?.body)).toBe(
      'access_token=provider-token&client_id=line-channel&client_secret=line-secret',
    );
    expect(settled).toBe(false);

    revoke.resolve(new Response(null, { status: 200 }));
    await expect(logout).resolves.toBeUndefined();
    expect(settled).toBe(true);
  });

  it('retains opaque provider and Channel values while URL and form encoding reserved characters', async () => {
    const providerToken = ' provider+token/&?= ';
    const configuration = {
      channelId: ' channel+id/&?= ',
      channelSecret: ' secret+value/&?= ',
    };
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const responses = [
      json(supabaseUser()),
      json({ client_id: configuration.channelId, expires_in: 3600 }),
      json({ sub: 'line-user-1' }),
      new Response(null, { status: 200 }),
    ];
    const fetcher = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return responses[calls.length - 1];
    });
    const service = createLineLogout(supabaseConfig, () => configuration, fetcher as typeof fetch);

    await expect(service.logout('Bearer supabase-token', providerToken)).resolves.toBeUndefined();

    expect(calls[1]?.url).toBe(
      'https://api.line.me/oauth2/v2.1/verify?access_token=+provider%2Btoken%2F%26%3F%3D+',
    );
    expect(calls[2]?.init).toMatchObject({
      method: 'GET',
      headers: { Authorization: 'Bearer  provider+token/&?= ' },
    });
    expect(String(calls[3]?.init?.body)).toBe(
      'access_token=+provider%2Btoken%2F%26%3F%3D+&client_id=+channel%2Bid%2F%26%3F%3D+&client_secret=+secret%2Bvalue%2F%26%3F%3D+',
    );
  });

  it('does not normalize whitespace in the Supabase provider identity before binding LINE sub', async () => {
    const responses = [
      json(supabaseUser(' line-user-1 ')),
      json({ client_id: 'line-channel', expires_in: 3600 }),
      json({ sub: 'line-user-1' }),
      new Response(null, { status: 200 }),
    ];
    const fetcher = vi.fn(() => responses[fetcher.mock.calls.length - 1]);
    const service = createLineLogout(supabaseConfig, lineConfig, fetcher as typeof fetch);

    await expect(service.logout('Bearer supabase-token', 'provider-token'))
      .rejects.toMatchObject(expectCode('LINE_PROVIDER_REQUEST_FAILED', 502));

    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('does not normalize whitespace in a configured Channel ID before LINE verify binding', async () => {
    const configuration = { channelId: ' line-channel ', channelSecret: 'line-secret' };
    const responses = [
      json(supabaseUser()),
      json({ client_id: 'line-channel', expires_in: 3600 }),
      json({ sub: 'line-user-1' }),
      new Response(null, { status: 200 }),
    ];
    const fetcher = vi.fn(() => responses[fetcher.mock.calls.length - 1]);
    const service = createLineLogout(supabaseConfig, () => configuration, fetcher as typeof fetch);

    await expect(service.logout('Bearer supabase-token', 'provider-token'))
      .rejects.toMatchObject(expectCode('LINE_PROVIDER_REQUEST_FAILED', 502));

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['a rejected LINE verify fetch', [json(supabaseUser()), () => Promise.reject(new Error('provider-token leaked'))], 2],
    ['a non-success LINE verify response', [json(supabaseUser()), json({ error: 'invalid' }, 401)], 2],
    ['malformed LINE verify JSON', [json(supabaseUser()), invalidJson()], 2],
    ['a LINE verify response without client_id', [json(supabaseUser()), json({ expires_in: 3600 })], 2],
    ['a LINE verify response with a non-string client_id', [json(supabaseUser()), json({ client_id: 7, expires_in: 3600 })], 2],
    ['a LINE verify response without a finite positive expiry', [json(supabaseUser()), json({ client_id: 'line-channel', expires_in: 0 })], 2],
    ['a LINE verify response with a non-number expiry', [json(supabaseUser()), json({ client_id: 'line-channel', expires_in: '3600' })], 2],
    ['a LINE verify response with Infinity expiry', [json(supabaseUser()), responseLikeJson({ client_id: 'line-channel', expires_in: Infinity })], 2],
    ['a LINE verify response with NaN expiry', [json(supabaseUser()), responseLikeJson({ client_id: 'line-channel', expires_in: Number.NaN })], 2],
    ['a LINE verify Channel mismatch', [json(supabaseUser()), json({ client_id: 'another-channel', expires_in: 3600 })], 2],
    ['a LINE verify Channel value with extra whitespace', [json(supabaseUser()), json({ client_id: 'line-channel ', expires_in: 3600 })], 2],
    ['a non-success LINE userinfo response', [json(supabaseUser()), json({ client_id: 'line-channel', expires_in: 3600 }), json({}, 401)], 3],
    ['a rejected LINE userinfo fetch', [json(supabaseUser()), json({ client_id: 'line-channel', expires_in: 3600 }), () => Promise.reject(new Error('provider-token failed'))], 3],
    ['malformed LINE userinfo JSON', [json(supabaseUser()), json({ client_id: 'line-channel', expires_in: 3600 }), invalidJson()], 3],
    ['a LINE userinfo response without sub', [json(supabaseUser()), json({ client_id: 'line-channel', expires_in: 3600 }), json({ name: 'LINE member' })], 3],
    ['a LINE userinfo response with an empty sub', [json(supabaseUser()), json({ client_id: 'line-channel', expires_in: 3600 }), json({ sub: '' })], 3],
    ['a LINE userinfo response with a non-string sub', [json(supabaseUser()), json({ client_id: 'line-channel', expires_in: 3600 }), json({ sub: 7 })], 3],
    ['a LINE userinfo identity mismatch', [json(supabaseUser()), json({ client_id: 'line-channel', expires_in: 3600 }), json({ sub: 'another-user' })], 3],
    ['a LINE userinfo identity value with extra whitespace', [json(supabaseUser()), json({ client_id: 'line-channel', expires_in: 3600 }), json({ sub: 'line-user-1 ' })], 3],
    ['a rejected LINE revoke fetch', [json(supabaseUser()), json({ client_id: 'line-channel', expires_in: 3600 }), json({ sub: 'line-user-1' }), () => Promise.reject(new Error('provider-token failed'))], 4],
    ['a non-success LINE revoke response', [json(supabaseUser()), json({ client_id: 'line-channel', expires_in: 3600 }), json({ sub: 'line-user-1' }), json({}, 400)], 4],
  ])('maps %s to a fixed 502 error and stops later LINE calls', async (_caseName, responses, expectedCalls) => {
    const fetcher = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const response = responses[fetcher.mock.calls.length - 1];
      return typeof response === 'function' ? response() : response;
    });
    const service = createLineLogout(supabaseConfig, lineConfig, fetcher as typeof fetch);

    await expect(service.logout('Bearer supabase-token', 'provider-token'))
      .rejects.toMatchObject(expectCode('LINE_PROVIDER_REQUEST_FAILED', 502));

    expect(fetcher).toHaveBeenCalledTimes(expectedCalls);
  });

  it('never exposes a rejected provider fetch message containing the provider token', async () => {
    const fetcher = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      if (fetcher.mock.calls.length === 1) return json(supabaseUser());
      return Promise.reject(new Error('upstream rejected provider-token due to private detail'));
    });
    const service = createLineLogout(supabaseConfig, lineConfig, fetcher as typeof fetch);

    const failure = await service.logout('Bearer supabase-token', 'provider-token').catch((error: unknown) => error);

    expect(failure).toMatchObject(expectCode('LINE_PROVIDER_REQUEST_FAILED', 502));
    expect(String(failure)).not.toContain('provider-token');
  });
});
