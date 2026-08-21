import type { SupabaseConfig } from './supabase';

type Row = Record<string, unknown>;
type Dependencies = {
  supabase: { selectRows<T = unknown>(table: string, query: string): Promise<T[]> };
  loadConfig: () => Promise<SupabaseConfig>;
  fetcher?: typeof fetch;
  now?: () => Date;
};

export type ConnectionStatusItem = {
  id: string;
  name: string;
  description: string;
  ok: boolean;
  checkedAt: string;
  responseMs: number;
  error?: string;
  detail?: unknown;
};

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

  return {
    async get() {
      const checkedAt = now().toISOString();
      const core = await Promise.all([
        check('admin-appdeploy', '後臺 AppDeploy', '顯示後臺系統的部署及服務狀態。', async () => {
          const response = await fetcher(adminUrl);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return { status: response.status };
        }),
        check('api-appdeploy', 'API AppDeploy', '顯示 Matrix API 的部署及服務狀態。', async () => {
          const response = await fetcher(apiBase);
          if (response.status >= 500) throw new Error(`HTTP ${response.status}`);
          return { status: response.status };
        }),
        check('supabase-database', 'Supabase Database', '儲存會員、訂閱、付款及管理員資料。', () => dependencies.supabase.selectRows('plans', 'select=id&limit=1')),
        check('supabase-auth', 'Supabase Auth', '處理會員登入、登出及帳號驗證。', async () => {
          const config = await dependencies.loadConfig();
          const response = await fetcher(`${config.url}/auth/v1/settings`, { headers: { apikey: config.serviceRoleKey } });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        }),
        check('health-api', '健康檢查 API', '確認 Matrix API 服務是否正常運作。', () => http('/api/_healthcheck')),
        check('matrix-coverage-api', 'Matrix coverage API', '檢查四個彩種的資料涵蓋範圍與筆數。', () => http('/api/matrix/coverage')),
        check('matrix-audit-api', 'Matrix audit API', '檢查開獎資料是否缺期、重複或異常。', () => http('/api/matrix/audit')),
        check('matrix-algorithm-cases-api', 'Matrix algorithm cases API', '取得演算法案例與計算結果。', () => http('/api/matrix/algorithm/cases')),
      ]);
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
  };
}
