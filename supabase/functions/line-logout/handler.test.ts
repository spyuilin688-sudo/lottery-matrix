import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLineLogoutHandler } from './handler';

const user = {
  identities: [{ provider: 'custom:line', provider_id: 'line-user-id' }],
};

const allowedOrigins = [
  'https://matrix-un0kjz.v2.appdeploy.ai',
  'https://matrixlottery.idv.tw',
] as const;

function request(
  body: unknown,
  authorization = 'Bearer supabase-user-jwt',
  options: {
    method?: string;
    origin?: string | null;
    requestId?: string;
    signal?: AbortSignal;
  } = {},
) {
  const method = options.method ?? 'POST';
  const headers = new Headers({
    Authorization: authorization,
    'Content-Type': 'application/json',
  });
  if (options.origin !== null) {
    headers.set('Origin', options.origin ?? allowedOrigins[1]);
  }
  if (options.requestId) headers.set('X-Request-ID', options.requestId);
  return new Request('https://project.supabase.co/functions/v1/line-logout', {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body) : undefined,
    signal: options.signal,
  });
}

function streamingRequest(
  body: ReadableStream<Uint8Array>,
  requestId: string,
) {
  return new Request('https://project.supabase.co/functions/v1/line-logout', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer supabase-user-jwt',
      'Content-Type': 'application/json',
      Origin: allowedOrigins[1],
      'X-Request-ID': requestId,
    },
    body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

function validFetcher() {
  return vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ client_id: 'channel-id', expires_in: 3600 }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ sub: 'line-user-id' }), { status: 200 }))
    .mockResolvedValueOnce(new Response('', { status: 200 }));
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('LINE logout Edge Function handler', () => {
  it('verifies the LINE channel and user identity before revoke', async () => {
    const fetcher = validFetcher();
    const getUser = vi.fn().mockResolvedValue(user);
    const handler = createLineLogoutHandler({
      getUser,
      getLineConfig: () => ({ channelId: 'channel-id', channelSecret: 'channel-secret' }),
      fetcher,
    });

    const response = await handler(request({ providerAccessToken: 'provider-token' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(allowedOrigins[1]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('/oauth2/v2.1/verify?access_token=provider-token');
    expect(String(fetcher.mock.calls[1]?.[0])).toContain('/oauth2/v2.1/userinfo');
    expect(String(fetcher.mock.calls[2]?.[0])).toContain('/oauth2/v2.1/revoke');
    expect(String(fetcher.mock.calls[2]?.[1]?.body)).toContain('client_secret=channel-secret');
    expect(getUser.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
    for (const call of fetcher.mock.calls) {
      expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
    }
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
    await expect(response.json()).resolves.toEqual({
      error: { code: 'LINE_PROVIDER_TOKEN_REQUIRED' },
      requestId: response.headers.get('X-Request-ID'),
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('records semantic LINE mismatches as an error at the owning stage', async () => {
    const cases = [
      {
        stage: 'verify',
        responses: [{ client_id: 'different-channel', expires_in: 3600 }],
        expectedCalls: 1,
      },
      {
        stage: 'verify',
        responses: [{ client_id: 'channel-id', expires_in: 0 }],
        expectedCalls: 1,
      },
      {
        stage: 'userinfo',
        responses: [
          { client_id: 'channel-id', expires_in: 3600 },
          { sub: 'different-line-user' },
        ],
        expectedCalls: 2,
      },
    ] as const;

    for (const mismatch of cases) {
      const records: Array<Record<string, unknown>> = [];
      const fetcher = vi.fn();
      for (const response of mismatch.responses) {
        fetcher.mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 200 }));
      }
      const handler = createLineLogoutHandler({
        getUser: vi.fn().mockResolvedValue(user),
        getLineConfig: () => ({ channelId: 'channel-id', channelSecret: 'channel-secret' }),
        fetcher,
        logger: (record: Record<string, unknown>) => records.push(record),
      });

      const response = await handler(request({ providerAccessToken: 'provider-token' }));

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({
        error: { code: 'LINE_PROVIDER_REQUEST_FAILED' },
        requestId: response.headers.get('X-Request-ID'),
      });
      expect(fetcher).toHaveBeenCalledTimes(mismatch.expectedCalls);
      expect(records.filter((record) => record.stage === mismatch.stage)).toEqual([
        {
          version: 1,
          requestId: expect.any(String),
          stage: mismatch.stage,
          outcome: 'error',
          durationMs: expect.any(Number),
          code: 'LINE_PROVIDER_REQUEST_FAILED',
        },
      ]);
      for (const record of records) {
        expect(Object.keys(record).sort()).toEqual([
          'code',
          'durationMs',
          'outcome',
          'requestId',
          'stage',
          'version',
        ]);
      }
    }
  });

  it.each([
    ['auth', 401, 'AUTH_REQUIRED'],
    ['verify', 502, 'LINE_PROVIDER_REQUEST_FAILED'],
    ['userinfo', 502, 'LINE_PROVIDER_REQUEST_FAILED'],
    ['revoke', 502, 'LINE_PROVIDER_REQUEST_FAILED'],
  ] as const)('aborts a stalled %s stage at exactly 5,000ms', async (stalledStage, status, code) => {
    vi.useFakeTimers();
    let stalledSignal: AbortSignal | undefined;
    const neverUnlessAborted = (signal: AbortSignal | undefined) => {
      stalledSignal = signal;
      if (!signal) return Promise.reject(new Error('MISSING_ABORT_SIGNAL'));
      return new Promise<never>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('private upstream timeout detail')), { once: true });
      });
    };
    const getUser = vi.fn((_authorization: string, signal?: AbortSignal) => (
      stalledStage === 'auth' ? neverUnlessAborted(signal) : Promise.resolve(user)
    ));
    const stageResponses: Record<'verify' | 'userinfo' | 'revoke', Response> = {
      verify: new Response(JSON.stringify({ client_id: 'channel-id', expires_in: 3600 }), { status: 200 }),
      userinfo: new Response(JSON.stringify({ sub: 'line-user-id' }), { status: 200 }),
      revoke: new Response('', { status: 200 }),
    };
    const lineStages = ['verify', 'userinfo', 'revoke'] as const;
    let fetchIndex = 0;
    const fetcher = vi.fn((_input: URL, init?: RequestInit) => {
      const stage = lineStages[fetchIndex++];
      return stage === stalledStage
        ? neverUnlessAborted(init?.signal ?? undefined)
        : Promise.resolve(stageResponses[stage]);
    });
    const handler = createLineLogoutHandler({
      getUser,
      getLineConfig: () => ({ channelId: 'channel-id', channelSecret: 'channel-secret' }),
      fetcher,
    });

    let settled = false;
    const responsePromise = handler(request({ providerAccessToken: 'provider-token' }))
      .then((response) => {
        settled = true;
        return response;
      });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const response = await responsePromise;

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({
      error: { code },
      requestId: response.headers.get('X-Request-ID'),
    });
    expect(stalledSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a never-ending request body at 5,000ms with one safe terminal log', async () => {
    vi.useFakeTimers();
    const callerRequestId = '123e4567-e89b-42d3-a456-426614174000';
    const cancel = vi.fn();
    const edgeRequest = streamingRequest(new ReadableStream<Uint8Array>({ cancel }), callerRequestId);
    const removeListener = vi.spyOn(edgeRequest.signal, 'removeEventListener');
    const records: Array<Record<string, unknown>> = [];
    const fetcher = vi.fn();
    const handler = createLineLogoutHandler({
      getUser: vi.fn().mockResolvedValue(user),
      getLineConfig: () => ({ channelId: 'channel-id', channelSecret: 'channel-secret' }),
      fetcher,
      logger: (record: Record<string, unknown>) => records.push(record),
    });
    let settled = false;
    let response: Response | undefined;

    void handler(edgeRequest).then((value) => {
      settled = true;
      response = value;
    });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);

    expect(settled).toBe(true);
    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toEqual({
      error: { code: 'LINE_PROVIDER_TOKEN_REQUIRED' },
      requestId: callerRequestId,
    });
    expect(response?.headers.get('X-Request-ID')).toBe(callerRequestId);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetcher).not.toHaveBeenCalled();
    expect(records.filter((record) => record.outcome === 'error')).toEqual([{
      version: 1,
      requestId: callerRequestId,
      stage: 'request',
      outcome: 'error',
      durationMs: 5_000,
      code: 'LINE_PROVIDER_TOKEN_REQUIRED',
    }]);
    expect(records.at(-1)).toMatchObject({ stage: 'request', outcome: 'error' });
    const serialized = JSON.stringify(records);
    expect(serialized).not.toContain('supabase-user-jwt');
    expect(serialized).not.toContain('channel-secret');
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts the active stage when the caller disconnects and clears its deadline', async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    let authSignal: AbortSignal | undefined;
    const handler = createLineLogoutHandler({
      getUser: vi.fn((_authorization: string, signal: AbortSignal) => {
        authSignal = signal;
        return new Promise<never>(() => undefined);
      }),
      getLineConfig: () => ({ channelId: 'channel-id', channelSecret: 'channel-secret' }),
      fetcher: vi.fn(),
    });
    const edgeRequest = request(
      { providerAccessToken: 'provider-token' },
      'Bearer supabase-user-jwt',
      { signal: caller.signal },
    );
    const removeListener = vi.spyOn(edgeRequest.signal, 'removeEventListener');
    const responsePromise = handler(edgeRequest);
    await vi.advanceTimersByTimeAsync(0);

    caller.abort(new Error('private caller reason'));
    const response = await responsePromise;

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'AUTH_REQUIRED' },
      requestId: response.headers.get('X-Request-ID'),
    });
    expect(authSignal?.aborted).toBe(true);
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears every stage deadline and caller listener after success', async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    const handler = createLineLogoutHandler({
      getUser: vi.fn().mockResolvedValue(user),
      getLineConfig: () => ({ channelId: 'channel-id', channelSecret: 'channel-secret' }),
      fetcher: validFetcher(),
    });

    const edgeRequest = request(
      { providerAccessToken: 'provider-token' },
      'Bearer supabase-user-jwt',
      { signal: caller.signal },
    );
    const removeListener = vi.spyOn(edgeRequest.signal, 'removeEventListener');
    const response = await handler(edgeRequest);

    expect(response.status).toBe(200);
    expect(removeListener).toHaveBeenCalledTimes(5);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retains one valid request id through logs and the success response', async () => {
    const callerRequestId = '123e4567-e89b-42d3-a456-426614174000';
    const records: Array<Record<string, unknown>> = [];
    const handler = createLineLogoutHandler({
      getUser: vi.fn().mockResolvedValue(user),
      getLineConfig: () => ({ channelId: 'channel-id', channelSecret: 'channel-secret' }),
      fetcher: validFetcher(),
      logger: (record: Record<string, unknown>) => records.push(record),
    });

    const response = await handler(request(
      { providerAccessToken: 'provider-token' },
      'Bearer supabase-user-jwt',
      { requestId: callerRequestId },
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Request-ID')).toBe(callerRequestId);
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((record) => record.requestId === callerRequestId)).toBe(true);
  });

  it.each([undefined, 'not-a-uuid'])('generates a UUID response id for caller id %s', async (callerRequestId) => {
    const handler = createLineLogoutHandler({
      getUser: vi.fn().mockResolvedValue(user),
      getLineConfig: () => ({ channelId: 'channel-id', channelSecret: 'channel-secret' }),
      fetcher: vi.fn(),
    });

    const response = await handler(request(
      {},
      'Bearer supabase-user-jwt',
      callerRequestId ? { requestId: callerRequestId } : {},
    ));
    const payload = await response.json() as { requestId: string };

    expect(response.status).toBe(400);
    expect(payload.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(response.headers.get('X-Request-ID')).toBe(payload.requestId);
  });

  it('emits only allowlisted structured fields and fixed values on an upstream failure', async () => {
    vi.useFakeTimers();
    const records: Array<Record<string, unknown>> = [];
    const fetcher = vi.fn().mockRejectedValue(
      new Error('provider-token supabase-user-jwt line-user-id channel-secret private body'),
    );
    const handler = createLineLogoutHandler({
      getUser: vi.fn().mockResolvedValue(user),
      getLineConfig: () => ({ channelId: 'channel-id', channelSecret: 'channel-secret' }),
      fetcher,
      logger: (record: Record<string, unknown>) => records.push(record),
    });

    const response = await handler(request({ providerAccessToken: 'provider-token' }));

    expect(response.status).toBe(502);
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(Object.keys(record).sort()).toEqual([
        'code',
        'durationMs',
        'outcome',
        'requestId',
        'stage',
        'version',
      ]);
      expect(record.durationMs).toEqual(expect.any(Number));
      expect(['OK', 'AUTH_REQUIRED', 'LINE_PROVIDER_REQUEST_FAILED']).toContain(record.code);
    }
    const serialized = JSON.stringify(records);
    for (const sensitive of [
      'provider-token',
      'supabase-user-jwt',
      'line-user-id',
      'channel-secret',
      'private body',
    ]) {
      expect(serialized).not.toContain(sensitive);
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(allowedOrigins)('allows preflight and reflects only allowlisted origin %s', async (origin) => {
    const handler = createLineLogoutHandler({
      getUser: vi.fn(),
      getLineConfig: () => ({ channelId: '', channelSecret: '' }),
    });

    const response = await handler(request({}, '', { method: 'OPTIONS', origin }));

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(response.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
    expect(response.headers.get('X-Request-ID')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it.each(['OPTIONS', 'POST'])('rejects an unknown origin on %s without reflecting it', async (method) => {
    const handler = createLineLogoutHandler({
      getUser: vi.fn(),
      getLineConfig: () => ({ channelId: '', channelSecret: '' }),
    });

    const response = await handler(request({}, '', {
      method,
      origin: 'https://attacker.example',
    }));
    const payload = await response.json() as { error: { code: string }; requestId: string };

    expect(response.status).toBe(403);
    expect(payload).toEqual({
      error: { code: 'ORIGIN_NOT_ALLOWED' },
      requestId: response.headers.get('X-Request-ID'),
    });
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
    expect(JSON.stringify(payload)).not.toContain('attacker.example');
  });

  it('allows a server invocation without Origin and never returns wildcard CORS', async () => {
    const handler = createLineLogoutHandler({
      getUser: vi.fn().mockResolvedValue(user),
      getLineConfig: () => ({ channelId: 'channel-id', channelSecret: 'channel-secret' }),
      fetcher: validFetcher(),
    });

    const response = await handler(request(
      { providerAccessToken: 'provider-token' },
      'Bearer supabase-user-jwt',
      { origin: null },
    ));

    expect(response.status).toBe(200);
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
  });
});
