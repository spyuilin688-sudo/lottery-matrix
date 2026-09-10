import { describe, expect, it, vi } from 'vitest';
import { createConnectionStatus } from './connection-status';
import {
  createWorkerApi,
  getWorkerConfig,
  PRODUCTION_RAILWAY_WORKER_URL,
} from './worker-api';

const health = {
  status: 'ok',
  service: 'matrix-api',
  version: 'production',
  database: { status: 'ok' },
  adminApi: { status: 'ok' },
} as const;

describe('Supabase admin Railway configuration after AppDeploy cutover', () => {
  it('keeps the public Railway URL available when the optional Edge secrets are absent', async () => {
    const config = await getWorkerConfig({
      listSecretNames: async () => [],
      readSecret: async () => undefined,
    });

    expect(config).toEqual({
      baseUrl: PRODUCTION_RAILWAY_WORKER_URL,
      statusToken: '',
    });
  });

  it('checks public health before reporting the missing Supabase management token', async () => {
    const fetcher = vi.fn(async () => Response.json(health));
    const api = createWorkerApi(
      async () => ({ baseUrl: PRODUCTION_RAILWAY_WORKER_URL, statusToken: '' }),
      fetcher,
    );

    await expect(api.getStatus()).resolves.toEqual({
      ok: false,
      reason: 'SUPABASE_RAILWAY_CONFIG_MISSING',
      health,
      jobs: null,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      `${PRODUCTION_RAILWAY_WORKER_URL}/health`,
      expect.objectContaining({ redirect: 'error', cache: 'no-store' }),
    );
  });

  it('reports public health as healthy without claiming protected Railway operations work', async () => {
    const status = createConnectionStatus({
      supabase: { selectRows: async () => [] },
      loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'service-secret' }),
      getWorkerStatus: async () => ({
        ok: false,
        reason: 'SUPABASE_RAILWAY_CONFIG_MISSING',
        health,
        jobs: null,
      }),
      loadWorkerUrl: async () => undefined,
      fetcher: vi.fn(async () => Response.json([])),
    });

    const result = await status.get();
    expect(result.items.find((item) => item.id === 'railway-health')).toMatchObject({
      ok: true,
      detail: health,
    });
    expect(result.items.find((item) => item.id === 'railway-jobs-status')).toMatchObject({
      ok: false,
      error: 'Supabase 尚未完成 Railway 管理 API 設定',
    });
    expect(JSON.stringify(result)).not.toContain('AppDeploy');
  });
});
