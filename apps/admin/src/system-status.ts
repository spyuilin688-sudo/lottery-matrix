import { matrixStorageStatusId, parseMatrixStorageHealth } from '../backend/matrix-storage-status';
import { apiStatusInventory, type ApiStatusDefinition, type ApiCheckEvidence } from '../backend/api-status-inventory';

export type SystemStatusItem = {
  id: string;
  name: string;
  description: string;
  group: string;
  location: 'Supabase' | 'GitHub' | 'Railway';
  endpoint: string;
  checkMode: 'live' | 'openapi' | 'registry' | 'service';
  checkEvidence?: ApiCheckEvidence;
  rpcAccess?: ApiStatusDefinition['rpcAccess'];
  ok: boolean;
  healthState?: 'healthy' | 'running' | 'waiting' | 'unknown' | 'failed';
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
  if (item.id === matrixStorageStatusId) {
    const storage = parseMatrixStorageHealth(item.detail);
    if (!storage) return { label: '狀態待確認', tone: 'limited' as const, scope: '目前無法取得完整儲存健康資料，請重新檢查。' };
    const tones = { Healthy: 'good', Warning: 'warning', Critical: 'bad' } as const;
    return { label: storage.status, tone: tones[storage.status], scope: '依資料庫回報的儲存健康判定，涵蓋分析版本、到期資料與清理紀錄。' };
  }
  if (item.healthState === 'unknown') return {
    label: item.detail === null ? '尚無執行紀錄' : '狀態待確認', tone: 'limited' as const,
    scope: '目前的執行紀錄不足以確認工作狀態，請稍後重新檢查。',
  };
  if (item.ok && item.healthState === 'running') return {
    label: '執行中', tone: 'limited' as const,
    scope: '工作正在執行，最近的執行紀錄仍持續更新，尚未完成。',
  };
  if (item.ok && item.healthState === 'waiting') {
    if (item.id === 'railway-cards') {
      const samples = isRecord(item.detail) && Array.isArray(item.detail.samples) ? item.detail.samples : [];
      if (samples.some(sample => isRecord(sample) && sample.waitingFor === 'generation')) return {
        label: '牌單產生中', tone: 'limited' as const, scope: '已取得最新開獎資料，部分彩種的牌單仍在產生中，本次尚未取得可用的 PNG。',
      };
      if (samples.some(sample => isRecord(sample) && sample.waitingFor === 'publication')) return {
        label: '牌單更新中', tone: 'limited' as const, scope: '檢查期間的開獎期別或牌單已有變動，本次尚未完成同一期別驗證，請稍後重新檢查。',
      };
      const official = samples.some(sample => isRecord(sample) && sample.waitingFor === 'official');
      return { label: official ? '等待正式開獎' : '落球尚未就緒', tone: 'limited' as const,
        scope: official ? '目前可用的順球牌單查詢正常；部分彩種仍等待正式開獎資料。' : '目前可用的順球牌單查詢正常；部分歷史資料尚無落球順序，落球牌單尚未就緒。' };
    }
    return { label: '等待開獎來源更新', tone: 'limited' as const, scope: '排程正在等待開獎來源更新，本次尚未完成新的資料更新。' };
  }
  const evidence = item.checkEvidence ?? (
    item.endpoint.startsWith('/functions/v1/') ? 'options'
      : item.checkMode === 'openapi' || item.checkMode === 'registry' ? 'registered'
        : item.location === 'Railway' && item.checkMode === 'service' ? 'inherited'
          : item.id === 'supabase-watchdog-heartbeat' || item.id.startsWith('cron-') ? 'reported' : 'live'
  );
  const access = item.rpcAccess ?? (apiStatusInventory.find(definition => definition.id === item.id) ?? apiStatusInventory.find(definition => definition.endpoint === item.endpoint))?.rpcAccess;
  const activity = isRecord(item.detail) && isRecord(item.detail.activity) ? item.detail.activity : null;
  const registration = access === 'member-read'
    ? { label: '需會員驗證', tone: 'limited', scope: 'API 已建立；此查詢需要會員登入，自動檢查尚未驗證會員查詢流程。' }
    : access === 'public-read'
      ? { label: '尚未驗證查詢', tone: 'limited', scope: '目前僅確認 API 已建立；請重新檢查以取得實際查詢結果。' }
      : activity?.state === 'recorded'
        ? { label: '有相關紀錄', tone: 'limited', scope: '已找到正式資料中的相關操作紀錄；可在明細查看時間與來源，本次未重新執行操作。' }
        : activity?.state === 'none'
          ? { label: '尚無相關紀錄', tone: 'limited', scope: 'API 已建立，目前保留的資料中尚無相關紀錄；沒有紀錄不代表功能故障。' }
          : activity?.state === 'unavailable'
            ? { label: '紀錄待確認', tone: 'limited', scope: 'API 已建立，但本次無法讀取相關紀錄；請重新檢查。' }
            : { label: '未驗證操作', tone: 'limited', scope: 'API 已建立；此操作會修改資料或工作狀態，自動檢查不會執行正式操作。目前沒有可獨立辨識的執行紀錄。' };
  const permissionQuery = item.id === 'supabase-rpc-matrix_permission_settings';
  const presentations = {
    query: { label: '查詢正常', tone: 'good', scope: permissionQuery ? '已實際讀取目前權限設定，兩項開關、版本與更新時間格式正常。' : '四彩種均完成實際查詢，回傳資料格式正常。' },
    data: { label: '分析資料可讀', tone: 'limited', scope: '四彩種順球分析資料已完成讀取檢查；會員登入、權限與查詢篩選流程仍需會員驗證。' },
    'no-sample': { label: '缺少測試資料', tone: 'limited', scope: isRecord(item.detail) && item.detail.probe === 'data' ? '分析資料可讀，但部分彩種沒有驗證樣本；本次未驗證會員查詢流程。' : '清單查詢正常，但部分彩種沒有符合條件的結果，本次無法完整檢查展開資料。' },
    live: { label: '連線正常', tone: 'good', scope: '此項連線或資料讀取檢查已通過。' },
    registered: registration,
    options: { label: '連線正常', tone: 'limited', scope: '已收到連線回應；自動檢查不會派送通知、處理事件或執行登出。' },
    inherited: { label: '主機正常', tone: 'limited', scope: '主機與排程查詢正常；自動檢查不會啟動資料更新或復原工作。' },
    reported: { label: '執行正常', tone: 'good', scope: '最近的執行紀錄正常；這次檢查沒有重新執行工作。' },
  } as const;
  const presentation = presentations[evidence];
  const failedScopes = {
    query: permissionQuery ? '權限設定查詢未通過，原因顯示於下方。' : '四彩種查詢未全部通過，原因顯示於下方。',
    data: '本次未完成四彩種分析資料讀取檢查，原因顯示於下方。',
    'no-sample': '本次未完成查詢驗證。',
    live: '本次連線或資料讀取檢查失敗。',
    registered: '這次無法確認資料庫內是否有此 API。',
    options: '這次連線檢查失敗，未執行此 API 的功能。',
    inherited: 'Railway 主機或排程查詢檢查失敗，尚未個別測試此 API。',
    reported: '最近的執行紀錄未通過檢查。',
  };
  return item.ok ? presentation : { ...presentation, label: '異常', tone: 'bad' as const, scope: failedScopes[evidence] };
}

