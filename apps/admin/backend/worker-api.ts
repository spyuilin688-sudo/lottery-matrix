export type WorkerConfig = { baseUrl: string; statusToken: string };
export type WorkerConfigLoader = () => Promise<WorkerConfig | null>;
export type CrawlerLottery = '今彩539' | '天天樂' | '六合彩' | '大樂透';
export type SecretReader = {
  listSecretNames(): Promise<string[]>;
  readSecret(name: string): Promise<unknown>;
};

export type RailwayHealth = {
  status: 'ok';
  service: string;
  version: string;
  database: { status: 'ok' };
  adminApi: { status: 'ok' | 'misconfigured' | 'unknown' };
};
export type RailwayJob = {
  jobName: string;
  lottery: string;
  status: 'running' | 'waiting_source' | 'success' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  error: 'WORKER_FAILED' | null;
  updatedAt: string;
};
export type RailwayLatestDraw = {
  period: string;
  drawDate: string | null;
};
export type RailwayLatestAnalysis = {
  drawPeriod: string;
  status: 'running' | 'complete' | 'failed';
  phase: 'explore' | 'tianyan' | 'tiangong' | 'status' | 'complete';
  startedAt: string;
  completedAt: string | null;
  error: 'ANALYSIS_FAILED' | null;
};
export type RailwayJobItem = {
  lottery: CrawlerLottery;
  jobName: string;
  job: RailwayJob | null;
  latestDraw: RailwayLatestDraw | null;
  latestAnalysis: RailwayLatestAnalysis | null;
};
export type RailwayJobs = { items: RailwayJobItem[] };
export type WorkerStatus =
  | { ok: true; health: RailwayHealth; jobs: RailwayJobs }
  | {
    ok: false;
    reason:
      | 'SUPABASE_RAILWAY_CONFIG_MISSING'
      | 'RAILWAY_ADMIN_CONFIG_MISSING'
      | 'RAILWAY_AUTH_FAILED'
      | 'RAILWAY_UNAVAILABLE';
    health: RailwayHealth | null;
    jobs: null;
  };
export type WorkerRefresh = {
  lottery: CrawlerLottery;
  period: string;
  drawDate: string | null;
};
export type WorkerRecovery = {
  lottery: CrawlerLottery;
  status: 'accepted' | 'already-running';
};

const jobNameByLottery: Record<CrawlerLottery, string> = {
  今彩539: 'matrix-539-refresh-v2',
  天天樂: 'matrix-fantasy5-refresh-v2',
  六合彩: 'matrix-marksix-refresh-v2',
  大樂透: 'matrix-649-refresh-v2',
} as const;
type Lottery = CrawlerLottery;
const lotteries = Object.keys(jobNameByLottery) as Lottery[];
const jobStatuses = ['running', 'waiting_source', 'success', 'failed'] as const;
const analysisStatuses = ['running', 'complete', 'failed'] as const;
const analysisPhases = [
  'explore',
  'tianyan',
  'tiangong',
  'status',
  'complete',
] as const;
const DEFAULT_STATUS_TIMEOUT_MS = 5_000;
const DEFAULT_MANUAL_REFRESH_TIMEOUT_MS = 90_000;
export const PRODUCTION_RAILWAY_WORKER_URL =
  'https://heartfelt-generosity-production-9f2b.up.railway.app';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isNullableString = (value: unknown): value is string | null =>
  value === null || isString(value);
const includes = <T extends string>(
  values: readonly T[],
  value: unknown,
): value is T => isString(value) && values.includes(value as T);

function parseHealth(value: unknown): RailwayHealth | null {
  if (!isRecord(value) || value.status !== 'ok') return null;
  if (!isString(value.service) || !isString(value.version)) return null;
  if (!isRecord(value.database) || value.database.status !== 'ok') return null;
  const adminApi = isRecord(value.adminApi)
    && includes(['ok', 'misconfigured'] as const, value.adminApi.status)
    ? value.adminApi.status
    : 'unknown';
  return {
    status: 'ok',
    service: value.service,
    version: value.version,
    database: { status: 'ok' },
    adminApi: { status: adminApi },
  };
}

function parseJob(
  value: unknown,
  lottery: Lottery,
  jobName: string,
): RailwayJob | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  if (value.lottery !== lottery || value.jobName !== jobName) return undefined;
  if (!includes(jobStatuses, value.status)) return undefined;
  if (!isString(value.startedAt) || !isNullableString(value.finishedAt)) {
    return undefined;
  }
  if (!('error' in value) || !isNullableString(value.error)) return undefined;
  if (!isString(value.updatedAt)) return undefined;
  return {
    jobName,
    lottery,
    status: value.status,
    startedAt: value.startedAt,
    finishedAt: value.finishedAt,
    error: value.error === null ? null : 'WORKER_FAILED',
    updatedAt: value.updatedAt,
  };
}

