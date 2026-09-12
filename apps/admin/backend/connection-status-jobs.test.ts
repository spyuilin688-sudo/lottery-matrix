import { describe, expect, it } from 'vitest';
import { createConnectionStatus } from './connection-status';

const now = '2026-09-12T02:00:00Z';
const job = { job_name: 'matrix-fantasy5-refresh-v2', lottery: '天天樂', started_at: '2026-09-12T01:59:59Z', updated_at: '2026-09-12T01:59:59Z', finished_at: null, error: null };
const get = async (row: Record<string, unknown> | null) => {
  const result = await createConnectionStatus({
    supabase: { selectRows: async <T>() => (row ? [row] : []) as T[] },
    loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'private-service-key' }),
    getWorkerStatus: async () => ({ ok: true, health: { status: 'ok', service: 'matrix-api', version: 'test', database: { status: 'ok' }, adminApi: { status: 'ok' } }, jobs: { items: [] } }),
    fetcher: async () => Response.json({}),
    now: () => new Date(now),
  }).get();
  return result.items.find(item => item.id === 'cron-matrix-fantasy5-refresh-v2')!;
};

describe('crawler execution evidence', () => {
  it('preserves limited waiting evidence from a valid preliminary sorted card query', async () => {
    const result = await createConnectionStatus({
      supabase: { selectRows: async () => [] },
      loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'private-service-key' }),
      loadWorkerUrl: async () => 'https://worker.test',
      getWorkerStatus: async () => ({ ok: false, reason: 'RAILWAY_UNAVAILABLE', health: null, jobs: null }),
      fetcher: async (input) => {
        const path = new URL(String(input)).pathname;
        const lottery = decodeURIComponent(path.split('/').at(-1)!);
        if (path.includes('/cards/')) return Response.json({ lottery, period: '11997', cards: { sorted: { url: 'https://cards.test/sorted.png', mimeType: 'image/png' } } });
        if (path.includes('/latest/')) return Response.json({ item: { period: '11997', numbers: ['今彩539', '天天樂'].includes(lottery) ? ['01', '02', '03', '04', '05'] : ['01', '02', '03', '04', '05', '06', '07'], resultStatus: 'preliminary', drawOrderNumbers: null } });
        return Response.json({});
      },
    }).get();
    expect(result.items.find(item => item.id === 'railway-cards')).toMatchObject({ ok: true, checkEvidence: 'query', healthState: 'waiting', detail: { samples: expect.arrayContaining([expect.objectContaining({ lottery: '天天樂', waitingFor: 'official' })]) } });
  });

  it.each([
    ['fresh running', { ...job, status: 'running' }, true, 'running'],
    ['running at watchdog cutoff', { ...job, status: 'running', updated_at: '2026-09-12T01:40:00Z' }, true, 'running'],
    ['running with only start time', { ...job, status: 'running', updated_at: null }, true, 'running'],
    ['waiting for source', { ...job, status: 'waiting_source' }, true, 'waiting'],
    ['completed', { ...job, status: 'success', finished_at: now }, true, 'healthy'],
    ['unknown status', { ...job, status: 'idle' }, false, 'unknown'],
    ['missing history', null, false, 'unknown'],
    ['invalid heartbeat', { ...job, status: 'running', updated_at: 'invalid' }, false, 'unknown'],
    ['future heartbeat', { ...job, status: 'running', updated_at: '2026-09-12T02:01:00Z' }, false, 'unknown'],
  ])('keeps %s distinct from a failed execution', async (_label, row, ok, healthState) => {
    const item = await get(row);
    expect(item).toMatchObject({ ok, healthState });
    expect(item).not.toHaveProperty('error');
  });

  it.each([
    ['failed run', { ...job, status: 'failed' }],
    ['stuck run beyond watchdog cutoff', { ...job, status: 'running', updated_at: '2026-09-12T01:39:59Z' }],
    ['running with an explicit error', { ...job, status: 'running', error: 'private-database-error' }],
    ['waiting with an explicit error', { ...job, status: 'waiting_source', error: 'private-database-error' }],
  ])('keeps %s abnormal and redacts raw errors', async (_label, row) => {
    const item = await get(row);
    expect(item).toMatchObject({ ok: false, healthState: 'failed', error: expect.any(String) });
    expect(JSON.stringify(item)).not.toContain('private-database-error');
  });
});
