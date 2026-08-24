import { describe, expect, it, vi } from 'vitest';
import { createMatrixApiClient, MatrixApiError } from './matrix-api-client';

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('authenticated Matrix API client', () => {
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

    await expect(client.fetchJson('/result')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
