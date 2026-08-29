import { describe, expect, it } from 'vitest';
import { createAlgorithmApi } from './algorithm-api';

describe('algorithm status adapter', () => {
  it('reads only the four approved status endpoints', async () => {
    const urls: string[] = [];
    const api = createAlgorithmApi(async (input) => {
      const url = String(input);
      urls.push(url);
      return new Response(JSON.stringify({ source: url.split('/').at(-1) }), {
        status: 200,
      });
    });

    await expect(api.getAlgorithmStatus()).resolves.toEqual({
      ok: true,
      health: { source: '_healthcheck' },
      coverage: { source: 'coverage' },
      audit: { source: 'audit' },
      cases: { source: 'cases' },
    });
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

  it('fails atomically when any approved endpoint is unsuccessful', async () => {
    let call = 0;
    const api = createAlgorithmApi(async () => {
      call += 1;
      return new Response('{}', { status: call === 3 ? 500 : 200 });
    });
    await expect(api.getAlgorithmStatus()).resolves.toEqual({
      ok: false,
      health: null,
      coverage: null,
      audit: null,
      cases: null,
    });
  });
});
