import { describe, expect, it, vi } from 'vitest';
import { createConnectionStatus } from './connection-status';
import type { WorkerStatus } from './worker-api';

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const healthyWorkerStatus: WorkerStatus = {
  ok: true,
  health: {
    status: 'ok',
    service: 'matrix-railway-api',
    version: 'test-sha',
    database: { status: 'ok' },
  },
  jobs: { items: [] },
};

describe('connection status', () => {
  it('returns every current API with its location and endpoint plus the four jobs', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/rest/v1/')
      ? response({ paths: { '/rpc/redeem_activation_code': { post: {} } } })
      : response({ ok: true }));
    const supabase = {
      selectRows: vi.fn(async (table: string) => table === 'system_job_status' ? [{
        job_name: 'matrix-539-refresh-v2', lottery: '今彩539', status: 'success',
        started_at: '2026-08-21T02:00:00Z', finished_at: '2026-08-21T02:00:10Z', error: null,
      }] : [{ id: 'plan-1' }]),
    };
    const status = createConnectionStatus({
      supabase,
      loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'secret' }),
      fetcher,
      getWorkerStatus: async () => healthyWorkerStatus,
      now: () => new Date('2026-08-21T03:00:00Z'),
    });

    const result = await status.get();
    expect(result.items.find((item) => item.id === 'supabase-database')).toMatchObject({
      location: 'Supabase',
      endpoint: '/rest/v1/plans?select=id&limit=1',
      group: '系統',
      checkMode: 'live',
    });
    expect(result.items.find((item) => item.id === 'supabase-rpc-redeem_activation_code')).toMatchObject({
      ok: true,
      location: 'Supabase',
      endpoint: '/rest/v1/rpc/redeem_activation_code',
      checkMode: 'openapi',
    });
    expect(result.items).toHaveLength(38);
    expect(result.items.every((item) => item.location && item.endpoint && item.group)).toBe(true);
    expect(result.items.map((item) => item.id)).not.toEqual(expect.arrayContaining([
      'api-appdeploy',
      'health-api',
      'matrix-coverage-api',
      'matrix-audit-api',
      'matrix-algorithm-cases-api',
    ]));
    expect(fetcher).toHaveBeenCalledWith(
      'https://matrix-sanqwn.v2.appdeploy.ai/api/_healthcheck',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(fetcher.mock.calls.map(([input]) => String(input))).not.toEqual(
      expect.arrayContaining([expect.stringContaining('app-snsxet')]),
    );
  });

  it('rejects retries for removed legacy AppDeploy status items', async () => {
    const fetcher = vi.fn(async () => response({ ok: true }));
    const status = createConnectionStatus({
      supabase: { selectRows: vi.fn(async () => []) },
      loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'secret' }),
      fetcher,
      getWorkerStatus: async () => healthyWorkerStatus,
      now: () => new Date('2026-08-21T03:00:00Z'),
    });

    await expect(status.retry('matrix-audit-api')).rejects.toMatchObject({ statusCode: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects retry requests for non-API status items without making a request', async () => {
    const fetcher = vi.fn();
    const status = createConnectionStatus({
      supabase: { selectRows: vi.fn(async () => []) },
      loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'secret' }),
      fetcher,
      getWorkerStatus: async () => healthyWorkerStatus,
    });

    await expect(status.retry('supabase-database')).rejects.toMatchObject({ statusCode: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('includes a healthy Railway item with only the safe adapter detail', async () => {
    const getWorkerStatus = vi.fn(async () => healthyWorkerStatus);
    const status = createConnectionStatus({
      supabase: { selectRows: vi.fn(async () => []) },
      loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'secret' }),
      fetcher: vi.fn(async () => response({ ok: true })),
      getWorkerStatus,
      now: () => new Date('2026-08-21T03:00:00Z'),
    });
    const result = await status.get();
    expect(result.items).toHaveLength(38);
    expect(result.items.find((item) => item.id === 'railway-health')).toMatchObject({
      ok: true,
      retryable: true,
      detail: healthyWorkerStatus.health,
    });
  });

  it('does not treat a resolved unavailable object as healthy', async () => {
    const status = createConnectionStatus({
      supabase: { selectRows: vi.fn(async () => []) },
      loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'secret' }),
      fetcher: vi.fn(async () => response({ ok: true })),
      getWorkerStatus: async () => ({ ok: false, health: null, jobs: null }),
      now: () => new Date('2026-08-21T03:00:00Z'),
    });
    const result = await status.get();
    expect(result.items.find((item) => item.id === 'railway-health')).toMatchObject({
      ok: false,
      retryable: true,
      error: 'Railway Worker API 暫時無法使用',
    });
    expect(result.items.find((item) => item.id === 'railway-health')).not.toHaveProperty('detail');
  });

  it('retries only the Railway status adapter', async () => {
    const getWorkerStatus = vi.fn(async () => healthyWorkerStatus);
    const fetcher = vi.fn();
    const status = createConnectionStatus({
      supabase: { selectRows: vi.fn(async () => []) },
      loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'secret' }),
      fetcher,
      getWorkerStatus,
    });
    await expect(status.retry('railway-health')).resolves.toMatchObject({
      id: 'railway-health',
      ok: true,
      retryable: true,
    });
    expect(getWorkerStatus).toHaveBeenCalledTimes(1);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses only non-mutating status probes and never exposes configured secrets', async () => {
    const fetcher = vi.fn(async () => response({ paths: {} }));
    const status = createConnectionStatus({
      supabase: { selectRows: vi.fn(async () => []) },
      loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'raw-service-secret' }),
      fetcher,
      getWorkerStatus: async () => healthyWorkerStatus,
    });

    const result = await status.get();
    expect(fetcher.mock.calls.some(([input, init]) =>
      String(input).includes('/redeem_activation_code') && init?.method === 'POST')).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/raw-service-secret|serviceRoleKey|workerToken/);
  });

  it('projects existing cron rows without raw errors', async () => {
    const supabase = {
      selectRows: vi.fn(async (table: string) => table === 'system_job_status' ? [{
        job_name: 'matrix-539-refresh-v2',
        lottery: '今彩539',
        status: 'failed',
        started_at: '2026-08-21T02:00:00Z',
        finished_at: '2026-08-21T02:00:10Z',
        updated_at: '2026-08-21T02:00:10Z',
        error: 'password=raw-worker-secret',
        extra: 'raw-row-secret',
      }] : []),
    };
    const status = createConnectionStatus({
      supabase,
      loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'secret' }),
      fetcher: vi.fn(async () => response({ ok: true })),
      getWorkerStatus: async () => healthyWorkerStatus,
    });
    const result = await status.get();
    const item = result.items.find(
      (entry) => entry.id === 'cron-matrix-539-refresh-v2',
    );
    expect(item?.detail).toEqual({
      jobName: 'matrix-539-refresh-v2',
      lottery: '今彩539',
      status: 'failed',
      startedAt: '2026-08-21T02:00:00Z',
      finishedAt: '2026-08-21T02:00:10Z',
      finished_at: '2026-08-21T02:00:10Z',
      updatedAt: '2026-08-21T02:00:10Z',
      error: 'WORKER_FAILED',
      analysisStatus: null,
      analysisPhase: null,
      analysisDrawPeriod: null,
      analysisCompletedAt: null,
    });
    expect(item?.error).toBe('排程狀態：failed');
    expect(JSON.stringify(item)).not.toMatch(/raw-worker-secret|raw-row-secret/);
    expect(supabase.selectRows).toHaveBeenCalledWith(
      'system_job_status',
      'select=job_name,lottery,status,started_at,finished_at,updated_at,error&order=updated_at.desc',
    );
  });

  it('shows the current Matrix analysis stage from the Railway status response', async () => {
    const workerStatus: WorkerStatus = {
      ...healthyWorkerStatus,
      jobs: {
        items: [{
          lottery: '今彩539',
          jobName: 'matrix-539-refresh-v2',
          job: null,
          latestDraw: { period: '115000210', drawDate: '2026-08-31' },
          latestAnalysis: {
            drawPeriod: '115000210',
            status: 'running',
            phase: 'tiangong',
            startedAt: '2026-08-31T06:23:21Z',
            completedAt: null,
            error: null,
          },
        }] as WorkerStatus extends { jobs: infer Jobs } ? Jobs extends { items: infer Items } ? Items : never : never,
      },
    };
    const status = createConnectionStatus({
      supabase: { selectRows: vi.fn(async () => []) },
      loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'secret' }),
      fetcher: vi.fn(async () => response({ ok: true })),
      getWorkerStatus: async () => workerStatus,
    });

    const result = await status.get();
    expect(result.items.find((item) => item.id === 'cron-matrix-539-refresh-v2')?.detail).toMatchObject({
      analysisStatus: 'running',
      analysisPhase: 'tiangong',
      analysisDrawPeriod: '115000210',
    });
  });
});
