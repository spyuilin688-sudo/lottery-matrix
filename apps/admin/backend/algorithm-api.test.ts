import { describe, expect, it } from 'vitest';
import { createAlgorithmApi } from './algorithm-api';

describe('algorithm status adapter', () => {
  it('reads only the four approved status endpoints', async () => {
    const paths: string[] = [];
    const api = createAlgorithmApi(async (input) => {
      paths.push(new URL(String(input)).pathname);
      return new Response('{}', { status: 200 });
    });

    await expect(api.getAlgorithmStatus()).resolves.toMatchObject({ ok: true });
    expect(paths).toEqual([
      '/api/_healthcheck',
      '/api/matrix/coverage',
      '/api/matrix/audit',
      '/api/matrix/algorithm/cases',
    ]);
  });

  it('returns an unavailable status without throwing', async () => {
    const api = createAlgorithmApi(async () => { throw new Error('offline'); });
    await expect(api.getAlgorithmStatus()).resolves.toEqual({
      ok: false,
      health: null,
      coverage: null,
      audit: null,
      cases: null,
    });
  });

  it('fails the status atomically when any endpoint is non-successful', async () => {
    let call = 0;
    const api = createAlgorithmApi(async () => {
      call += 1;
      return new Response('{}', { status: call === 3 ? 500 : 200 });
    });
    await expect(api.getAlgorithmStatus()).resolves.toMatchObject({
      ok: false,
      health: null,
      coverage: null,
    });
  });
});
