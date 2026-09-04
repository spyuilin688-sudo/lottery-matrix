import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_REQUEST_TIMEOUT_MS } from './lib/api-resilience';
import { createMatrixApiClient, MatrixApiError } from './matrix-api-client';

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('authenticated Matrix API client', () => {
  it('applies the one total deadline while acquiring the Supabase access token', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn();
    const client = createMatrixApiClient(
      () => new Promise<string | null>(() => undefined),
      fetcher,
      'https://api.test',
    );
    let settled = false;
    let failure: unknown;

    void client.fetchJson('/result').then(
      () => { settled = true; },
      (error: unknown) => {
        settled = true;
        failure = error;
      },
    );
    await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);

    expect(failure).toMatchObject({
      code: 'REQUEST_TIMEOUT',
      status: 0,
      retryable: true,
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      message: 'REQUEST_TIMEOUT',
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the one total deadline through body delivery and cancels a stalled body', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(new Response(
      new ReadableStream<Uint8Array>({ cancel }),
      { headers: { 'content-type': 'application/json' } },
    ));
    const client = createMatrixApiClient(async () => 'token', fetcher, 'https://api.test');
    let settled = false;
    let failure: unknown;

    void client.fetchJson('/result').then(
      () => { settled = true; },
      (error: unknown) => {
        settled = true;
        failure = error;
      },
    );
    await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);

    expect(failure).toMatchObject({
      code: 'REQUEST_TIMEOUT',
      status: 0,
      retryable: true,
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      message: 'REQUEST_TIMEOUT',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('adds the current Supabase access token', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      jsonResponse({ ok: true })
    ));
    const client = createMatrixApiClient(async () => 'access-token', fetcher, 'https://api.test');

    await client.fetchJson('/api/matrix/status/summary');

    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.test/api/matrix/status/summary');
    expect(headers.get('Authorization')).toBe('Bearer access-token');
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('X-Request-ID')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('preserves a valid caller request id across a safe retry', async () => {
    const requestId = '123e4567-e89b-42d3-a456-426614174000';
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'temporary' } }, 503))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const client = createMatrixApiClient(async () => 'token', fetcher, 'https://api.test');

    await client.fetchJson('/result', { headers: { 'X-Request-ID': requestId } });

    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [, init] of fetcher.mock.calls) {
      expect(new Headers(init?.headers).get('X-Request-ID')).toBe(requestId);
    }
  });

  it('does not retry a mutation and marks its transient response as non-retryable', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'temporary' } }, 503));
    const client = createMatrixApiClient(async () => 'token', fetcher, 'https://api.test');

    await expect(client.fetchJson('/mutate', { method: 'POST' })).rejects.toMatchObject({
      code: 'API_ERROR',
      status: 503,
      retryable: false,
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('maps the shared deadline to a fixed retryable Matrix error', async () => {
    vi.useFakeTimers();
    const client = createMatrixApiClient(
      async () => 'token',
      async () => new Promise<Response>(() => undefined),
      'https://api.test',
    );
    const result = client.fetchJson('/result');
    const rejection = expect(result).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
      status: 0,
      retryable: true,
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      message: 'REQUEST_TIMEOUT',
    });

    await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS);

    await rejection;
  });

  it('maps caller cancellation to a fixed non-retryable Matrix error', async () => {
    const controller = new AbortController();
    const client = createMatrixApiClient(
      async () => 'token',
      async () => new Promise<Response>(() => undefined),
      'https://api.test',
    );
    const result = client.fetchJson('/result', { signal: controller.signal });

    controller.abort(new Error('private caller reason'));

    await expect(result).rejects.toMatchObject({
      code: 'REQUEST_ABORTED',
      status: 0,
      retryable: false,
      message: 'REQUEST_ABORTED',
    });
  });

  it('rejects before fetch when no session exists', async () => {
    const fetcher = vi.fn();
    const client = createMatrixApiClient(async () => null, fetcher, 'https://api.test');

    await expect(client.fetchJson('/api/matrix/status/summary')).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      status: 401,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('allows an anonymous request when authentication is optional', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ ok: true }));
    const client = createMatrixApiClient(async () => null, fetcher, 'https://api.test');

    await client.fetchJson('/api/matrix/explore', {}, { auth: 'optional' });

    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.get('Authorization')).toBeNull();
  });

  it('still sends the current token on an optional authenticated request', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ ok: true }));
    const client = createMatrixApiClient(async () => 'access-token', fetcher, 'https://api.test');

    await client.fetchJson('/api/matrix/explore', {}, { auth: 'optional' });

    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.get('Authorization')).toBe('Bearer access-token');
  });

  it.each([
    [401, 'AUTH_REQUIRED'],
    [403, 'FORBIDDEN'],
    [404, 'ANALYSIS_NOT_READY'],
    [409, 'ANALYSIS_VERSION_MISMATCH'],
  ] as const)('maps HTTP %s to %s', async (status, code) => {
    const client = createMatrixApiClient(
      async () => 'token',
      async () => jsonResponse({ error: code }, status),
      'https://api.test',
    );

    await expect(client.fetchJson('/result')).rejects.toMatchObject({ code, status });
  });

  it('preserves a recognized API error code', async () => {
    const fetcher = vi.fn();
    fetcher.mockResolvedValue(new Response(
      JSON.stringify({ error: { code: 'LINE_IDENTITY_CONFLICT' } }),
      { status: 409, headers: { 'content-type': 'application/json' } },
    ));
    const client = createMatrixApiClient(async () => 'token', fetcher, 'https://api.test');

    await expect(client.fetchJson('/api/member/bootstrap', { method: 'POST' }))
      .rejects.toMatchObject({ status: 409, code: 'LINE_IDENTITY_CONFLICT' });
  });

  it('falls back when a non-JSON media type merely mentions application/json', async () => {
    const client = createMatrixApiClient(
      async () => 'token',
      async () => new Response(JSON.stringify({ error: { code: 'LINE_IDENTITY_CONFLICT' } }), {
        status: 409,
        headers: { 'content-type': 'text/plain; note=application/json' },
      }),
      'https://api.test',
    );

    await expect(client.fetchJson('/api/member/bootstrap', { method: 'POST' }))
      .rejects.toMatchObject({ status: 409, code: 'ANALYSIS_VERSION_MISMATCH' });
  });

  it('preserves a recognized API error code from an application/*+json response', async () => {
    const client = createMatrixApiClient(
      async () => 'token',
      async () => new Response(JSON.stringify({ error: { code: 'LINE_IDENTITY_CONFLICT' } }), {
        status: 409,
        headers: { 'content-type': 'application/problem+json; charset=utf-8' },
      }),
      'https://api.test',
    );

    await expect(client.fetchJson('/api/member/bootstrap', { method: 'POST' }))
      .rejects.toMatchObject({ status: 409, code: 'LINE_IDENTITY_CONFLICT' });
  });

  it.each([
    ['an unknown JSON error code', jsonResponse({ error: { code: 'UNKNOWN_REMOTE_CODE_PRIVATE_BODY' } }, 409), 409, 'ANALYSIS_VERSION_MISMATCH'],
    ['a JSON error code paired with the wrong status', jsonResponse({ error: { code: 'LINE_IDENTITY_REQUIRED' } }, 409), 409, 'ANALYSIS_VERSION_MISMATCH'],
    ['malformed JSON', new Response('MALFORMED_PRIVATE_BODY', { status: 409, headers: { 'content-type': 'application/json' } }), 409, 'ANALYSIS_VERSION_MISMATCH'],
    ['a non-JSON response body', new Response('NON_JSON_PRIVATE_BODY', { status: 502, headers: { 'content-type': 'text/plain' } }), 502, 'API_ERROR'],
  ] as const)('falls back for %s without exposing the response body', async (_caseName, response, status, code) => {
    const client = createMatrixApiClient(async () => 'token', async () => response, 'https://api.test');

    try {
      await client.fetchJson('/api/member/bootstrap', { method: 'POST' });
      throw new Error('expected API client to reject');
    } catch (error) {
      expect(error).toMatchObject({ status, code });
      expect((error as Error).message).not.toContain('PRIVATE_BODY');
    }
  });

  it('rejects non-JSON success responses', async () => {
    const client = createMatrixApiClient(
      async () => 'token',
      async () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
      'https://api.test',
    );

    await expect(client.fetchJson('/result')).rejects.toBeInstanceOf(MatrixApiError);
    await expect(client.fetchJson('/result')).rejects.toMatchObject({ code: 'NON_JSON_RESPONSE' });
  });

  it('maps a fetch rejection to a network error', async () => {
    const client = createMatrixApiClient(
      async () => 'token',
      async () => { throw new Error('offline'); },
      'https://api.test',
    );

    await expect(client.fetchJson('/result')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      retryable: true,
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });
});
