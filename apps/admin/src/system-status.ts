export type SystemStatusItem = {
  id: string;
  name: string;
  description: string;
  group: string;
  location: 'Supabase' | 'GitHub' | 'Railway';
  endpoint: string;
  checkMode: 'live' | 'openapi' | 'registry' | 'service';
  checkEvidence?: 'live' | 'registered' | 'options' | 'inherited' | 'reported' | 'query' | 'no-sample';
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
  'Supabase',
  'GitHub',
  'Railway',
];

// Older servers omit checkEvidence; keep their partial probes visibly limited too.
export function getSystemStatusPresentation(item: SystemStatusItem) {
  const evidence = item.checkEvidence ?? (
    item.endpoint.startsWith('/functions/v1/') ? 'options'
      : item.checkMode === 'openapi' || item.checkMode === 'registry' ? 'registered'
        : item.location === 'Railway' && item.checkMode === 'service' ? 'inherited'
          : item.id === 'supabase-watchdog-heartbeat' || item.id.startsWith('cron-') ? 'reported' : 'live'
  );
  const memberRead = /(?:matrix_(?:tianyan|tiangong)_(?:list|validation)|matrix_custom_status_list|member_(?:referral_summary|profile|notification_settings_get|pending_transfer_request|payment_history_get|push_subscription_status))$/.test(item.id);
  const presentations = {
    query: { label: '查詢正常', tone: 'good', scope: '四彩種均完成實際查詢，回傳資料格式正常。' },
    'no-sample': { label: '缺少測試資料', tone: 'limited', scope: '探索查詢正常，但部分彩種沒有符合條件的結果，本次無法完整檢查展開資料。' },
    live: { label: '連線正常', tone: 'good', scope: '此項連線或資料讀取檢查已通過。' },
    registered: { label: 'API 已建立', tone: 'limited', scope: memberRead ? '此查詢需要會員登入；自動檢查僅確認 API 已建立，沒有讀取會員資料。' : 'API 已建立；此操作會修改資料或工作狀態，自動檢查不會執行正式操作。' },
    options: { label: '連線正常', tone: 'limited', scope: '已收到連線回應；自動檢查不會派送通知、處理事件或執行登出。' },
    inherited: { label: '主機正常', tone: 'limited', scope: '主機與排程查詢正常；自動檢查不會啟動資料更新或復原工作。' },
    reported: { label: '執行正常', tone: 'good', scope: '最近的執行紀錄正常；這次檢查沒有重新執行工作。' },
  } as const;
  const presentation = presentations[evidence];
  const failedScopes = {
    query: '四彩種查詢未全部通過，原因顯示於下方。',
    'no-sample': '本次未完成查詢驗證。',
    live: '本次連線或資料讀取檢查失敗。',
    registered: '這次無法確認資料庫內是否有此 API。',
    options: '這次連線檢查失敗，未執行此 API 的功能。',
    inherited: 'Railway 主機或排程查詢檢查失敗，尚未個別測試此 API。',
    reported: '最近的執行紀錄未通過檢查。',
  };
  return item.ok ? presentation : { ...presentation, label: '異常', tone: 'bad' as const, scope: failedScopes[evidence] };
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
    { label: '排程名稱', value: workflow.name },
    { label: '排程檔案', value: workflow.path },
    { label: '排程開關', value: formatSystemStatusValue(workflow.state) },
  ];
  if (item.detail.latestRun === null) {
    return [...facts, { label: '最近執行', value: '尚無執行紀錄' }];
  }
  if (!isRecord(item.detail.latestRun)) return facts;
  return [
    ...facts,
    { label: '最近執行狀態', value: formatSystemStatusValue(item.detail.latestRun.status) },
    { label: '最近執行結果', value: formatSystemStatusValue(item.detail.latestRun.conclusion) },
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

export function formatSystemStatusValue(value: unknown): string {
  const labels: Record<string, string> = {
    ok: '正常', success: '已完成', succeeded: '已完成', completed: '已結束',
    failed: '失敗', failure: '失敗', running: '執行中', in_progress: '執行中',
    waiting_source: '等待開獎來源更新', queued: '等待執行', active: '已啟用',
    disabled_manually: '已手動停用', cancelled: '已取消', skipped: '已略過',
  };
  if (value === null || value === undefined || value === '') return '尚無紀錄';
  return labels[String(value)] ?? String(value);
}