export function getServiceEvidenceFacts(item: SystemStatusItem): SystemStatusFact[] {
  if (!isRecord(item.detail)) return [];
  const facts: SystemStatusFact[] = [];
  if (isRecord(item.detail.activity)) {
    const activity = item.detail.activity;
    if (typeof activity.source === 'string') facts.push({ label: '紀錄來源', value: activity.source });
    if (activity.state === 'recorded' && typeof activity.observedAt === 'string') facts.push({ label: '最近相關紀錄', value: activity.observedAt, format: 'date' });
    facts.push({ label: '驗證範圍', value: '目前保留的相關資料，不是逐次 API 呼叫紀錄；歷史紀錄不能保證現在每次操作成功。' });
  }
  if (item.id === 'supabase-rpc-matrix_permission_settings') {
    facts.push({ label: '設定版本', value: item.detail.revision }, { label: '設定更新時間', value: item.detail.updatedAt, format: 'date' });
  }
  if (Array.isArray(item.detail.samples)) for (const sample of item.detail.samples) {
    if (!isRecord(sample) || typeof sample.lottery !== 'string') continue;
    const suffix = sample.ok !== true ? '檢查未通過' : sample.skipped ? '沒有驗證樣本' : sample.waiting ? '等待資料更新' : '通過';
    const parts = [typeof sample.period === 'string' ? `${sample.period} 期` : '', Number.isInteger(sample.records) ? `${sample.records} 筆` : '', suffix].filter(Boolean);
    facts.push({ label: sample.lottery, value: parts.join(' · ') });
  }
  return facts;
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

export function getMatrixStorageFacts(item: SystemStatusItem, section: 'summary' | 'details' = 'details'): SystemStatusFact[] {
  if (item.id !== matrixStorageStatusId) return [];
  const storage = parseMatrixStorageHealth(item.detail);
  const size = (bytes: number | undefined) => bytes === undefined ? '無法取得'
    : `${(bytes / (bytes >= 1_000_000_000 ? 1_000_000_000 : 1_000_000)).toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${bytes >= 1_000_000_000 ? 'GB' : 'MB'}`;
  const count = (value: number | undefined) => value === undefined ? '無法取得' : value.toLocaleString('zh-TW');
  if (section === 'summary') return [{ label: '資料庫大小', value: size(storage?.database_size_bytes) }];
  const cleanup = storage?.cleanup;
  return [
    { label: '探索大小', value: size(storage?.tables.explore.size_bytes) },
    { label: '天衡大小', value: size(storage?.tables.tianheng.size_bytes) },
    { label: '成品大小', value: size(storage?.tables.artifacts.size_bytes) },
    { label: '分塊大小', value: size(storage?.tables.chunks.size_bytes) },
    { label: '啟用版本數', value: count(storage?.active_versions) },
    { label: '異常啟用版本數', value: count(storage?.active_unhealthy) },
    { label: '已取代列數', value: count(storage?.superseded_rows) },
    { label: '逾期可刪列數', value: count(storage?.expired_deletable_rows) },
    cleanup?.last_finished_at ? { label: '最近清理', value: cleanup.last_finished_at, format: 'date' }
      : { label: '最近清理', value: cleanup ? '尚無完成紀錄' : '無法取得' },
    cleanup?.last_started_at ? { label: '清理開始時間', value: cleanup.last_started_at, format: 'date' }
      : { label: '清理開始時間', value: cleanup ? '尚無開始紀錄' : '無法取得' },
    { label: '最近刪除列數', value: count(cleanup?.last_deleted) },
    { label: '清理待處理列數', value: count(cleanup?.deletable_backlog) },
    { label: '清理狀態', value: cleanup ? cleanup.cleanup_enabled ? '已啟用' : '已停用' : '無法取得' },
    { label: '清理錯誤', value: cleanup ? cleanup.last_error ? '最近清理回報錯誤' : '無' : '無法取得' },
    storage ? { label: '資料檢查時間', value: storage.checked_at, format: 'date' } : { label: '資料檢查時間', value: '無法取得' },
    { label: '大小單位', value: '1 MB = 1,000,000 bytes；1 GB = 1,000,000,000 bytes' },
  ];
}