function parseLatestDraw(
  value: unknown,
): RailwayLatestDraw | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  if (!isString(value.period) || !isNullableString(value.drawDate)) {
    return undefined;
  }
  return { period: value.period, drawDate: value.drawDate };
}

function parseLatestAnalysis(
  value: unknown,
): RailwayLatestAnalysis | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  if (!isString(value.drawPeriod)) return undefined;
  if (!includes(analysisStatuses, value.status)) return undefined;
  if (!includes(analysisPhases, value.phase)) return undefined;
  if (!isString(value.startedAt) || !isNullableString(value.completedAt)) {
    return undefined;
  }
  if (!('error' in value) || !isNullableString(value.error)) return undefined;
  return {
    drawPeriod: value.drawPeriod,
    status: value.status,
    phase: value.phase,
    startedAt: value.startedAt,
    completedAt: value.completedAt,
    error: value.error === null ? null : 'ANALYSIS_FAILED',
  };
}

function parseJobItem(value: unknown): RailwayJobItem | null {
  if (!isRecord(value) || !isString(value.lottery)) return null;
  if (!lotteries.includes(value.lottery as Lottery)) return null;
  const lottery = value.lottery as Lottery;
  const jobName = jobNameByLottery[lottery];
  if (value.jobName !== jobName) return null;
  const job = parseJob(value.job, lottery, jobName);
  const latestDraw = parseLatestDraw(value.latestDraw);
  const latestAnalysis = parseLatestAnalysis(value.latestAnalysis);
  if (job === undefined || latestDraw === undefined || latestAnalysis === undefined) {
    return null;
  }
  return { lottery, jobName, job, latestDraw, latestAnalysis };
}

function parseJobs(value: unknown): RailwayJobs | null {
  if (!isRecord(value) || !Array.isArray(value.items) || value.items.length !== 4) {
    return null;
  }
  const byLottery = new Map<Lottery, RailwayJobItem>();
  for (const raw of value.items) {
    const item = parseJobItem(raw);
    if (!item || byLottery.has(item.lottery)) return null;
    byLottery.set(item.lottery, item);
  }
  if (byLottery.size !== lotteries.length) return null;
  return { items: lotteries.map((lottery) => byLottery.get(lottery)!) };
}

function parseRefresh(
  value: unknown,
  lottery: CrawlerLottery,
): WorkerRefresh | null {
  if (!isRecord(value) || value.lottery !== lottery) return null;
  if (!isString(value.period) || !isNullableString(value.drawDate)) return null;
  return { lottery, period: value.period, drawDate: value.drawDate };
}

function parseRecovery(
  value: unknown,
  lottery: CrawlerLottery,
): WorkerRecovery | null {
  if (!isRecord(value) || value.lottery !== lottery) return null;
  if (!includes(['accepted', 'already-running'] as const, value.status)) return null;
  return { lottery, status: value.status };
}

const unavailable = (
  reason: Extract<WorkerStatus, { ok: false }>['reason'] = 'RAILWAY_UNAVAILABLE',
  health: RailwayHealth | null = null,
): WorkerStatus => ({
  ok: false,
  reason,
  health,
  jobs: null,
});

class WorkerRefreshError extends Error {
  statusCode = 503;

  constructor() {
    super('無法更新開獎資料，請稍後再試');
  }
}

class WorkerRecoveryError extends Error {
  statusCode = 503;

  constructor() {
    super('無法啟動自動恢復，請稍後再試');
  }
}

export async function getWorkerConfig(
  reader: SecretReader,
): Promise<WorkerConfig> {
  try {
    const names = await reader.listSecretNames();
    const [baseUrlValue, tokenValue] = await Promise.all([
      names.includes('RAILWAY_WORKER_URL')
        ? reader.readSecret('RAILWAY_WORKER_URL')
        : undefined,
      names.includes('MATRIX_ADMIN_STATUS_TOKEN')
        ? reader.readSecret('MATRIX_ADMIN_STATUS_TOKEN')
        : undefined,
    ]);
    const baseUrl = String(baseUrlValue ?? '').trim().replace(/\/+$/, '')
      || PRODUCTION_RAILWAY_WORKER_URL;
    const statusToken = String(tokenValue ?? '').trim();
    return { baseUrl, statusToken };
  } catch {
    return { baseUrl: PRODUCTION_RAILWAY_WORKER_URL, statusToken: '' };
  }
}

