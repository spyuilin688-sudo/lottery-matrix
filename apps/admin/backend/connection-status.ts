import { apiStatusInventory, type ApiStatusDefinition } from './api-status-inventory';
import type { SupabaseConfig } from './supabase';
import type { RailwayLatestAnalysis, WorkerStatus } from './worker-api';

type Row = Record<string, unknown>;
type Dependencies = {
  supabase: { selectRows<T = unknown>(table: string, query: string): Promise<T[]> };
  loadConfig: () => Promise<SupabaseConfig>;
  getWorkerStatus: () => Promise<WorkerStatus>;
  fetcher?: typeof fetch;
  now?: () => Date;
};

export type ConnectionStatusItem = ApiStatusDefinition & {
  description: string;
  ok: boolean;
  checkedAt: string;
  responseMs: number;
  retryable?: boolean;
  error?: string;
  detail?: unknown;
};

export class ConnectionStatusError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'ConnectionStatusError';
    this.statusCode = statusCode;
  }
}

const adminUrl = 'https://matrix-sanqwn.v2.appdeploy.ai';
const jobDefinitions = [
  ['matrix-539-refresh-v2', '今彩539'],
  ['matrix-fantasy5-refresh-v2', '天天樂'],
  ['matrix-marksix-refresh-v2', '六合彩'],
  ['matrix-649-refresh-v2', '大樂透'],
] as const;
const jobStatuses = ['running', 'waiting_source', 'success', 'failed'] as const;
const retryableIds = new Set(['railway-health', 'railway-jobs-status']);

const nullableString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const safeJobDetail = (
  row: Row,
  jobName: string,
  lottery: string,
  analysis: RailwayLatestAnalysis | null,
) => {
  const status = typeof row.status === 'string'
    && jobStatuses.includes(row.status as typeof jobStatuses[number])
    ? row.status
    : 'unknown';
  return {
    jobName,
    lottery,
    status,
    startedAt: nullableString(row.started_at),
    finishedAt: nullableString(row.finished_at),
    finished_at: nullableString(row.finished_at),
    updatedAt: nullableString(row.updated_at),
    error: row.error ? 'WORKER_FAILED' : null,
    analysisStatus: analysis?.status ?? null,
    analysisPhase: analysis?.phase ?? null,
    analysisDrawPeriod: analysis?.drawPeriod ?? null,
    analysisCompletedAt: analysis?.completedAt ?? null,
  };
};

const descriptionFor = (definition: ApiStatusDefinition) => {
  if (definition.checkMode === 'openapi') return '確認此 Supabase RPC 已登錄且可供應用程式呼叫。';
  if (definition.checkMode === 'service') return '由所屬服務的健康檢查確認此端點可用。';
  return '以不修改資料的請求確認此端點目前可回應。';
};

const safeErrorFor = (
  definition: ApiStatusDefinition,
  workerStatus?: WorkerStatus,
) => {
  if (definition.location === 'Railway' && workerStatus?.ok === false) {
    if (workerStatus.reason === 'APPDEPLOY_CONFIG_MISSING') {
      return 'AppDeploy 尚未完成 Railway 管理 API 設定';
    }
    if (workerStatus.reason === 'RAILWAY_ADMIN_CONFIG_MISSING') {
      return 'Railway 管理 API 尚未完成設定';
    }
    if (workerStatus.reason === 'RAILWAY_AUTH_FAILED') {
      return 'Railway 管理 API 驗證失敗';
    }
  }
  if (definition.location === 'Railway') return 'Railway Worker API 暫時無法使用';
  if (definition.checkMode === 'openapi') return 'Supabase API 登錄檢查失敗';
  return `${definition.location} API 暫時無法使用`;
};

const memoizePromise = <T>(operation: () => Promise<T>) => {
  let pending: Promise<T> | undefined;
  return () => pending ??= operation();
};

