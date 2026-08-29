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
  it('keeps successful items when one Matrix endpoint fails and includes every description', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/matrix/audit')) return response({ error: true }, 500);
      return response({ ok: true });
    });
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
    expect(result.items.find((item) => item.id === 'matrix-audit-api')).toMatchObject({ ok: false, description: '檢查開獎資料是否缺期、重複或異常。' });
    expect(result.items.find((item) => item.id === 'matrix-coverage-api')).toMatchObject({ ok: true, description: '檢查四個彩種的資料涵蓋範圍與筆數。' });
    expect(result.items.find((item) => item.id === 'supabase-database')?.description).toBe('儲存會員、訂閱、付款及管理員資料。');
    expect(result.items.find((item) => item.id === 'supabase-auth')?.description).toBe('處理會員登入、登出及帳號驗證。');
    expect(result.items).toHaveLength(13);
    expect(fetcher).toHaveBeenCalledWith('https://matrix-sanqwn.v2.appdeploy.ai/');
    expect(fetcher).toHaveBeenCalledWith('https://api-v2.appdeploy.ai/app/app-snsxet');
  });

  it('retries only the requested API endpoint and returns its new status', async () => {
    const fetcher = vi.fn(async () => response({ ok: true }));
    const status = createConnectionStatus({
      supabase: { selectRows: vi.fn(async () => []) },
      loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'secret' }),
      fetcher,
      getWorkerStatus: async () => healthyWorkerStatus,
      now: () => new Date('2026-08-21T03:00:00Z'),
    });

    await expect(status.retry('matrix-audit-api')).resolves.toMatchObject({
      id: 'matrix-audit-api',
      ok: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('https://api-v2.appdeploy.ai/app/app-snsxet/api/matrix/audit');
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
    expect(result.items).toHaveLength(13);
    expect(result.items.find((item) => item.id === 'railway-worker-api')).toMatchObject({
      ok: true,
      retryable: true,
      detail: healthyWorkerStatus,
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
    expect(result.items.find((item) => item.id === 'railway-worker-api')).toMatchObject({
      ok: false,
      retryable: true,
      error: 'Railway Worker API 暫時無法使用',
    });
    expect(result.items.find((item) => item.id === 'railway-worker-api')).not.toHaveProperty('detail');
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
    await expect(status.retry('railway-worker-api')).resolves.toMatchObject({
      id: 'railway-worker-api',
      ok: true,
      retryable: true,
    });
    expect(getWorkerStatus).toHaveBeenCalledTimes(1);
    expect(fetcher).not.toHaveBeenCalled();
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
    });
    expect(item?.error).toBe('排程狀態：failed');
    expect(JSON.stringify(item)).not.toMatch(/raw-worker-secret|raw-row-secret/);
    expect(supabase.selectRows).toHaveBeenCalledWith(
      'system_job_status',
      'select=job_name,lottery,status,started_at,finished_at,updated_at,error&order=updated_at.desc',
    );
  });
});
