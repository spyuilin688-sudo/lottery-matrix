import type { SupabaseConfig } from './supabase';

type Row = Record<string, unknown>;
type Dependencies = {
  supabase: { selectRows<T = unknown>(table: string, query: string): Promise<T[]> };
  loadConfig: () => Promise<SupabaseConfig>;
  loadWorkerBaseUrl: () => Promise<string>;
  fetcher?: typeof fetch;
  now?: () => Date;
};
type CoreCheckDefinition = {
  id: string;
  name: string;
  description: string;
  retryable?: boolean;
  operation: () => Promise<unknown>;
};

export type ConnectionStatusItem = {
  id: string;
  name: string;
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

const adminUrl = 'https://matrix-sanqwn.v2.appdeploy.ai/';
const jobDefinitions = [
  ['matrix-539-refresh-v2', '今彩539'],
  ['matrix-fantasy5-refresh-v2', '天天樂'],
  ['matrix-marksix-refresh-v2', '六合彩'],
  ['matrix-649-refresh-v2', '大樂透'],
] as const;

export function createConnectionStatus(dependencies: Dependencies) {
  const fetcher = dependencies.fetcher ?? fetch;
  const now = dependencies.now ?? (() => new Date());

  const check = async (
    id: string,
    name: string,
    description: string,
    operation: () => Promise<unknown>,
  ): Promise<ConnectionStatusItem> => {
    const started = now().getTime();
    try {
      const detail = await operation();
      return {
        id,
        name,
        description,
        ok: true,
        checkedAt: now().toISOString(),
        responseMs: Math.max(0, now().getTime() - started),
        detail,
      };
    } catch (cause) {
      return {
        id,
        name,
        description,
        ok: false,
        checkedAt: now().toISOString(),
        responseMs: Math.max(0, now().getTime() - started),
        error: cause instanceof Error ? cause.message : String(cause),
      };
    }
  };

  const probe = async (url: string, init: RequestInit = {}, accepted = [200]) => {
    const response = await fetcher(url, init);
    if (!accepted.includes(response.status)) throw new Error(`HTTP ${response.status}`);
    return { status: response.status };
  };

  const workerBaseUrl = async () => {
    const baseUrl = (await dependencies.loadWorkerBaseUrl()).trim().replace(/\/+$/, '');
    if (!baseUrl) throw new Error('Railway Worker URL is not configured');
    return baseUrl;
  };
  const workerUrl = async (path = '') => `${await workerBaseUrl()}${path}`;

  const coreChecks: CoreCheckDefinition[] = [
    {
      id: 'admin-appdeploy',
      name: '後臺 AppDeploy',
      description: '顯示後臺系統的部署及服務狀態。',
      operation: () => probe(adminUrl),
    },
    {
      id: 'worker-railway',
      name: 'Railway Worker',
      description: '顯示 Railway Worker 的公開服務狀態。',
      operation: async () => probe(await workerUrl(), {}, [200, 404]),
    },
    {
      id: 'worker-health-api',
      name: 'Railway 健康檢查 API',
      description: '確認 Railway Worker 與 Supabase 連線可正常回應。',
      retryable: true,
      operation: async () => probe(await workerUrl('/health')),
    },
    {
      id: 'worker-jobs-status-api',
      name: 'Railway 工作狀態 API',
      description: '讀取四彩種 Worker 最近執行狀態。',
      retryable: true,
      operation: async () => probe(await workerUrl('/jobs/status')),
    },
    {
      id: 'supabase-database',
      name: 'Supabase Database',
      description: '儲存會員、訂閱、付款及管理員資料。',
      operation: () => dependencies.supabase.selectRows('plans', 'select=id&limit=1'),
    },
    {
      id: 'supabase-auth',
      name: 'Supabase Auth',
      description: '處理會員登入、登出及帳號驗證。',
      operation: async () => {
        const config = await dependencies.loadConfig();
        const response = await fetcher(`${config.url}/auth/v1/settings`, {
          headers: { apikey: config.serviceRoleKey },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      },
    },
  ];

  const runCoreCheck = async (definition: typeof coreChecks[number]) => ({
    ...await check(definition.id, definition.name, definition.description, definition.operation),
    ...(definition.retryable ? { retryable: true } : {}),
  });

  return {
    async get() {
      const checkedAt = now().toISOString();
      const core = await Promise.all(coreChecks.map(runCoreCheck));
      let jobRows: Row[] = [];
      try {
        jobRows = await dependencies.supabase.selectRows<Row>(
          'system_job_status',
          'select=*&order=updated_at.desc',
        );
      } catch {
        jobRows = [];
      }
      const jobs = jobDefinitions.map(([jobName, lottery]) => {
        const row = jobRows.find((item) => item.job_name === jobName);
        const ok = row?.status === 'success';
        return {
          id: `cron-${jobName}`,
          name: `${lottery}資料更新排程`,
          description: '顯示各彩種自動更新資料的執行狀態。',
          ok,
          checkedAt,
          responseMs: 0,
          detail: row ?? null,
          ...(ok ? {} : {
            error: row ? String(row.error ?? `排程狀態：${row.status}`) : '尚無執行紀錄',
          }),
        } satisfies ConnectionStatusItem;
      });
      return { checkedAt, items: [...core, ...jobs] };
    },
    async retry(id: string) {
      const definition = coreChecks.find((item) => item.id === id && item.retryable);
      if (!definition) throw new ConnectionStatusError('此項目不支援重新呼叫');
      return runCoreCheck(definition);
    },
  };
}
