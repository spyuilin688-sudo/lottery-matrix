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
