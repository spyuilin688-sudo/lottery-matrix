import { describe, expect, it } from 'vitest';
import { apiStatusInventory } from './api-status-inventory';
import { createConnectionStatus } from './connection-status';
import { createWorkerApi } from './worker-api';

const jobNames = {
  '今彩539': 'matrix-539-refresh-v2',
  '天天樂': 'matrix-fantasy5-refresh-v2',
  '六合彩': 'matrix-marksix-refresh-v2',
  '大樂透': 'matrix-649-refresh-v2',
} as const;

const items = Object.entries(jobNames).map(([lottery, jobName]) => ({
  lottery,
  jobName,
  job: null,
  latestDraw: null,
  latestAnalysis: null,
}));

const health = {
  status: 'ok' as const,
  service: 'matrix-railway-api',
  version: 'test',
  database: { status: 'ok' as const },
  adminApi: { status: 'ok' as const },
};

const tinyfish = {
  configured: true,
  fetchEnabled: true,
  browserEnabled: false,
  browserMaxDurationSeconds: 60,
  lastFallbacks: [{
    lottery: '今彩539',
    status: 'success' as const,
    finishedAt: '2026-09-15T17:50:00+00:00',
    sourcePeriod: '115000224',
    error: null,
  }],
};

describe('TinyFish administrator status', () => {
  it('registers TinyFish as a first-class API status location', () => {
    expect(apiStatusInventory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'tinyfish-fallback',
        name: 'TinyFish 備援抓取',
        location: 'TinyFish',
        checkMode: 'service',
      }),
    ]));
  });

  it('preserves the TinyFish status returned by the protected Railway jobs API', async () => {
    const api = createWorkerApi(
      async () => ({ baseUrl: 'https://worker.test', statusToken: 'status-token' }),
      (async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input)).pathname;
        if (pathname === '/health') return Response.json(health);
        if (pathname === '/jobs/status') return Response.json({ items, tinyfish });
        return new Response(null, { status: 404 });
      }) as typeof fetch,
    );

    const status = await api.getStatus();
    expect(status).toMatchObject({
      ok: true,
      jobs: { tinyfish },
    });
  });

  it('shows configured Fetch with no use history as waiting rather than failed', async () => {
    const result = await createConnectionStatus({
      supabase: { selectRows: async () => [] },
      loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'private-service-key' }),
      getWorkerStatus: async () => ({
        ok: true,
        health,
        jobs: {
          items: [],
          tinyfish: { ...tinyfish, lastFallbacks: [] },
        },
      } as never),
      fetcher: async () => Response.json({}),
      now: () => new Date('2026-09-15T18:00:00Z'),
    }).get();

    const item = result.items.find((candidate) => candidate.id === 'tinyfish-fallback');
    expect(item).toMatchObject({
      ok: true,
      healthState: 'waiting',
      checkEvidence: 'reported',
      detail: {
        configured: true,
        fetchEnabled: true,
        browserEnabled: false,
        browserMaxDurationSeconds: 60,
        lastFallbacks: [],
      },
    });
    expect(JSON.stringify(item)).not.toContain('private-tinyfish-secret');
  });
});
