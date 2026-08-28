import { describe, expect, it } from 'vitest';
import { createWorkerApi, getRailwayWorkerUrl } from './worker-api';


describe('Railway worker status adapter', () => {
  it('loads and normalizes the Railway URL before reading health and jobs', async () => {
    const urls: string[] = [];
    const api = createWorkerApi(
      async () => 'https://railway.example/',
      async (input) => {
        urls.push(String(input));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    );

    await expect(api.getWorkerStatus()).resolves.toMatchObject({ ok: true });
    expect(urls).toEqual([
      'https://railway.example/health',
      'https://railway.example/jobs/status',
    ]);
  });

  it('returns unavailable without throwing when Railway cannot be reached', async () => {
    const api = createWorkerApi(
      async () => 'https://railway.example',
      async () => { throw new Error('offline'); },
    );

    await expect(api.getWorkerStatus()).resolves.toEqual({
      ok: false,
      health: null,
      jobs: null,
    });
  });

  it('fails atomically when either Railway endpoint is unsuccessful', async () => {
    let call = 0;
    const api = createWorkerApi(
      async () => 'https://railway.example',
      async () => {
        call += 1;
        return new Response('{}', { status: call === 2 ? 503 : 200 });
      },
    );

    await expect(api.getWorkerStatus()).resolves.toEqual({
      ok: false,
      health: null,
      jobs: null,
    });
  });

  it('reads RAILWAY_WORKER_URL from AppDeploy secrets', async () => {
    const secretStore = {
      listSecretNames: async () => ['RAILWAY_WORKER_URL'],
      readSecret: async (name: string) => name === 'RAILWAY_WORKER_URL' ? 'https://railway.example/' : '',
    };

    await expect(getRailwayWorkerUrl(secretStore)).resolves.toBe('https://railway.example');
  });

  it('rejects missing Railway configuration', async () => {
    const secretStore = {
      listSecretNames: async () => [],
      readSecret: async () => '',
    };

    await expect(getRailwayWorkerUrl(secretStore)).rejects.toThrow('RAILWAY_WORKER_URL_MISSING');
  });
});
