import { apiStatusInventory, type ApiCheckEvidence, type ApiStatusDefinition } from './api-status-inventory';
import type { SupabaseConfig } from './supabase';
import type { RailwayLatestAnalysis, WorkerStatus } from './worker-api';
import type { WatchdogStatus } from './watchdog-status';

type Row = Record<string, unknown>;
type Dependencies = {
  supabase: { selectRows<T = unknown>(table: string, query: string): Promise<T[]> };
  loadConfig: () => Promise<SupabaseConfig>;
  getWorkerStatus: () => Promise<WorkerStatus>;
  loadWatchdogStatus?: () => Promise<WatchdogStatus | null>;
  loadGithubToken?: () => Promise<string | null>;
  fetcher?: typeof fetch;
  now?: () => Date;
  requestTimeoutMs?: number;
};

export type ConnectionStatusItem = ApiStatusDefinition & {
  description: string;
  ok: boolean;
  checkEvidence?: ApiCheckEvidence;
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
const githubApiUrl = 'https://api.github.com';
const watchdogFreshnessMs = 18 * 60 * 1000;
const watchdogAllowedFutureSkewMs = 2 * 60 * 1000;
const defaultRequestTimeoutMs = 10_000;
const watchdogScheduleDetail = {
  physicalCronIntervalMinutes: 10,
  freshnessThresholdMinutes: 18,
  logicalPhases: [
    { intervalMinutes: 6, checks: 50 },
    { intervalMinutes: 10, checks: 60 },
    { intervalMinutes: 30, checks: 18 },
  ],
} as const;
const nullableString = (value: unknown): string | null => typeof value === 'string' ? value : null;

const safeJobDetail = (row: Row, jobName: string, lottery: string, analysis: RailwayLatestAnalysis | null) => {
  const status = typeof row.status === 'string' && jobStatuses.includes(row.status as typeof jobStatuses[number]) ? row.status : 'unknown';
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

const descriptionFor = (definition: ApiStatusDefinition) => definition.description;
const safeErrorFor = (definition: ApiStatusDefinition, workerStatus?: WorkerStatus) => {
  if (definition.location === 'Railway' && workerStatus?.ok === false) {
    if (workerStatus.reason === 'APPDEPLOY_CONFIG_MISSING') return 'AppDeploy 尚未完成 Railway 管理 API 設定';
    if (workerStatus.reason === 'RAILWAY_ADMIN_CONFIG_MISSING') return 'Railway 管理 API 尚未完成設定';
    if (workerStatus.reason === 'RAILWAY_AUTH_FAILED') return 'Railway 管理 API 驗證失敗';
  }
  if (definition.location === 'Railway') return 'Railway Worker API 暫時無法使用';
  if (definition.location === 'GitHub') return 'GitHub Actions API 暫時無法使用';
  if (definition.checkMode === 'openapi') return 'Supabase API 登錄檢查失敗';
  return `${definition.location} API 暫時無法使用`;
};
const safeWatchdogDetail = (status: WatchdogStatus) => ({
  status: status.status,
  checkedAt: status.checkedAt,
  completedAt: status.completedAt,
  dueLotteries: [...status.dueLotteries],
  actions: status.actions.map(({ lottery, target, reasons, outcome }) => ({
    lottery, target, reasons: [...reasons], outcome,
  })),
  ...(status.error ? { error: status.error } : {}),
  ...watchdogScheduleDetail,
});
const safeGithubDetail = (workflow: Row, run: Row | undefined) => ({
  workflow: {
    name: nullableString(workflow.name),
    path: nullableString(workflow.path),
    state: nullableString(workflow.state),
  },
  latestRun: run ? {
    status: nullableString(run.status),
    conclusion: nullableString(run.conclusion),
    createdAt: nullableString(run.created_at),
    updatedAt: nullableString(run.updated_at),
  } : null,
});
const memoizePromise = <T>(operation: () => Promise<T>) => {
  let pending: Promise<T> | undefined;
  return () => pending ??= operation();
};

export function createConnectionStatus(dependencies: Dependencies) {
  const fetcher = dependencies.fetcher ?? fetch;
  const now = dependencies.now ?? (() => new Date());
  const requestTimeoutMs = dependencies.requestTimeoutMs ?? defaultRequestTimeoutMs;
  const withDeadline = async <T>(operation: () => Promise<T>, onTimeout?: () => void): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        onTimeout?.();
        reject(new Error('STATUS_PROBE_TIMEOUT'));
      }, requestTimeoutMs);
    });
    try {
      return await Promise.race([operation(), timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };
  const fetchWithDeadline = (input: RequestInfo | URL, init: RequestInit = {}) => {
    const controller = new AbortController();
    return withDeadline(
      () => fetcher(input, { ...init, signal: controller.signal }),
      () => controller.abort(),
    );
  };
  const readJsonWithDeadline = <T>(response: Response) => withDeadline(() => response.json() as Promise<T>);
  const createSharedChecks = () => {
    const config = memoizePromise(() => withDeadline(dependencies.loadConfig));
    const worker = memoizePromise(() => withDeadline(dependencies.getWorkerStatus));
    const openApiPaths = memoizePromise(async () => {
      const current = await config();
      const response = await fetchWithDeadline(`${current.url}/rest/v1/`, { cache: 'no-store', redirect: 'error', headers: { apikey: current.serviceRoleKey } });
      if (!response.ok) throw new Error('OPENAPI_UNAVAILABLE');
      const document = await readJsonWithDeadline<{ paths?: unknown }>(response);
      if (!document.paths || typeof document.paths !== 'object' || Array.isArray(document.paths)) throw new Error('OPENAPI_INVALID');
      return new Set(Object.keys(document.paths));
    });
    return { config, worker, openApiPaths };
  };
  const runDefinition = async (definition: ApiStatusDefinition, shared: ReturnType<typeof createSharedChecks>): Promise<ConnectionStatusItem> => {
    const started = now().getTime();
    const checkEvidence: ApiCheckEvidence = definition.endpoint.startsWith('/functions/v1/') ? 'options'
      : definition.checkMode === 'openapi' ? 'registered'
      : definition.location === 'Railway' && definition.checkMode === 'service' ? 'inherited'
      : definition.id === 'appdeploy-watchdog-heartbeat' ? 'reported' : 'live';
    const base = { ...definition, checkEvidence, description: descriptionFor(definition), checkedAt: now().toISOString(), responseMs: 0, ...(retryableIds.has(definition.id) ? { retryable: true } : {}) };
    const finish = (ok: boolean, detail?: unknown, error?: string): ConnectionStatusItem => ({
      ...base,
      ok,
      checkedAt: now().toISOString(),
      responseMs: Math.max(0, now().getTime() - started),
      ...(detail === undefined ? {} : { detail }),
      ...(error ? { error } : {}),
    });
    try {
      let detail: unknown;
      if (definition.id === 'admin-api') {
        const response = await fetchWithDeadline(`${adminUrl}${definition.endpoint}`, { cache: 'no-store', redirect: 'error' });
        if (!response.ok) throw new Error('ADMIN_API_UNAVAILABLE');
        detail = { status: response.status };
      } else if (definition.id === 'appdeploy-watchdog-heartbeat') {
        const heartbeat = await withDeadline(async () => dependencies.loadWatchdogStatus?.());
        if (!heartbeat) return finish(false, undefined, '尚無 AppDeploy 獨立監控心跳');
        detail = safeWatchdogDetail(heartbeat);
        const ageMs = now().getTime() - Date.parse(heartbeat.completedAt);
        if (!Number.isFinite(ageMs) || ageMs < -watchdogAllowedFutureSkewMs) {
          return finish(false, detail, 'AppDeploy 獨立監控心跳時間異常');
        }
        if (ageMs > watchdogFreshnessMs) {
          return finish(false, detail, 'AppDeploy 獨立監控心跳已超過 18 分鐘');
        }
        if (heartbeat.status !== 'ok') {
          return finish(false, detail, 'AppDeploy 獨立監控心跳回報降級');
        }
      } else if (definition.id === 'supabase-database') {
        await withDeadline(() => dependencies.supabase.selectRows('plans', 'select=id&limit=1'));
        detail = { reachable: true };
      } else if (definition.id === 'supabase-auth') {
        const current = await shared.config();
        const response = await fetchWithDeadline(`${current.url}${definition.endpoint}`, { cache: 'no-store', redirect: 'error', headers: { apikey: current.serviceRoleKey } });
        if (!response.ok) throw new Error('AUTH_UNAVAILABLE');
        detail = { status: response.status };
      } else if (definition.endpoint.startsWith('/functions/v1/')) {
        const current = await shared.config();
        const response = await fetchWithDeadline(`${current.url}${definition.endpoint}`, { method: 'OPTIONS', cache: 'no-store', redirect: 'error', headers: { apikey: current.serviceRoleKey, Authorization: `Bearer ${current.serviceRoleKey}` } });
        if (!response.ok) throw new Error('FUNCTION_UNAVAILABLE');
        detail = { status: response.status };
      } else if (definition.checkMode === 'openapi') {
        const paths = await shared.openApiPaths();
        if (!paths.has(definition.endpoint.replace('/rest/v1', ''))) throw new Error('RPC_NOT_REGISTERED');
        detail = { registered: true };
      } else if (definition.location === 'GitHub') {
        const token = await withDeadline(async () => dependencies.loadGithubToken?.());
        if (!token) throw new Error('GITHUB_CONFIG_MISSING');
        const headers = {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        };
        const workflowUrl = `${githubApiUrl}${definition.endpoint}`;
        const [workflowResponse, runsResponse] = await Promise.all([
          fetchWithDeadline(workflowUrl, { method: 'GET', cache: 'no-store', redirect: 'error', headers }),
          fetchWithDeadline(`${workflowUrl}/runs?per_page=1`, { method: 'GET', cache: 'no-store', redirect: 'error', headers }),
        ]);
        if (!workflowResponse.ok || !runsResponse.ok) throw new Error('GITHUB_UNAVAILABLE');
        const workflow = await readJsonWithDeadline<Row>(workflowResponse);
        const runs = await readJsonWithDeadline<{ workflow_runs?: unknown }>(runsResponse);
        const latestRun = Array.isArray(runs.workflow_runs) && runs.workflow_runs[0] && typeof runs.workflow_runs[0] === 'object'
          ? runs.workflow_runs[0] as Row
          : undefined;
        detail = safeGithubDetail(workflow, latestRun);
      } else if (definition.location === 'Railway') {
        const status = await shared.worker();
        if (!status.ok) throw new Error('WORKER_UNAVAILABLE');
        if (definition.id === 'railway-health') detail = status.health;
        else if (definition.id === 'railway-jobs-status') detail = status.jobs;
        else detail = { inheritedFrom: ['/health', '/jobs/status'] };
      } else throw new Error('UNSUPPORTED_STATUS_CHECK');
      return finish(true, detail);
    } catch {
      const workerStatus = definition.location === 'Railway' ? await shared.worker().catch(() => undefined) : undefined;
      return finish(false, undefined, safeErrorFor(definition, workerStatus));
    }
  };
  return {
    async get() {
      const checkedAt = now().toISOString();
      const shared = createSharedChecks();
      const apiItems = await Promise.all(apiStatusInventory.map((definition) => runDefinition(definition, shared)));
      const latestWorkerStatus = await shared.worker().catch(() => null);
      let jobRows: Row[] = [];
      try {
        jobRows = await withDeadline(() => dependencies.supabase.selectRows<Row>('system_job_status', 'select=job_name,lottery,status,started_at,finished_at,updated_at,error&order=updated_at.desc'));
      } catch { jobRows = []; }
      const jobs = jobDefinitions.map(([jobName, lottery]) => {
        const row = jobRows.find((item) => item.job_name === jobName);
        const analysis = latestWorkerStatus?.ok ? latestWorkerStatus.jobs.items.find((item) => item.lottery === lottery)?.latestAnalysis ?? null : null;
        const detail = row ? safeJobDetail(row, jobName, lottery, analysis) : analysis ? {
          jobName, lottery, status: 'unknown', startedAt: null, finishedAt: null, finished_at: null, updatedAt: null, error: null,
          analysisStatus: analysis.status, analysisPhase: analysis.phase, analysisDrawPeriod: analysis.drawPeriod, analysisCompletedAt: analysis.completedAt,
        } : null;
        const ok = detail?.status === 'success' || detail?.status === 'waiting_source';
        return {
          id: `cron-${jobName}`,
          name: `${lottery}資料更新排程`,
          description: '顯示各彩種自動更新資料的執行狀態。',
          group: '排程', location: 'Supabase', endpoint: '/rest/v1/system_job_status', checkMode: 'live', checkEvidence: 'reported', ok, checkedAt, responseMs: 0, detail,
          ...(ok ? {} : { error: detail ? `排程狀態：${detail.status}` : '尚無執行紀錄' }),
        } satisfies ConnectionStatusItem;
      });
      return { checkedAt, items: [...apiItems, ...jobs] };
    },
    async retry(id: string) {
      const definition = apiStatusInventory.find((item) => item.id === id && retryableIds.has(item.id));
      if (!definition) throw new ConnectionStatusError('此項目不支援重新呼叫');
      return runDefinition(definition, createSharedChecks());
    },
  };
}