export function createWorkerApi(
  loadConfig: WorkerConfigLoader,
  fetcher: typeof fetch = fetch,
  timeoutMs = DEFAULT_STATUS_TIMEOUT_MS,
  refreshTimeoutMs = DEFAULT_MANUAL_REFRESH_TIMEOUT_MS,
) {
  return {
    async getStatus(): Promise<WorkerStatus> {
      const controller = new AbortController();
      let verifiedHealth: RailwayHealth | null = null;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('WORKER_STATUS_TIMEOUT'));
        }, timeoutMs);
      });
      const work = (async (): Promise<WorkerStatus> => {
        const config = await loadConfig();
        const baseUrl = config?.baseUrl.trim().replace(/\/+$/, '') ?? '';
        const statusToken = config?.statusToken.trim() ?? '';
        if (!baseUrl || controller.signal.aborted) {
          return unavailable('SUPABASE_RAILWAY_CONFIG_MISSING');
        }
        const healthResponse = await fetcher(`${baseUrl}/health`, {
          signal: controller.signal,
          redirect: 'error',
          cache: 'no-store',
        });
        if (!healthResponse.ok) return unavailable();
        const healthValue = await healthResponse.json();
        const health = parseHealth(healthValue);
        if (!health) return unavailable();
        verifiedHealth = health;
        if (health.adminApi.status === 'misconfigured') {
          return unavailable('RAILWAY_ADMIN_CONFIG_MISSING', health);
        }
        if (!statusToken) {
          return unavailable('SUPABASE_RAILWAY_CONFIG_MISSING', health);
        }
        const jobsResponse = await fetcher(`${baseUrl}/jobs/status`, {
          signal: controller.signal,
          redirect: 'error',
          cache: 'no-store',
          headers: { 'X-Matrix-Admin-Token': statusToken },
        });
        if (jobsResponse.status === 403) {
          return unavailable('RAILWAY_AUTH_FAILED', health);
        }
        if (!jobsResponse.ok) return unavailable('RAILWAY_UNAVAILABLE', health);
        const jobsValue = await jobsResponse.json();
        const jobs = parseJobs(jobsValue);
        return jobs ? { ok: true, health, jobs } : unavailable('RAILWAY_UNAVAILABLE', health);
      })();
      try {
        return await Promise.race([work, timeout]);
      } catch {
        controller.abort();
        return unavailable('RAILWAY_UNAVAILABLE', verifiedHealth);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    },
    async refreshLottery(lottery: CrawlerLottery): Promise<WorkerRefresh> {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new WorkerRefreshError());
        }, refreshTimeoutMs);
      });
      const work = (async (): Promise<WorkerRefresh> => {
        const config = await loadConfig();
        const baseUrl = config?.baseUrl.trim().replace(/\/+$/, '') ?? '';
        const statusToken = config?.statusToken.trim() ?? '';
        if (!baseUrl || !statusToken || controller.signal.aborted) {
          throw new WorkerRefreshError();
        }
        const response = await fetcher(`${baseUrl}/jobs/refresh`, {
          method: 'POST',
          signal: controller.signal,
          redirect: 'error',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            'X-Matrix-Admin-Token': statusToken,
          },
          body: JSON.stringify({ lottery }),
        });
        if (!response.ok) {
          controller.abort();
          throw new WorkerRefreshError();
        }
        const refresh = parseRefresh(await response.json(), lottery);
        if (!refresh) throw new WorkerRefreshError();
        return refresh;
      })();
      try {
        return await Promise.race([work, timeout]);
      } catch {
        controller.abort();
        throw new WorkerRefreshError();
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    },
    async recoverLottery(
      lottery: CrawlerLottery,
      leaseOwner: string,
    ): Promise<WorkerRecovery> {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new WorkerRecoveryError());
        }, timeoutMs);
      });
      const work = (async (): Promise<WorkerRecovery> => {
        const config = await loadConfig();
        const baseUrl = config?.baseUrl.trim().replace(/\/+$/, '') ?? '';
        const statusToken = config?.statusToken.trim() ?? '';
        if (!baseUrl || !statusToken || controller.signal.aborted) {
          throw new WorkerRecoveryError();
        }
        const response = await fetcher(`${baseUrl}/jobs/recover`, {
          method: 'POST',
          signal: controller.signal,
          redirect: 'error',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            'X-Matrix-Admin-Token': statusToken,
          },
          body: JSON.stringify({ lottery, leaseOwner }),
        });
        if (!response.ok) throw new WorkerRecoveryError();
        const recovery = parseRecovery(await response.json(), lottery);
        if (!recovery) throw new WorkerRecoveryError();
        return recovery;
      })();
      try {
        return await Promise.race([work, timeout]);
      } catch {
        controller.abort();
        throw new WorkerRecoveryError();
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    },
  };
}
