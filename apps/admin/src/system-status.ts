export type SystemStatusItem = {
  id: string;
  name: string;
  description: string;
  group: string;
  location: 'AppDeploy' | 'Supabase' | 'GitHub' | 'Railway';
  endpoint: string;
  checkMode: 'live' | 'openapi' | 'service';
  checkEvidence?: 'live' | 'registered' | 'options' | 'inherited' | 'reported';
  ok: boolean;
  checkedAt: string;
  responseMs: number;
  retryable?: boolean;
  error?: string;
  detail?: unknown;
};

export type SystemStatusResult = { checkedAt: string; items: SystemStatusItem[] };
export type SystemStatusGroup = {
  location: SystemStatusItem['location'];
  items: SystemStatusItem[];
};
export type SystemStatusFact = {
  label: string;
  value: unknown;
  format?: 'date';
};
export type CrawlerRefreshResult = {
  lottery: string;
  period: string;
  drawDate: string | null;
};
export type SystemStatusActionOutcome = 'success' | 'partial-success' | 'failure';

const crawlerStatusIds = new Set([
  'cron-matrix-539-refresh-v2',
  'cron-matrix-fantasy5-refresh-v2',
  'cron-matrix-marksix-refresh-v2',
  'cron-matrix-649-refresh-v2',
]);
const statusLocationOrder: SystemStatusItem['location'][] = [
  'AppDeploy',
  'Supabase',
  'GitHub',
  'Railway',
];

// Older servers omit checkEvidence; keep their partial probes visibly limited too.
export function getSystemStatusPresentation(item: SystemStatusItem) {
  const evidence = item.checkEvidence ?? (
    item.endpoint.startsWith('/functions/v1/') ? 'options'
      : item.checkMode === 'openapi' ? 'registered'
        : item.location === 'Railway' && item.checkMode === 'service' ? 'inherited'
          : item.id === 'appdeploy-watchdog-heartbeat' || item.id.startsWith('cron-') ? 'reported' : 'live'
  );
  const presentations = {
    live: { label: '檢查通過', tone: 'good', scope: '唯讀連線檢查；不代表全部業務功能成功。' },
    registered: { label: '已登錄', tone: 'limited', scope: '僅檢查 RPC 登錄狀態，未驗證功能執行。' },
    options: { label: 'OPTIONS 可達', tone: 'limited', scope: '僅檢查 OPTIONS 回應，未驗證功能執行。' },
    inherited: { label: '服務可達', tone: 'limited', scope: '沿用 Railway 健康與排程 API 檢查，未驗證此端點。' },
    reported: { label: '回報正常', tone: 'good', scope: '依據最近心跳或排程紀錄，未重新執行工作。' },
  } as const;
  const presentation = presentations[evidence];
  return item.ok ? presentation : { ...presentation, label: '異常', tone: 'bad' as const };
}

export function groupSystemStatusItems(items: SystemStatusItem[]): SystemStatusGroup[] {
  return statusLocationOrder
    .map((location) => ({
      location,
      items: items.filter((item) => item.location === location),
    }))
    .filter((group) => group.items.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function getGithubStatusFacts(item: SystemStatusItem): SystemStatusFact[] {
  if (item.location !== 'GitHub' || !isRecord(item.detail)) return [];
  const workflow = isRecord(item.detail.workflow) ? item.detail.workflow : {};
  const facts: SystemStatusFact[] = [
    { label: 'Workflow 名稱', value: workflow.name },
    { label: 'Workflow 路徑', value: workflow.path },
    { label: 'Workflow 狀態', value: workflow.state },
  ];
  if (item.detail.latestRun === null) {
    return [...facts, { label: '最近執行', value: '尚無執行紀錄' }];
  }
  if (!isRecord(item.detail.latestRun)) return facts;
  return [
    ...facts,
    { label: '最近執行狀態', value: item.detail.latestRun.status },
    { label: '最近執行結果', value: item.detail.latestRun.conclusion },
    { label: '最近執行建立時間', value: item.detail.latestRun.createdAt, format: 'date' },
    { label: '最近執行更新時間', value: item.detail.latestRun.updatedAt, format: 'date' },
  ];
}

export function canRetrySystemStatus(item: SystemStatusItem) {
  return item.location === 'Railway' && !item.ok && Boolean(item.retryable);
}

export function focusSystemStatusAfterAction(
  section: HTMLElement | null,
  id: string,
  outcome: SystemStatusActionOutcome,
) {
  if (outcome === 'failure') return 'preserved' as const;
  if (!section) return 'missing' as const;
  const row = Array.from(section.querySelectorAll<HTMLElement>('[data-status-id]'))
    .find((candidate) => candidate.dataset.statusId === id);
  const target = row ?? section;
  target.focus();
  return row ? 'row' as const : 'section' as const;
}

export async function loadSystemStatus(api: { get(url: string): Promise<{ data: SystemStatusResult }> }) {
  const response = await api.get('/api/system-status');
  return response.data;
}

export async function retrySystemStatus(
  api: { post(url: string): Promise<{ data: { item: SystemStatusItem } }> },
  id: string,
) {
  const response = await api.post(`/api/system-status/${id}/retry`);
  return response.data.item;
}

export async function refreshCrawlerSystemStatus(
  api: { post(url: string): Promise<{ data: { refresh: CrawlerRefreshResult } }> },
  id: string,
) {
  const response = await api.post(`/api/system-status/${id}/refresh`);
  return response.data.refresh;
}

export function canRefreshCrawler(item: SystemStatusItem, canEdit: boolean) {
  if (!canEdit || item.location !== 'Supabase' || item.ok || !crawlerStatusIds.has(item.id)) return false;
  if (item.detail === null) return true;
  if (
    !item.detail
    || typeof item.detail !== 'object'
    || Array.isArray(item.detail)
  ) {
    return false;
  }
  return (item.detail as Record<string, unknown>).status === 'failed';
}
