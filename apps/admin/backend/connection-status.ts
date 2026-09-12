import { apiStatusInventory, type ApiCheckEvidence, type ApiStatusDefinition } from './api-status-inventory';
import type { SupabaseConfig } from './supabase';
import type { RailwayLatestAnalysis, WorkerStatus } from './worker-api';
import type { WatchdogStatus } from './watchdog-status';
import { createApiQueryChecks, queryCheckIds } from './api-query-checks';

type Row = Record<string, unknown>;
type Dependencies = {
  supabase: { selectRows<T = unknown>(table: string, query: string): Promise<T[]> };
  loadConfig: () => Promise<SupabaseConfig>;
  getWorkerStatus: () => Promise<WorkerStatus>;
  loadWorkerUrl?: () => Promise<string | undefined>;
  loadWatchdogStatus?: () => Promise<WatchdogStatus | null>;
  loadGithubToken?: () => Promise<string | null>;
  fetcher?: typeof fetch;
  now?: () => Date;
  requestTimeoutMs?: number;
};

export type ConnectionStatusItem = ApiStatusDefinition & {
  description: string;
  ok: boolean;
  healthState?: 'healthy' | 'running' | 'waiting' | 'unknown' | 'failed';
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

// Probe the complete production Cloudflare-to-Supabase route used by admins.
const adminUrl = 'https://matrixlottery.idv.tw';
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
// Match watchdog.ts JOB_STALE_MS: a running crawler uses its latest heartbeat.
const jobStaleMs = 20 * 60 * 1000;
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

const jobHealthState = (detail: ReturnType<typeof safeJobDetail> | null, checkedAt: string): NonNullable<ConnectionStatusItem['healthState']> => {
  if (!detail) return 'unknown';
  if (detail.status === 'failed' || detail.error) return 'failed';
  if (detail.status === 'success') return 'healthy';
  if (detail.status === 'waiting_source') return 'waiting';
  if (detail.status !== 'running') return 'unknown';
  const heartbeat = detail.updatedAt ?? detail.startedAt;
  const age = heartbeat ? Date.parse(checkedAt) - Date.parse(heartbeat) : NaN;
  if (!Number.isFinite(age) || age < 0) return 'unknown';
  return age > jobStaleMs ? 'failed' : 'running';
};

const descriptionFor = (definition: ApiStatusDefinition) => definition.description;
const safeErrorFor = (definition: ApiStatusDefinition, workerStatus?: WorkerStatus) => {
  if (definition.location === 'Railway' && workerStatus?.ok === false) {
    if (workerStatus.reason === 'SUPABASE_RAILWAY_CONFIG_MISSING') return 'Supabase 尚未完成 Railway 管理 API 設定';
    if (workerStatus.reason === 'RAILWAY_ADMIN_CONFIG_MISSING') return 'Railway 管理 API 尚未完成設定';
    if (workerStatus.reason === 'RAILWAY_AUTH_FAILED') return 'Railway 管理 API 驗證失敗';
  }
  if (definition.location === 'Railway') return 'Railway Worker API 暫時無法使用';
  if (definition.location === 'GitHub') return 'GitHub Actions API 暫時無法使用';
  if (definition.checkMode === 'registry') return '無法確認資料庫內是否有此 API';
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
    const registeredRpcs = memoizePromise(async () => {
      const current = await config();
      const names = apiStatusInventory.filter(item => item.checkMode === 'registry' && !queryCheckIds.has(item.id))
        .map(item => item.endpoint.slice('/rest/v1/rpc/'.length));
      const url = new URL(`${current.url}/rest/v1/rpc/admin_api_registry`);
      url.searchParams.set('select', 'rpc_name');
      url.searchParams.set('rpc_name', `in.(${names.join(',')})`);
      // OpenAPI is filtered by EXECUTE privileges and hides member-only RPCs.
      // This stable, service-only catalog query never invokes the listed functions.
      const response = await fetchWithDeadline(url.toString(), { method: 'GET', cache: 'no-store', redirect: 'error', headers: { apikey: current.serviceRoleKey, Authorization: `Bearer ${current.serviceRoleKey}` } });
      if (!response.ok) throw new Error('RPC_REGISTRY_UNAVAILABLE');
      const rows = await readJsonWithDeadline<unknown>(response);
      if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || typeof row.rpc_name !== 'string')) throw new Error('RPC_REGISTRY_INVALID');
      return new Set(rows.map(row => row.rpc_name as string));
    });
    const query = createApiQueryChecks({ loadWorkerUrl: () => withDeadline(async () => dependencies.loadWorkerUrl?.()), loadSupabaseConfig: config, fetcher, timeoutMs: requestTimeoutMs });
    return { config, worker, registeredRpcs, query };
  };
  const runDefinition = async (definition: ApiStatusDefinition, shared: ReturnType<typeof createSharedChecks>): Promise<ConnectionStatusItem> => {
    const started = now().getTime();
    const checkEvidence: ApiCheckEvidence = queryCheckIds.has(definition.id) ? 'query'
      : definition.id === 'supabase-watchdog-heartbeat' ? 'reported'
      : definition.endpoint.startsWith('/functions/v1/') ? 'options'
      : definition.checkMode === 'registry' ? 'registered'
      : definition.location === 'Railway' && definition.checkMode === 'service' ? 'inherited'
      : 'live';
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
      if (queryCheckIds.has(definition.id)) {
        const result = await shared.query(definition.id);
        return { ...finish(result.ok, { samples: result.samples }, result.error), ...(result.ok && result.waiting ? { healthState: 'waiting' as const } : {}), checkEvidence: result.ok && result.skipped ? 'no-sample' : 'query' };
      } else if (definition.id === 'admin-api') {
        const response = await fetchWithDeadline(`${adminUrl}${definition.endpoint}`, { cache: 'no-store', redirect: 'error' });
        if (!response.ok) throw new Error('ADMIN_API_UNAVAILABLE');
        if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new Error('ADMIN_API_INVALID');
        const health = await readJsonWithDeadline<unknown>(response);
        if (!health || typeof health !== 'object' || Array.isArray(health) || !('message' in health) || health.message !== 'Success') throw new Error('ADMIN_API_INVALID');
        detail = { status: response.status };
      } else if (definition.id === 'supabase-watchdog-heartbeat') {
        const heartbeat = await withDeadline(async () => dependencies.loadWatchdogStatus?.());
        if (!heartbeat) return finish(false, undefined, '尚無自動監控執行紀錄');
        detail = safeWatchdogDetail(heartbeat);
        const ageMs = now().getTime() - Date.parse(heartbeat.completedAt);
        if (!Number.isFinite(ageMs) || ageMs < -watchdogAllowedFutureSkewMs) {
          return finish(false, detail, '自動監控的執行時間異常');
        }
        if (ageMs > watchdogFreshnessMs) {
          return finish(false, detail, '自動監控已超過 18 分鐘未完成更新');
        }
        if (heartbeat.status !== 'ok') {
          return finish(false, detail, '最近一次自動監控回報異常');
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
        if (!response.ok) {
          const message = response.status === 405 ? '此 API 不接受連線檢查（HTTP 405）。'
            : response.status === 404 ? '找不到此 API（HTTP 404）。'
              : response.status === 401 || response.status === 403 ? `此 API 的存取驗證未通過（HTTP ${response.status}）。`
                : `此 API 回應異常（HTTP ${response.status}）。`;
          return finish(false, { status: response.status }, message);
        }
        detail = { status: response.status };
      } else if (definition.checkMode === 'registry') {
        const names = await shared.registeredRpcs();
        if (!names.has(definition.endpoint.slice('/rest/v1/rpc/'.length))) throw new Error('RPC_NOT_REGISTERED');
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
        if (definition.id === 'railway-health' && status.health) detail = status.health;
        else if (!status.ok) throw new Error('WORKER_UNAVAILABLE');
        else if (definition.id === 'railway-health') detail = status.health;
        else if (definition.id === 'railway-jobs-status') detail = status.jobs;
        else detail = { inheritedFrom: ['/health', '/jobs/status'] };
      } else throw new Error('UNSUPPORTED_STATUS_CHECK');
      return finish(true, detail);
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'STATUS_PROBE_TIMEOUT') return finish(false, undefined, '連線檢查逾時，請重新檢查。');
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
        const healthState = jobHealthState(detail, checkedAt);
        const ok = healthState === 'healthy' || healthState === 'running' || healthState === 'waiting';
        return {
          id: `cron-${jobName}`,
          name: `${lottery}資料更新排程`,
          description: '顯示各彩種自動更新資料的執行狀態。',
          group: '排程', location: 'Supabase', endpoint: '/rest/v1/system_job_status', checkMode: 'live', checkEvidence: 'reported', ok, healthState, checkedAt, responseMs: 0, detail,
          ...(healthState === 'failed' ? { error: detail?.status === 'running' && !detail.error ? '排程已超過 20 分鐘未更新執行紀錄。' : detail?.status === 'failed' ? '排程狀態：failed' : '排程執行失敗。' } : {}),
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
