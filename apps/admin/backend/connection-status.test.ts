import { describe, expect, it, vi } from 'vitest';
import { createConnectionStatus } from './connection-status';

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

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
      now: () => new Date('2026-08-21T03:00:00Z'),
    });

    const result = await status.get();
    expect(result.items.find((item) => item.id === 'matrix-audit-api')).toMatchObject({ ok: false, description: '檢查開獎資料是否缺期、重複或異常。' });
    expect(result.items.find((item) => item.id === 'matrix-coverage-api')).toMatchObject({ ok: true, description: '檢查四個彩種的資料涵蓋範圍與筆數。' });
    expect(result.items.find((item) => item.id === 'supabase-database')?.description).toBe('儲存會員、訂閱、付款及管理員資料。');
    expect(result.items.find((item) => item.id === 'supabase-auth')?.description).toBe('處理會員登入、登出及帳號驗證。');
    expect(result.items).toHaveLength(12);
    expect(fetcher).toHaveBeenCalledWith('https://matrix-sanqwn.v2.appdeploy.ai/');
    expect(fetcher).toHaveBeenCalledWith('https://api-v2.appdeploy.ai/app/app-snsxet');
  });
});
