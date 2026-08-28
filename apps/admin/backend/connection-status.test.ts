import { describe, expect, it, vi } from 'vitest';
import { createConnectionStatus } from './connection-status';

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('connection status', () => {
  it('keeps successful items when Railway jobs fail and includes every description', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/jobs/status')) return response({ error: true }, 500);
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
      loadWorkerBaseUrl: async () => 'https://railway.example/',
      fetcher,
      now: () => new Date('2026-08-21T03:00:00Z'),
    });

    const result = await status.get();
    expect(result.items.find((item) => item.id === 'railway-jobs-api')).toMatchObject({
      ok: false,
      description: '取得四個彩種的 Railway 執行狀態。',
    });
    expect(result.items.find((item) => item.id === 'railway-worker')).toMatchObject({
      ok: true,
      description: '顯示 Railway Worker 的服務與資料庫連線狀態。',
    });
    expect(result.items.find((item) => item.id === 'supabase-database')?.description).toBe('儲存會員、訂閱、付款及管理員資料。');
    expect(result.items.find((item) => item.id === 'supabase-auth')?.description).toBe('處理會員登入、登出及帳號驗證。');
    expect(result.items).toHaveLength(9);
    expect(fetcher).toHaveBeenCalledWith('https://matrix-sanqwn.v2.appdeploy.ai/');
    expect(fetcher).toHaveBeenCalledWith('https://railway.example/health');
    expect(fetcher).toHaveBeenCalledWith('https://railway.example/jobs/status');
    expect(fetcher.mock.calls.some(([input]) => String(input).includes('app-snsxet'))).toBe(false);
  });

  it('retries only the requested Railway endpoint and returns its new status', async () => {
    const fetcher = vi.fn(async () => response({ ok: true }));
    const status = createConnectionStatus({
      supabase: { selectRows: vi.fn(async () => []) },
      loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'secret' }),
      loadWorkerBaseUrl: async () => 'https://railway.example/',
      fetcher,
      now: () => new Date('2026-08-21T03:00:00Z'),
    });

    await expect(status.retry('railway-jobs-api')).resolves.toMatchObject({
      id: 'railway-jobs-api',
      ok: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('https://railway.example/jobs/status');
  });

  it('rejects retry requests for non-API status items without making a request', async () => {
    const fetcher = vi.fn();
    const status = createConnectionStatus({
      supabase: { selectRows: vi.fn(async () => []) },
      loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'secret' }),
      loadWorkerBaseUrl: async () => 'https://railway.example/',
      fetcher,
    });

    await expect(status.retry('supabase-database')).rejects.toMatchObject({ statusCode: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
