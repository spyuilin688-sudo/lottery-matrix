import { describe, expect, it } from 'vitest';
import { createWorkerApi } from './worker-api';

describe('Railway worker status adapter', () => {
  it('normalizes the configured URL and reads health plus job status', async () => {
    const urls: string[] = [];
    const api = createWorkerApi(
      async () => 'https://railway.example/',
      async (input) => {
        urls.push(String(input));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    );

    await expect(api.getStatus()).resolves.toMatchObject({ ok: true });
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

    await expect(api.getStatus()).resolves.toEqual({
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

    await expect(api.getStatus()).resolves.toEqual({
      ok: false,
      health: null,
      jobs: null,
    });
  });

  it('does not issue a request when the Railway URL is missing', async () => {
    let calls = 0;
    const api = createWorkerApi(
      async () => '',
      async () => {
        calls += 1;
        return new Response('{}', { status: 200 });
      },
    );

    await expect(api.getStatus()).resolves.toEqual({
      ok: false,
      health: null,
      jobs: null,
    });
    expect(calls).toBe(0);
  });
});
