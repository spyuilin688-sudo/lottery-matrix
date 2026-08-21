import { describe, expect, it } from 'vitest';
import { createAlgorithmApi } from './algorithm-api';

describe('algorithm status adapter', () => {
  it('reads only the four approved status endpoints', async () => {
    const urls: string[] = [];
    const api = createAlgorithmApi(async (input) => {
      urls.push(String(input));
      return new Response('{}', { status: 200 });
    });

    await expect(api.getAlgorithmStatus()).resolves.toMatchObject({ ok: true });
    expect(urls).toEqual([
      'https://api-v2.appdeploy.ai/app/app-snsxet/api/_healthcheck',
      'https://api-v2.appdeploy.ai/app/app-snsxet/api/matrix/coverage',
      'https://api-v2.appdeploy.ai/app/app-snsxet/api/matrix/audit',
      'https://api-v2.appdeploy.ai/app/app-snsxet/api/matrix/algorithm/cases',
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
