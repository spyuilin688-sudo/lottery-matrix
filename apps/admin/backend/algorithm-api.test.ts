import { describe, expect, it } from 'vitest';
import { createAlgorithmApi } from './algorithm-api';


describe('algorithm status adapter', () => {
  it('reads Railway health and job status from the configured URL', async () => {
    const urls: string[] = [];
    const api = createAlgorithmApi(
      async () => 'https://railway.example/',
      async (input) => {
        urls.push(String(input));
        return new Response('{}', { status: 200 });
      },
    );

    await expect(api.getAlgorithmStatus()).resolves.toMatchObject({
      ok: true,
      coverage: null,
      audit: null,
      cases: null,
    });
    expect(urls).toEqual([
      'https://railway.example/health',
      'https://railway.example/jobs/status',
    ]);
  });

  it('returns an unavailable status without throwing', async () => {
    const api = createAlgorithmApi(
      async () => 'https://railway.example',
      async () => { throw new Error('offline'); },
    );
    await expect(api.getAlgorithmStatus()).resolves.toEqual({
      ok: false,
      health: null,
      jobs: null,
      coverage: null,
      audit: null,
      cases: null,
    });
  });

  it('fails the status atomically when any endpoint is non-successful', async () => {
    let call = 0;
    const api = createAlgorithmApi(
      async () => 'https://railway.example',
      async () => {
        call += 1;
        return new Response('{}', { status: call === 2 ? 500 : 200 });
      },
    );
    await expect(api.getAlgorithmStatus()).resolves.toMatchObject({
      ok: false,
      health: null,
      jobs: null,
    });
  });
});
