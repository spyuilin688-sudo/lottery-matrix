import { describe, expect, it, vi } from 'vitest';
import { createWorkerApi, getWorkerConfig } from './worker-api';

const health = {
  status: 'ok',
  service: 'matrix-railway-api',
  version: 'test-sha',
  database: { status: 'ok' },
  adminApi: { status: 'ok' },
};
const lotteryJobs = [
  ['今彩539', 'matrix-539-refresh-v2'],
  ['天天樂', 'matrix-fantasy5-refresh-v2'],
  ['六合彩', 'matrix-marksix-refresh-v2'],
  ['大樂透', 'matrix-649-refresh-v2'],
] as const;
const jobItem = (lottery: typeof lotteryJobs[number][0], jobName: string) => ({
  lottery,
  jobName,
  job: {
    jobName,
    lottery,
    status: 'success' as const,
    startedAt: '2026-08-29T01:00:00Z',
    finishedAt: '2026-08-29T01:01:00Z',
    error: null,
    updatedAt: '2026-08-29T01:01:00Z',
  },
  latestDraw: { period: '003117', drawDate: '2026-08-28' },
  latestAnalysis: {
    drawPeriod: '003117',
    status: 'complete' as const,
    phase: 'complete' as const,
    startedAt: '2026-08-29T01:00:00Z',
    completedAt: '2026-08-29T01:01:00Z',
    error: null,
  },
});
const jobs = {
  items: lotteryJobs.map(([lottery, jobName]) => jobItem(lottery, jobName)),
};
const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
const unavailable = {
  ok: false,
  reason: 'RAILWAY_UNAVAILABLE',
  health: null,
  jobs: null,
};

