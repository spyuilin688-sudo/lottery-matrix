import { describe, expect, it, vi } from 'vitest';
import { createConnectionStatus } from './connection-status';
import type { WorkerStatus } from './worker-api';
import type { WatchdogStatus } from './watchdog-status';

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const healthyWorkerStatus: WorkerStatus = {
  ok: true,
  health: {
    status: 'ok',
    service: 'matrix-railway-api',
    version: 'test-sha',
    database: { status: 'ok' },
    adminApi: { status: 'ok' },
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
    expect(result.items).toHaveLength(56);
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
    expect(result.items).toHaveLength(56);
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
      getWorkerStatus: async () => ({
        ok: false,
        reason: 'RAILWAY_ADMIN_CONFIG_MISSING',
        health: null,
        jobs: null,
      }),
      now: () => new Date('2026-08-21T03:00:00Z'),
    });
    const result = await status.get();
    expect(result.items.find((item) => item.id === 'railway-health')).toMatchObject({
      ok: false,
      retryable: true,
      error: 'Railway 管理 API 尚未完成設定',
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
    expect(fetcher.mock.calls.every(([, init]) =>
      init?.method === undefined || init.method === 'GET' || init.method === 'OPTIONS')).toBe(true);
    expect(fetcher.mock.calls.some(([input]) =>
      String(input).includes('/redeem_activation_code'))).toBe(false);
    expect(fetcher.mock.calls.some(([input]) =>
      String(input).includes('/jobs/recover'))).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/raw-service-secret|serviceRoleKey|workerToken|Authorization/);
  });

  it('reads only GitHub workflow metadata and the latest run with a server-side token', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/fantasy5-crawler.yml')) return response({
        name: 'Fantasy5 crawler',
        path: '.github/workflows/fantasy5-crawler.yml',
        state: 'active',
        token: 'raw-upstream-secret',
      });
      if (url.endsWith('/fantasy5-crawler.yml/runs?per_page=1')) return response({
        workflow_runs: [{
          status: 'completed', conclusion: 'success',
          created_at: '2026-09-04T11:40:00Z', updated_at: '2026-09-04T11:42:00Z',
          head_sha: 'secret-source-sha', logs_url: 'https://api.github.test/raw-secret',
        }],
      });
      if (url.endsWith('/rest/v1/')) return response({ paths: {} });
      return response({ ok: true });
    });
    const status = createConnectionStatus({
      supabase: { selectRows: vi.fn(async () => []) },
      loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'service-secret' }),
      loadGithubToken: async () => 'github-server-secret',
      fetcher,
      getWorkerStatus: async () => healthyWorkerStatus,
      now: () => new Date('2026-09-04T12:00:00Z'),
    });

    const result = await status.get();
    expect(result.items.find((item) => item.id === 'github-fantasy5-workflow')).toMatchObject({
      ok: true,
      detail: {
        workflow: { name: 'Fantasy5 crawler', path: '.github/workflows/fantasy5-crawler.yml', state: 'active' },
        latestRun: {
          status: 'completed', conclusion: 'success',
          createdAt: '2026-09-04T11:40:00Z', updatedAt: '2026-09-04T11:42:00Z',
        },
      },
    });
    const githubCalls = fetcher.mock.calls.filter(([input]) =>
      String(input).startsWith('https://api.github.com/'));
    expect(githubCalls).toHaveLength(2);
    expect(githubCalls.map(([input]) => String(input))).toEqual([
      'https://api.github.com/repos/spyuilin688-sudo/lottery-matrix/actions/workflows/fantasy5-crawler.yml',
      'https://api.github.com/repos/spyuilin688-sudo/lottery-matrix/actions/workflows/fantasy5-crawler.yml/runs?per_page=1',
    ]);
    expect(githubCalls.every(([, init]) => init?.method === 'GET')).toBe(true);
    expect(githubCalls.every(([, init]) =>
      new Headers(init?.headers).get('Authorization') === 'Bearer github-server-secret')).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/github-server-secret|raw-upstream-secret|secret-source-sha|raw-secret/);
  });

  it('reports missing GitHub configuration without sending a request or leaking loader errors', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/rest/v1/')
      ? response({ paths: {} })
      : response({ ok: true }));
    const status = createConnectionStatus({
      supabase: { selectRows: vi.fn(async () => []) },
      loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'service-secret' }),
      loadGithubToken: async () => { throw new Error('token=github-raw-secret'); },
      fetcher,
      getWorkerStatus: async () => healthyWorkerStatus,
    });

    const result = await status.get();
    expect(result.items.find((item) => item.id === 'github-fantasy5-workflow')).toMatchObject({
      ok: false,
      error: 'GitHub Actions API 暫時無法使用',
    });
    expect(fetcher.mock.calls.some(([input]) => String(input).startsWith('https://api.github.com/'))).toBe(false);
    expect(JSON.stringify(result)).not.toContain('github-raw-secret');
  });

  it('checks all Edge Functions with OPTIONS only', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/rest/v1/')
      ? response({ paths: {} })
      : response({ ok: true }));
    const status = createConnectionStatus({
      supabase: { selectRows: vi.fn(async () => []) },
      loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'service-secret' }),
      fetcher,
      getWorkerStatus: async () => healthyWorkerStatus,
    });

    await status.get();
    const functionCalls = fetcher.mock.calls.filter(([input]) =>
      String(input).includes('/functions/v1/'));
    expect(functionCalls.map(([input]) => String(input))).toEqual([
      'https://db.test/functions/v1/matrix-status',
      'https://db.test/functions/v1/notification-ingest',
      'https://db.test/functions/v1/notification-dispatch',
      'https://db.test/functions/v1/send-test-push',
      'https://db.test/functions/v1/line-logout',
    ]);
    expect(functionCalls.every(([, init]) => init?.method === 'OPTIONS')).toBe(true);
    expect(functionCalls.every(([, init]) => {
      const headers = new Headers(init?.headers);
      return headers.get('apikey') === 'service-secret'
        && headers.get('Authorization') === 'Bearer service-secret';
    })).toBe(true);
    expect(functionCalls.every(([, init]) => init?.body === undefined)).toBe(true);
  });

  it('uses one OpenAPI document to confirm write RPC presence without invoking any RPC', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/rest/v1/')
      ? response({ paths: {
        '/rpc/claim_matrix_watchdog_lease': { post: {} },
        '/rpc/notification_dispatch_mark_sent': { post: {} },
      } })
      : response({ ok: true }));
    const status = createConnectionStatus({
      supabase: { selectRows: vi.fn(async () => []) },
      loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'service-secret' }),
      fetcher,
      getWorkerStatus: async () => healthyWorkerStatus,
    });

    const result = await status.get();
    expect(result.items.find((item) => item.id === 'supabase-rpc-claim_matrix_watchdog_lease')).toMatchObject({ ok: true });
    expect(result.items.find((item) => item.id === 'supabase-rpc-notification_dispatch_mark_sent')).toMatchObject({ ok: true });
    expect(fetcher.mock.calls.filter(([input]) => String(input).endsWith('/rest/v1/'))).toHaveLength(1);
    expect(fetcher.mock.calls.some(([input]) => String(input).includes('/rest/v1/rpc/'))).toBe(false);
  });

  it('inherits Railway recovery status without posting to recovery', async () => {
    const getWorkerStatus = vi.fn(async () => healthyWorkerStatus);
    const fetcher = vi.fn(async () => response({ paths: {} }));
    const status = createConnectionStatus({
      supabase: { selectRows: vi.fn(async () => []) },
      loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'service-secret' }),
      fetcher,
      getWorkerStatus,
    });

    const result = await status.get();
    expect(result.items.find((item) => item.id === 'railway-jobs-recover')).toMatchObject({
      ok: true,
      detail: { inheritedFrom: ['/health', '/jobs/status'] },
    });
    expect(getWorkerStatus).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls.some(([input]) => String(input).includes('/jobs/recover'))).toBe(false);
  });

  it('marks an 18-minute watchdog heartbeat healthy and exposes only safe schedule detail', async () => {
    const heartbeat: WatchdogStatus = {
      status: 'ok',
      checkedAt: '2026-09-04T11:41:00.000Z',
      completedAt: '2026-09-04T11:42:00.000Z',
      dueLotteries: ['天天樂'],
      actions: [{ lottery: '天天樂', target: 'github', reasons: ['crawler-stale'], outcome: 'dispatched' }],
    };
    const status = createConnectionStatus({
      supabase: { selectRows: vi.fn(async () => []) },
      loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'service-secret' }),
      fetcher: vi.fn(async () => response({ paths: {} })),
      getWorkerStatus: async () => healthyWorkerStatus,
      loadWatchdogStatus: async () => ({ ...heartbeat, token: 'raw-heartbeat-secret' } as WatchdogStatus),
      now: () => new Date('2026-09-04T12:00:00.000Z'),
    });

    const result = await status.get();
    expect(result.items.find((item) => item.id === 'appdeploy-watchdog-heartbeat')).toMatchObject({
      ok: true,
      detail: {
        status: 'ok',
        checkedAt: '2026-09-04T11:41:00.000Z',
        completedAt: '2026-09-04T11:42:00.000Z',
        dueLotteries: ['天天樂'],
        actions: heartbeat.actions,
        physicalCronIntervalMinutes: 6,
        freshnessThresholdMinutes: 18,
        logicalPhases: [
          { intervalMinutes: 6, checks: 50 },
          { intervalMinutes: 10, checks: 60 },
          { intervalMinutes: 30, checks: 18 },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain('raw-heartbeat-secret');
  });

  it.each([
    ['missing', null, '尚無 AppDeploy 獨立監控心跳'],
    ['stale', {
      status: 'ok', checkedAt: '2026-09-04T11:40:59.000Z', completedAt: '2026-09-04T11:41:59.000Z',
      dueLotteries: [], actions: [],
    } satisfies WatchdogStatus, 'AppDeploy 獨立監控心跳已超過 18 分鐘'],
  ])('marks a %s watchdog heartbeat unavailable with a safe error', async (_case, heartbeat, error) => {
    const status = createConnectionStatus({
      supabase: { selectRows: vi.fn(async () => []) },
      loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'service-secret' }),
      fetcher: vi.fn(async () => response({ paths: {} })),
      getWorkerStatus: async () => healthyWorkerStatus,
      loadWatchdogStatus: async () => heartbeat,
      now: () => new Date('2026-09-04T12:00:00.000Z'),
    });

    const result = await status.get();
    expect(result.items.find((item) => item.id === 'appdeploy-watchdog-heartbeat')).toMatchObject({ ok: false, error });
  });

  it('does not accept a watchdog heartbeat that is materially ahead of the status-check clock', async () => {
    const status = createConnectionStatus({
      supabase: { selectRows: vi.fn(async () => []) },
      loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'service-secret' }),
      fetcher: vi.fn(async () => response({ paths: {} })),
      getWorkerStatus: async () => healthyWorkerStatus,
      loadWatchdogStatus: async () => ({
        status: 'ok', checkedAt: '2026-09-04T12:05:00.000Z', completedAt: '2026-09-04T12:05:00.000Z',
        dueLotteries: [], actions: [],
      }),
      now: () => new Date('2026-09-04T12:00:00.000Z'),
    });

    const result = await status.get();
    expect(result.items.find((item) => item.id === 'appdeploy-watchdog-heartbeat')).toMatchObject({
      ok: false,
      error: 'AppDeploy 獨立監控心跳時間異常',
    });
  });

  it('finishes status collection when a read-only HTTP probe never responds', async () => {
    const status = createConnectionStatus({
      supabase: { selectRows: vi.fn(async () => []) },
      loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'service-secret' }),
      fetcher: vi.fn(() => new Promise<Response>(() => {})),
      getWorkerStatus: async () => healthyWorkerStatus,
      requestTimeoutMs: 5,
    });

    await expect(status.get()).resolves.toMatchObject({ items: expect.any(Array) });
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
