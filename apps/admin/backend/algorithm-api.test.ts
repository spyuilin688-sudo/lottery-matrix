import { describe, expect, it } from 'vitest';
import { createAlgorithmApi } from './algorithm-api';

describe('algorithm status compatibility adapter', () => {
  it('reads Railway health and jobs from the configured URL', async () => {
    const urls: string[] = [];
    const api = createAlgorithmApi(
      async (input) => {
        urls.push(String(input));
        return new Response('{}', { status: 200 });
      },
      async () => 'https://railway.example/',
    );

    await expect(api.getAlgorithmStatus()).resolves.toEqual({
      ok: true,
      health: {},
      jobs: {},
    });
    expect(urls).toEqual([
      'https://railway.example/health',
      'https://railway.example/jobs/status',
    ]);
  });

  it('returns unavailable without throwing', async () => {
    const api = createAlgorithmApi(
      async () => { throw new Error('offline'); },
      async () => 'https://railway.example',
    );

    await expect(api.getAlgorithmStatus()).resolves.toEqual({
      ok: false,
      health: null,
      jobs: null,
    });
  });
});