describe('Railway worker status adapter', () => {
  it('reports a Railway-side missing admin token without calling protected jobs', async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      ...health,
      adminApi: { status: 'misconfigured' },
    }));
    const api = createWorkerApi(
      async () => ({
        baseUrl: 'https://railway.example',
        statusToken: 'server-token',
      }),
      fetcher,
    );

    await expect(api.getStatus()).resolves.toEqual({
      ok: false,
      reason: 'RAILWAY_ADMIN_CONFIG_MISSING',
      health: null,
      jobs: null,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toBe('https://railway.example/health');
  });

  it('normalizes the URL and sends the token only to jobs with one signal', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, _init?: RequestInit) =>
      String(input).endsWith('/health') ? jsonResponse(health) : jsonResponse(jobs));
    const api = createWorkerApi(
      async () => ({
        baseUrl: 'https://railway.example/',
        statusToken: 'server-token',
      }),
      fetcher,
    );

    await expect(api.getStatus()).resolves.toMatchObject({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [healthUrl, healthInit] = fetcher.mock.calls[0];
    const [jobsUrl, jobsInit] = fetcher.mock.calls[1];
    expect(String(healthUrl)).toBe('https://railway.example/health');
    expect(String(jobsUrl)).toBe('https://railway.example/jobs/status');
    expect(healthInit).toMatchObject({ redirect: 'error', cache: 'no-store' });
    expect(jobsInit).toMatchObject({
      redirect: 'error',
      cache: 'no-store',
      headers: { 'X-Matrix-Admin-Token': 'server-token' },
    });
    expect((healthInit as RequestInit).headers).toBeUndefined();
    expect((healthInit as RequestInit).signal).toBe((jobsInit as RequestInit).signal);
  });

  it('keeps rolling compatibility with a Railway health payload from before adminApi', async () => {
    const { adminApi: _ignored, ...legacyHealth } = health;
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).endsWith('/health') ? jsonResponse(legacyHealth) : jsonResponse(jobs));
    const api = createWorkerApi(
      async () => ({ baseUrl: 'https://railway.example', statusToken: 'server-token' }),
      fetcher,
    );

    const result = await api.getStatus();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected Railway status');
    expect(result.health.adminApi.status).toBe('unknown');
  });

  it('distinguishes a rejected shared token from an unavailable service', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).endsWith('/health') ? jsonResponse(health) : jsonResponse({}, 403));
    const api = createWorkerApi(
      async () => ({ baseUrl: 'https://railway.example', statusToken: 'wrong-token' }),
      fetcher,
    );

    await expect(api.getStatus()).resolves.toEqual({
      ok: false,
      reason: 'RAILWAY_AUTH_FAILED',
      health: null,
      jobs: null,
    });
  });

  it('accepts the worker waiting_source status used while upstream data is stale', async () => {
    const waitingJobs = structuredClone(jobs);
    waitingJobs.items[0].job.status = 'waiting_source' as 'success';
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).endsWith('/health') ? jsonResponse(health) : jsonResponse(waitingJobs));
    const api = createWorkerApi(
      async () => ({ baseUrl: 'https://railway.example', statusToken: 'server-token' }),
      fetcher,
    );

    const result = await api.getStatus();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected Railway status');
    expect(result.jobs.items[0].job?.status).toBe('waiting_source');
  });

  it('requests one protected latest-draw refresh without exposing the token to the client', async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      lottery: '今彩539',
      period: '115000211',
      drawDate: '2026-09-01',
    }));
    const api = createWorkerApi(
      async () => ({
        baseUrl: 'https://railway.example/',
        statusToken: 'server-token',
      }),
      fetcher,
    );

    await expect(api.refreshLottery('今彩539')).resolves.toEqual({
      lottery: '今彩539',
      period: '115000211',
      drawDate: '2026-09-01',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe('https://railway.example/jobs/refresh');
    expect(init).toMatchObject({
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-Matrix-Admin-Token': 'server-token',
      },
      body: JSON.stringify({ lottery: '今彩539' }),
    });
  });

  it('keeps a manual refresh alive beyond the status-check deadline', async () => {
    vi.useFakeTimers();
    try {
      let resolveResponse: ((response: Response) => void) | undefined;
      const fetcher = vi.fn(() => new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }));
      const api = createWorkerApi(
        async () => ({
          baseUrl: 'https://railway.example',
          statusToken: 'server-token',
        }),
        fetcher as typeof fetch,
      );
      const pending = api.refreshLottery('今彩539');
      let outcome = 'pending';
      void pending.then(
        () => { outcome = 'success'; },
        () => { outcome = 'error'; },
      );

      await vi.advanceTimersByTimeAsync(30_001);

      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(outcome).toBe('pending');
      resolveResponse?.(jsonResponse({
        lottery: '今彩539',
        period: '115000211',
        drawDate: '2026-09-01',
      }));
      await expect(pending).resolves.toMatchObject({ period: '115000211' });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    null,
    { baseUrl: '', statusToken: 'server-token' },
    { baseUrl: 'https://railway.example', statusToken: '' },
  ])('performs no fetch when config is unusable', async (config) => {
    const fetcher = vi.fn();
    const api = createWorkerApi(async () => config, fetcher as typeof fetch);
    await expect(api.getStatus()).resolves.toEqual({
      ...unavailable,
      reason: 'APPDEPLOY_CONFIG_MISSING',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not parse or expose a non-success response body', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).endsWith('/health')
        ? jsonResponse(health)
        : jsonResponse({ error: 'fake-upstream-secret' }, 503));
    const api = createWorkerApi(
      async () => ({
        baseUrl: 'https://railway.example',
        statusToken: 'server-token',
      }),
      fetcher,
    );
    const result = await api.getStatus();
    expect(result).toEqual(unavailable);
    expect(JSON.stringify(result)).not.toContain('fake-upstream-secret');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('returns unavailable for malformed JSON', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).endsWith('/health')
        ? jsonResponse(health)
        : new Response('{', { status: 200 }));
    const api = createWorkerApi(
      async () => ({
        baseUrl: 'https://railway.example',
        statusToken: 'server-token',
      }),
      fetcher,
    );
    await expect(api.getStatus()).resolves.toEqual(unavailable);
  });

  const invalidJobPayloads = [
    { name: 'missing lottery', value: { items: jobs.items.slice(0, 3) } },
    {
      name: 'duplicate lottery',
      value: { items: [jobs.items[0], jobs.items[0], jobs.items[2], jobs.items[3]] },
    },
    {
      name: 'mismatched job name',
      value: {
        items: jobs.items.map((item, index) =>
          index === 0 ? { ...item, jobName: 'matrix-fantasy5-refresh-v2' } : item),
      },
    },
    {
      name: 'wrong required field type',
      value: {
        items: jobs.items.map((item, index) =>
          index === 0
            ? { ...item, latestDraw: { ...item.latestDraw, period: 3117 } }
            : item),
      },
    },
  ];

  it.each(invalidJobPayloads)('rejects $name', async ({ value }) => {
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).endsWith('/health') ? jsonResponse(health) : jsonResponse(value));
    const api = createWorkerApi(
      async () => ({
        baseUrl: 'https://railway.example',
        statusToken: 'server-token',
      }),
      fetcher,
    );
    await expect(api.getStatus()).resolves.toEqual(unavailable);
  });

  it('rejects an invalid health DTO', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).endsWith('/health')
        ? jsonResponse({ ...health, version: 123 })
        : jsonResponse(jobs));
    const api = createWorkerApi(
      async () => ({
        baseUrl: 'https://railway.example',
        statusToken: 'server-token',
      }),
      fetcher,
    );
    await expect(api.getStatus()).resolves.toEqual(unavailable);
  });

  it('projects extra fields and raw errors to a safe DTO', async () => {
    const tainted = structuredClone(jobs) as any;
    tainted.secret = 'top-level-secret';
    tainted.items[0].extra = 'row-secret';
    tainted.items[0].job.error = 'raw-worker-secret';
    tainted.items[0].latestAnalysis.error = 'raw-analysis-secret';
    tainted.items[0].latestDraw.updatedAt = 'unreliable';
    tainted.items[0].latestAnalysis.updatedAt = 'unreliable';
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input).endsWith('/health') ? jsonResponse(health) : jsonResponse(tainted));
    const api = createWorkerApi(
      async () => ({
        baseUrl: 'https://railway.example',
        statusToken: 'server-token',
      }),
      fetcher,
    );

    const result = await api.getStatus();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected safe Railway status');
    expect(result.jobs.items[0].job?.error).toBe('WORKER_FAILED');
    expect(result.jobs.items[0].latestAnalysis?.error).toBe('ANALYSIS_FAILED');
    expect(result.jobs.items[0].latestDraw).not.toHaveProperty('updatedAt');
    expect(result.jobs.items[0].latestAnalysis).not.toHaveProperty('updatedAt');
    expect(JSON.stringify(result)).not.toMatch(
      /top-level-secret|row-secret|raw-worker-secret|raw-analysis-secret|server-token/,
    );
  });

  it('times out a hanging config loader before making a request', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn();
      const api = createWorkerApi(
        () => new Promise(() => undefined),
        fetcher as typeof fetch,
      );
      const pending = api.getStatus();
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(pending).resolves.toEqual(unavailable);
      expect(fetcher).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('aborts hanging fetches at five seconds without retry', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn((_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')));
        }));
      const api = createWorkerApi(
        async () => ({
          baseUrl: 'https://railway.example',
          statusToken: 'server-token',
        }),
        fetcher as typeof fetch,
      );
      const pending = api.getStatus();
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(pending).resolves.toEqual(unavailable);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('times out hanging JSON parsing within the same deadline', async () => {
    vi.useFakeTimers();
    try {
      const response = {
        ok: true,
        json: () => new Promise(() => undefined),
      } as Response;
      const fetcher = vi.fn(async () => response);
      const api = createWorkerApi(
        async () => ({
          baseUrl: 'https://railway.example',
          statusToken: 'server-token',
        }),
        fetcher as typeof fetch,
      );
      const pending = api.getStatus();
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(pending).resolves.toEqual(unavailable);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Railway worker secret configuration', () => {
  it('loads only the two approved server secrets', async () => {
    const reads: string[] = [];
    const config = await getWorkerConfig({
      listSecretNames: async () => [
        'RAILWAY_WORKER_URL',
        'MATRIX_ADMIN_STATUS_TOKEN',
        'UNRELATED_SECRET',
      ],
      readSecret: async (name) => {
        reads.push(name);
        return name === 'RAILWAY_WORKER_URL'
          ? 'https://railway.example/'
          : 'server-token';
      },
    });
    expect(config).toEqual({
      baseUrl: 'https://railway.example',
      statusToken: 'server-token',
    });
    expect(reads.sort()).toEqual([
      'MATRIX_ADMIN_STATUS_TOKEN',
      'RAILWAY_WORKER_URL',
    ]);
  });

  it.each([
    ['missing token name', ['RAILWAY_WORKER_URL'], 'https://railway.example'],
    ['missing URL name', ['MATRIX_ADMIN_STATUS_TOKEN'], 'server-token'],
    ['blank stored value', ['RAILWAY_WORKER_URL', 'MATRIX_ADMIN_STATUS_TOKEN'], '   '],
  ])('returns null for %s', async (_name, names, value) => {
    const config = await getWorkerConfig({
      listSecretNames: async () => names as string[],
      readSecret: async () => value,
    });
    expect(config).toBeNull();
  });

  it('maps secret-store errors to null without exposing their text', async () => {
    const config = await getWorkerConfig({
      listSecretNames: async () => { throw new Error('fake-secret-value'); },
      readSecret: async () => '',
    });
    expect(config).toBeNull();
    expect(JSON.stringify(config)).not.toContain('fake-secret-value');
  });
});


describe('Railway recovery adapter', () => {
  it('requests one protected asynchronous recovery without exposing the token', async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      lottery: '天天樂',
      status: 'accepted',
    }, 202));
    const api = createWorkerApi(
      async () => ({
        baseUrl: 'https://railway.example/',
        statusToken: 'server-token',
      }),
      fetcher,
    );

    await expect(api.recoverLottery('天天樂', 'invocation-1')).resolves.toEqual({
      lottery: '天天樂',
      status: 'accepted',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe('https://railway.example/jobs/recover');
    expect(init).toMatchObject({
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-Matrix-Admin-Token': 'server-token',
      },
      body: JSON.stringify({
        lottery: '天天樂',
        leaseOwner: 'invocation-1',
      }),
    });
  });
});