export function createConnectionStatus(dependencies: Dependencies) {
  const fetcher = dependencies.fetcher ?? fetch;
  const now = dependencies.now ?? (() => new Date());

  const createSharedChecks = () => {
    const config = memoizePromise(dependencies.loadConfig);
    const worker = memoizePromise(dependencies.getWorkerStatus);
    const openApiPaths = memoizePromise(async () => {
      const current = await config();
      const response = await fetcher(`${current.url}/rest/v1/`, {
        cache: 'no-store',
        redirect: 'error',
        headers: { apikey: current.serviceRoleKey },
      });
      if (!response.ok) throw new Error('OPENAPI_UNAVAILABLE');
      const document = await response.json() as { paths?: unknown };
      if (!document.paths || typeof document.paths !== 'object' || Array.isArray(document.paths)) {
        throw new Error('OPENAPI_INVALID');
      }
      return new Set(Object.keys(document.paths));
    });
    return { config, worker, openApiPaths };
  };

  const runDefinition = async (
    definition: ApiStatusDefinition,
    shared: ReturnType<typeof createSharedChecks>,
  ): Promise<ConnectionStatusItem> => {
    const started = now().getTime();
    const base = {
      ...definition,
      description: descriptionFor(definition),
      checkedAt: now().toISOString(),
      responseMs: 0,
      ...(retryableIds.has(definition.id) ? { retryable: true } : {}),
    };
    try {
      let detail: unknown;
      if (definition.id === 'admin-api') {
        const response = await fetcher(`${adminUrl}${definition.endpoint}`, {
          cache: 'no-store',
          redirect: 'error',
        });
        if (!response.ok) throw new Error('ADMIN_API_UNAVAILABLE');
        detail = { status: response.status };
      } else if (definition.id === 'supabase-database') {
        await dependencies.supabase.selectRows('plans', 'select=id&limit=1');
        detail = { reachable: true };
      } else if (definition.id === 'supabase-auth') {
        const current = await shared.config();
        const response = await fetcher(`${current.url}${definition.endpoint}`, {
          cache: 'no-store',
          redirect: 'error',
          headers: { apikey: current.serviceRoleKey },
        });
        if (!response.ok) throw new Error('AUTH_UNAVAILABLE');
        detail = { status: response.status };
      } else if (definition.id === 'matrix-status-function') {
        const current = await shared.config();
        const response = await fetcher(`${current.url}${definition.endpoint}`, {
          method: 'OPTIONS',
          cache: 'no-store',
          redirect: 'error',
          headers: { apikey: current.serviceRoleKey },
        });
        if (!response.ok) throw new Error('FUNCTION_UNAVAILABLE');
        detail = { status: response.status };
      } else if (definition.checkMode === 'openapi') {
        const paths = await shared.openApiPaths();
        const registered = paths.has(definition.endpoint.replace('/rest/v1', ''));
        if (!registered) throw new Error('RPC_NOT_REGISTERED');
        detail = { registered: true };
      } else if (definition.location === 'Railway') {
        const status = await shared.worker();
        if (!status.ok) throw new Error('WORKER_UNAVAILABLE');
        if (definition.id === 'railway-health') detail = status.health;
        else if (definition.id === 'railway-jobs-status') detail = status.jobs;
        else detail = { inheritedFrom: ['/health', '/jobs/status'] };
      } else {
        throw new Error('UNSUPPORTED_STATUS_CHECK');
      }
      return {
        ...base,
        ok: true,
        checkedAt: now().toISOString(),
        responseMs: Math.max(0, now().getTime() - started),
        detail,
      };
    } catch {
      const workerStatus = definition.location === 'Railway'
        ? await shared.worker().catch(() => undefined)
        : undefined;
      return {
        ...base,
        ok: false,
        checkedAt: now().toISOString(),
        responseMs: Math.max(0, now().getTime() - started),
        error: safeErrorFor(definition, workerStatus),
      };
    }
  };

  return {
    async get() {
      const checkedAt = now().toISOString();
      const shared = createSharedChecks();
      const apiItems = await Promise.all(apiStatusInventory.map(
        (definition) => runDefinition(definition, shared),
      ));
      const latestWorkerStatus = await shared.worker().catch(() => null);
      let jobRows: Row[] = [];
      try {
        jobRows = await dependencies.supabase.selectRows<Row>(
          'system_job_status',
          'select=job_name,lottery,status,started_at,finished_at,updated_at,error&order=updated_at.desc',
        );
      } catch {
        jobRows = [];
      }
      const jobs = jobDefinitions.map(([jobName, lottery]) => {
        const row = jobRows.find((item) => item.job_name === jobName);
        const analysis = latestWorkerStatus?.ok
          ? latestWorkerStatus.jobs.items.find((item) => item.lottery === lottery)?.latestAnalysis ?? null
          : null;
        const detail = row ? safeJobDetail(row, jobName, lottery, analysis) : analysis ? {
          jobName,
          lottery,
          status: 'unknown',
          startedAt: null,
          finishedAt: null,
          finished_at: null,
          updatedAt: null,
          error: null,
          analysisStatus: analysis.status,
          analysisPhase: analysis.phase,
          analysisDrawPeriod: analysis.drawPeriod,
          analysisCompletedAt: analysis.completedAt,
        } : null;
        const ok = detail?.status === 'success';
        return {
          id: `cron-${jobName}`,
          name: `${lottery}資料更新排程`,
          description: '顯示各彩種自動更新資料的執行狀態。',
          group: '排程',
          location: 'Supabase',
          endpoint: '/rest/v1/system_job_status',
          checkMode: 'live',
          ok,
          checkedAt,
          responseMs: 0,
          detail,
          ...(ok ? {} : {
            error: detail ? `排程狀態：${detail.status}` : '尚無執行紀錄',
          }),
        } satisfies ConnectionStatusItem;
      });
      return { checkedAt, items: [...apiItems, ...jobs] };
    },
    async retry(id: string) {
      const definition = apiStatusInventory.find(
        (item) => item.id === id && retryableIds.has(item.id),
      );
      if (!definition) throw new ConnectionStatusError('此項目不支援重新呼叫');
      return runDefinition(definition, createSharedChecks());
    },
  };
}
