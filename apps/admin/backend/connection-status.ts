import type { SupabaseConfig } from './supabase';

type Row = Record<string, unknown>;
type Dependencies = {
  supabase: { selectRows<T = unknown>(table: string, query: string): Promise<T[]> };
  loadConfig: () => Promise<SupabaseConfig>;
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

const apiBase = 'https://api-v2.appdeploy.ai/app/app-snsxet';
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
      return { id, name, description, ok: true, checkedAt: now().toISOString(), responseMs: Math.max(0, now().getTime() - started), detail };
    } catch (cause) {
      return {
        id, name, description, ok: false, checkedAt: now().toISOString(), responseMs: Math.max(0, now().getTime() - started),
        error: cause instanceof Error ? cause.message : String(cause),
      };
    }
  };
  const http = async (path: string) => {
    const response = await fetcher(`${apiBase}${path}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  };
  const coreChecks: CoreCheckDefinition[] = [
    {
      id: 'admin-appdeploy',
      name: '後臺 AppDeploy',
      description: '顯示後臺系統的部署及服務狀態。',
      operation: async () => {
        const response = await fetcher(adminUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return { status: response.status };
      },
    },
    {
      id: 'api-appdeploy',
      name: 'API AppDeploy',
      description: '顯示 Matrix API 的部署及服務狀態。',
      retryable: true,
      operation: async () => {
        const response = await fetcher(apiBase);
        if (response.status >= 500) throw new Error(`HTTP ${response.status}`);
        return { status: response.status };
      },
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
        const response = await fetcher(`${config.url}/auth/v1/settings`, { headers: { apikey: config.serviceRoleKey } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      },
    },
    {
      id: 'health-api',
      name: '健康檢查 API',
      description: '確認 Matrix API 服務是否正常運作。',
      retryable: true,
      operation: () => http('/api/_healthcheck'),
    },
    {
      id: 'matrix-coverage-api',
      name: 'Matrix coverage API',
      description: '檢查四個彩種的資料涵蓋範圍與筆數。',
      retryable: true,
      operation: () => http('/api/matrix/coverage'),
    },
    {
      id: 'matrix-audit-api',
      name: 'Matrix audit API',
      description: '檢查開獎資料是否缺期、重複或異常。',
      retryable: true,
      operation: () => http('/api/matrix/audit'),
    },
    {
      id: 'matrix-algorithm-cases-api',
      name: 'Matrix algorithm cases API',
      description: '取得演算法案例與計算結果。',
      retryable: true,
      operation: () => http('/api/matrix/algorithm/cases'),
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
        jobRows = await dependencies.supabase.selectRows<Row>('system_job_status', 'select=*&order=updated_at.desc');
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
          ...(ok ? {} : { error: row ? String(row.error ?? `排程狀態：${row.status}`) : '尚無執行紀錄' }),
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
