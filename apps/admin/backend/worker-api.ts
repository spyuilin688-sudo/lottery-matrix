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
};
export type RailwayJob = {
  jobName: string;
  lottery: string;
  status: 'running' | 'success' | 'failed';
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
  | { ok: false; health: null; jobs: null };
export type WorkerRefresh = {
  lottery: CrawlerLottery;
  period: string;
  drawDate: string | null;
};

const jobNameByLottery: Record<CrawlerLottery, string> = {
  今彩539: 'matrix-539-refresh-v2',
  天天樂: 'matrix-fantasy5-refresh-v2',
  六合彩: 'matrix-marksix-refresh-v2',
  大樂透: 'matrix-649-refresh-v2',
} as const;
type Lottery = CrawlerLottery;
const lotteries = Object.keys(jobNameByLottery) as Lottery[];
const jobStatuses = ['running', 'success', 'failed'] as const;
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
  return {
    status: 'ok',
    service: value.service,
    version: value.version,
    database: { status: 'ok' },
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

const unavailable = (): WorkerStatus => ({
  ok: false,
  health: null,
  jobs: null,
});

class WorkerRefreshError extends Error {
  statusCode = 503;

  constructor() {
    super('無法更新開獎資料，請稍後再試');
  }
}

export async function getWorkerConfig(
  reader: SecretReader,
): Promise<WorkerConfig | null> {
  try {
    const names = await reader.listSecretNames();
    if (
      !names.includes('RAILWAY_WORKER_URL')
      || !names.includes('MATRIX_ADMIN_STATUS_TOKEN')
    ) {
      return null;
    }
    const [baseUrlValue, tokenValue] = await Promise.all([
      reader.readSecret('RAILWAY_WORKER_URL'),
      reader.readSecret('MATRIX_ADMIN_STATUS_TOKEN'),
    ]);
    const baseUrl = String(baseUrlValue ?? '').trim().replace(/\/+$/, '');
    const statusToken = String(tokenValue ?? '').trim();
    return baseUrl && statusToken ? { baseUrl, statusToken } : null;
  } catch {
    return null;
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
        if (!baseUrl || !statusToken || controller.signal.aborted) {
          return unavailable();
        }
        const [healthResponse, jobsResponse] = await Promise.all([
          fetcher(`${baseUrl}/health`, {
            signal: controller.signal,
            redirect: 'error',
            cache: 'no-store',
          }),
          fetcher(`${baseUrl}/jobs/status`, {
            signal: controller.signal,
            redirect: 'error',
            cache: 'no-store',
            headers: { 'X-Matrix-Admin-Token': statusToken },
          }),
        ]);
        if (!healthResponse.ok || !jobsResponse.ok) {
          controller.abort();
          return unavailable();
        }
        const [healthValue, jobsValue] = await Promise.all([
          healthResponse.json(),
          jobsResponse.json(),
        ]);
        const health = parseHealth(healthValue);
        const jobs = parseJobs(jobsValue);
        return health && jobs ? { ok: true, health, jobs } : unavailable();
      })();
      try {
        return await Promise.race([work, timeout]);
      } catch {
        controller.abort();
        return unavailable();
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
  };
}
