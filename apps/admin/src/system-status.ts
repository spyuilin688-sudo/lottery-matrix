import { parseManualRefresh, type ManualRefreshTask } from '../shared/manual-refresh';
import { matrixStorageStatusId, parseMatrixStorageHealth } from '../backend/matrix-storage-status';
import { nativeNotificationStatusId, parseNativeNotificationHealth } from '../backend/native-notification-status';
import { apiStatusInventory, type ApiStatusDefinition, type ApiCheckEvidence, type ApiLocation } from '../backend/api-status-inventory';

export type SystemStatusItem = {
  id: string;
  name: string;
  description: string;
  group: string;
  location: ApiLocation;
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
  'TinyFish',
];

// Older servers omit checkEvidence; keep their partial probes visibly limited too.
export function getSystemStatusPresentation(item: SystemStatusItem) {
  if (item.id === nativeNotificationStatusId) {
    const health = parseNativeNotificationHealth(item.detail, new Date(item.checkedAt));
    if (!health) return { label: '狀態待確認', tone: 'limited' as const, scope: '目前無法取得完整通知派送健康資料，請重新檢查。' };
    const scope = '已讀取事件觸發、動態 Recovery、每小時保底與 Web／Native／管理員通知佇列；健康檢查不發送測試通知，裝置實際顯示仍需正式派送紀錄確認。';
    if (!item.ok) return { label: '需查看紀錄', tone: 'warning' as const, scope };
    return { label: '事件派送正常', tone: 'limited' as const, scope };
  }
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
    if (item.id === 'supabase-watchdog-heartbeat') {
      const schedule = isRecord(item.detail) && isRecord(item.detail.schedule) ? item.detail.schedule : null;
      return schedule?.pendingSince ? { label: '等待監控完成', tone: 'limited' as const, scope: '已到指定檢查時點，正在等待新的監控結果；下方保留上次紀錄。' }
        : { label: '排程待命', tone: 'limited' as const, scope: '排程持續檢查，目前未到指定檢查時點；下方保留上次紀錄。' };
    }
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
    ? { label: '需會員流程驗證', tone: 'limited', scope: 'API 已確認存在；此查詢需要會員登入與會員權限，自動健康檢查不會假冒會員執行完整流程。' }
    : access === 'public-read'
      ? { label: 'API 已確認', tone: 'limited', scope: 'API 已確認存在，但此項目前沒有獨立的實際查詢探測。' }
      : activity?.state === 'recorded'
        ? { label: '正式執行紀錄', tone: 'limited', scope: '已在正式資料中找到相關執行證據；本次健康檢查沒有重新執行寫入操作。' }
        : activity?.state === 'none'
          ? { label: '尚無執行紀錄', tone: 'limited', scope: 'API 已確認存在，目前保留的正式資料中尚無相關執行紀錄；沒有紀錄不代表功能故障。' }
          : activity?.state === 'unavailable'
            ? { label: '紀錄待確認', tone: 'limited', scope: 'API 已確認存在，但本次無法讀取正式執行證據；請重新檢查。' }
            : { label: 'API 已確認', tone: 'limited', scope: 'API 已確認存在；為避免修改正式資料、工作狀態或發送通知，健康檢查不自動執行寫入操作。' };
  const permissionQuery = item.id === 'supabase-rpc-matrix_permission_settings';
  const presentations = {
    query: { label: '實際查詢已驗證', tone: 'good', scope: permissionQuery ? '已實際讀取目前權限設定，兩項開關、版本與更新時間格式正常。' : '四彩種均完成實際查詢，回傳資料格式正常。' },
    data: { label: '正式資料已驗證', tone: 'limited', scope: '已直接讀取正式分析資料並檢查格式；會員登入、權限與查詢篩選流程仍需會員身分流程驗證。' },
    'no-sample': { label: '缺少驗證樣本', tone: 'limited', scope: isRecord(item.detail) && item.detail.probe === 'data' ? '正式分析資料可讀，但部分彩種沒有可驗證樣本；本次不推定會員流程已通過。' : '清單查詢正常，但部分彩種沒有符合條件的結果，本次無法完整檢查展開資料。' },
    live: { label: '即時檢查正常', tone: 'good', scope: '已在本次檢查中實際完成連線或唯讀資料讀取。' },
    registered: registration,
    options: { label: 'Endpoint 已驗證', tone: 'limited', scope: '已確認 Endpoint 可回應 OPTIONS；健康檢查不會為驗證而派送通知、處理事件或執行登出。' },
    inherited: { label: '所屬服務已驗證', tone: 'limited', scope: '已驗證所屬 Railway 主機與排程查詢；健康檢查不會為驗證而啟動資料更新或復原工作。' },
    reported: { label: '執行紀錄正常', tone: 'good', scope: '已讀取最近正式執行紀錄；這次檢查沒有重新執行工作。' },
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


export type SystemStatusOperationalState = 'normal' | 'waiting' | 'no-action' | 'needs-action';

export type SystemStatusOperationalPresentation = {
  state: SystemStatusOperationalState;
  label: '正常' | '等待' | '無需處理' | '需處理';
  tone: 'good' | 'waiting' | 'neutral' | 'bad';
  summary: string;
};

export function getSystemStatusOperationalPresentation(item: SystemStatusItem): SystemStatusOperationalPresentation {
  const normal = (summary = '目前運作正常，無需處理。'): SystemStatusOperationalPresentation => ({
    state: 'normal', label: '正常', tone: 'good', summary,
  });
  const waiting = (summary: string): SystemStatusOperationalPresentation => ({
    state: 'waiting', label: '等待', tone: 'waiting', summary,
  });
  const noAction = (summary: string): SystemStatusOperationalPresentation => ({
    state: 'no-action', label: '無需處理', tone: 'neutral', summary,
  });
  const needsAction = (summary = '檢查結果有異常，請查看下方原因與技術明細。'): SystemStatusOperationalPresentation => ({
    state: 'needs-action', label: '需處理', tone: 'bad', summary,
  });

  if (item.id === nativeNotificationStatusId) {
    const health = parseNativeNotificationHealth(item.detail, new Date(item.checkedAt));
    if (!health || !item.ok) return needsAction('通知派送健康資料不完整或有異常，請查看下方原因。');
    return normal('目前運作正常。通知事件、動態 Recovery 與派送佇列沒有需要處理的異常。');
  }

  if (item.id === matrixStorageStatusId) {
    const storage = parseMatrixStorageHealth(item.detail);
    if (!storage) return needsAction('目前無法取得完整儲存健康資料，請重新檢查。');
    if (storage.status !== 'Healthy') return needsAction(`儲存健康狀態為 ${storage.status}，請查看技術明細。`);
    return normal('Matrix 儲存與清理狀態目前正常。');
  }

  if (item.healthState === 'unknown') {
    if (item.detail === null && !item.error) {
      return noAction('目前尚未產生相關執行紀錄，不代表功能異常。');
    }
    return needsAction('目前資料不足以確認工作狀態，請重新檢查或查看紀錄。');
  }

  if (item.ok && item.healthState === 'running') {
    return waiting('工作正在執行，等待完成即可，目前不需要人工處理。');
  }

  if (item.ok && item.healthState === 'waiting') {
    return waiting('目前為正常等待狀態，待開獎來源、排程或資料產生後系統會再更新。');
  }

  if (!item.ok) return needsAction();

  const evidence = item.checkEvidence ?? (
    item.endpoint.startsWith('/functions/v1/') ? 'options'
      : item.checkMode === 'openapi' || item.checkMode === 'registry' ? 'registered'
        : item.location === 'Railway' && item.checkMode === 'service' ? 'inherited'
          : item.id === 'supabase-watchdog-heartbeat' || item.id.startsWith('cron-') ? 'reported' : 'live'
  );
  const access = item.rpcAccess ?? (apiStatusInventory.find(definition => definition.id === item.id)
    ?? apiStatusInventory.find(definition => definition.endpoint === item.endpoint))?.rpcAccess;
  const activity = isRecord(item.detail) && isRecord(item.detail.activity) ? item.detail.activity : null;

  if (evidence === 'no-sample') {
    return waiting('目前沒有可驗證樣本，待有符合條件的資料後系統再確認。');
  }
  if (evidence === 'query' || evidence === 'live' || evidence === 'reported') {
    return normal();
  }
  if (evidence === 'options') {
    return normal('Endpoint 連線正常；健康檢查不會為驗證而執行正式操作。');
  }
  if (evidence === 'inherited') {
    return normal('所屬 Railway 服務與排程目前正常；健康檢查不會另外啟動工作。');
  }
  if (evidence === 'data') {
    return noAction('目前無需處理。正式資料可讀；完整會員身分流程不由健康檢查自動執行。');
  }
  if (access === 'member-read') {
    return noAction('目前無需處理。API 已確認；完整會員登入流程不由健康檢查自動執行。');
  }
  if (activity?.state === 'recorded') {
    return normal('已找到近期正式執行紀錄，目前沒有異常。');
  }
  if (activity?.state === 'none' || activity?.state === 'not-recorded') {
    return noAction('目前無需處理。尚未產生相關操作紀錄，不代表功能異常。');
  }
  if (activity?.state === 'unavailable') {
    return noAction('目前無需處理。API 已確認；本次沒有可用的正式執行紀錄。');
  }
  if (access === 'operation') {
    return noAction('目前無需處理。API 已確認；健康檢查不會主動執行寫入操作。');
  }
  return noAction('目前無需處理。API 已確認，目前沒有異常證據。');
}

export function getServiceEvidenceFacts(item: SystemStatusItem): SystemStatusFact[] {
  if (item.id === nativeNotificationStatusId) {
    const health = parseNativeNotificationHealth(item.detail, new Date(item.checkedAt));
    if (!health) return [];
    const count = (value: number) => value.toLocaleString('zh-TW');
    const time = (label: string, value: string | null): SystemStatusFact => value ? { label, value, format: 'date' } : { label, value: '尚無紀錄' };
    return [
      { label: '驗證方式', value: '事件觸發＋Recovery＋正式佇列紀錄' },
      { label: '派送模式', value: '事件觸發' },
      { label: '事件觸發', value: health.event_trigger_enabled ? '已啟用' : '已停用' },
      { label: '管理員轉帳觸發', value: health.admin_transfer_trigger_enabled ? '已啟用' : '已停用' },
      { label: 'Recovery 開關', value: health.recovery.enabled ? '已啟用' : '已停用' },
      { label: 'Recovery 模式', value: health.recovery.strategy === 'dynamic-with-hourly-fallback' ? '依待處理時間動態排程' : health.recovery.strategy },
      { label: '動態排程觸發器', value: health.recovery.queue_trigger_enabled ? '已啟用' : '未完整啟用' },
      { label: 'Recovery 保底', value: health.recovery.schedule === '7 * * * *' ? '每小時' : (health.recovery.schedule ?? '未設定') },
      { label: '動態 Recovery', value: health.recovery.dynamic_enabled ? '已排程' : '目前無排程' },
      health.recovery.next_due_at ? time('下次 Recovery', health.recovery.next_due_at) : { label: '下次 Recovery', value: '目前無待處理工作' },
      time('最近 Recovery 開始', health.recovery.last_started_at),
      time('最近 Recovery 結束', health.recovery.last_finished_at),
      { label: '最近 Recovery 結果', value: formatSystemStatusValue(health.recovery.last_status) },
      { label: 'Web 待處理', value: count(health.web.pending) },
      { label: 'Web 處理中', value: count(health.web.processing) },
      { label: 'Web 逾時', value: count(health.web.overdue) },
      { label: '24 小時 Web 派送成功', value: count(health.web.sent_24h) },
      { label: '24 小時 Web 派送失敗', value: count(health.web.failed_24h) },
      { label: 'Native 啟用裝置', value: count(health.native.enabled_devices) },
      { label: 'Native 待處理', value: count(health.native.pending) },
      { label: 'Native 處理中', value: count(health.native.processing) },
      { label: 'Native 逾時', value: count(health.native.overdue) },
      { label: '24 小時 Native 派送成功', value: count(health.native.sent_24h) },
      { label: '24 小時 Native 派送失敗', value: count(health.native.failed_24h) },
      { label: 'Admin 啟用訂閱', value: count(health.admin.enabled_subscriptions) },
      { label: 'Admin 待處理', value: count(health.admin.pending) },
      { label: 'Admin 處理中', value: count(health.admin.sending) },
      { label: 'Admin 逾時', value: count(health.admin.overdue) },
      { label: '24 小時 Admin 派送成功', value: count(health.admin.sent_24h) },
      { label: '24 小時 Admin 派送失敗', value: count(health.admin.failed_24h) },
      time('最近 Web 派送成功', health.web.last_sent_at),
      time('最近 Web 派送失敗', health.web.last_failed_at),
      time('最近 Native 派送成功', health.native.last_sent_at),
      time('最近 Native 派送失敗', health.native.last_failed_at),
      time('最近 Admin 派送成功', health.admin.last_sent_at),
      time('最近 Admin 派送失敗', health.admin.last_failed_at),
      { label: '驗證範圍', value: '健康檢查不發送測試通知；事件觸發、動態 Recovery、每小時保底、佇列與正式派送紀錄可驗證，服務商接受不等於裝置一定顯示。' },
    ];
  }
  const evidence = item.checkEvidence ?? (
    item.endpoint.startsWith('/functions/v1/') ? 'options'
      : item.checkMode === 'openapi' || item.checkMode === 'registry' ? 'registered'
        : item.location === 'Railway' && item.checkMode === 'service' ? 'inherited'
          : item.id === 'supabase-watchdog-heartbeat' || item.id.startsWith('cron-') ? 'reported' : 'live'
  );
  const access = item.rpcAccess ?? (apiStatusInventory.find(definition => definition.id === item.id)
    ?? apiStatusInventory.find(definition => definition.endpoint === item.endpoint))?.rpcAccess;
  const activity = isRecord(item.detail) && isRecord(item.detail.activity) ? item.detail.activity : null;
  const method = evidence === 'query' ? '實際查詢'
    : evidence === 'data' || evidence === 'no-sample' ? '正式資料'
      : evidence === 'live' ? '即時連線／讀取'
        : evidence === 'options' ? 'Endpoint 連線'
          : evidence === 'inherited' ? '所屬服務'
            : evidence === 'reported' ? '正式執行紀錄'
              : access === 'member-read' ? 'API 註冊＋會員流程未執行'
                : activity?.state === 'recorded' ? 'API 註冊＋正式執行紀錄'
                  : activity?.state === 'none' ? 'API 註冊＋正式紀錄查核'
                    : access === 'operation' ? 'API 註冊；寫入操作未執行'
                      : 'API 註冊';
  const facts: SystemStatusFact[] = [{ label: '驗證方式', value: method }];
  if (!isRecord(item.detail)) return facts;
  if (item.id === 'supabase-watchdog-heartbeat' && isRecord(item.detail.schedule)) {
    facts.push({ label: '最近排程檢查', value: item.detail.schedule.checkedAt, format: 'date' });
    if (item.detail.schedule.pendingSince) facts.push({ label: '等待監控開始時間', value: item.detail.schedule.pendingSince, format: 'date' });
  }
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
    const formatCount = (value: unknown) => typeof value === 'number' && Number.isInteger(value) ? value.toLocaleString('zh-TW') : undefined;
    const testRecords = formatCount(sample.records);
    const storedRecords = formatCount(sample.storedRecords);
    const parts = [
      typeof sample.period === 'string' ? `${sample.period} 期` : '',
      testRecords !== undefined ? `測試條件 ${testRecords}筆` : '',
      storedRecords !== undefined ? `實際儲存結果 ${storedRecords}筆` : '',
      suffix,
    ].filter(Boolean);
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
    { label: '工作流程狀態', value: formatSystemStatusValue(workflow.state) },
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

export type RefreshClient = {
  post(url: string): Promise<{ data: { refresh?: unknown } }>;
  get(url: string): Promise<{ data: { refresh?: unknown } }>;
};
const refreshLotteries: Record<string, ManualRefreshTask['lottery']> = {
  'cron-matrix-539-refresh-v2': '今彩539', 'cron-matrix-fantasy5-refresh-v2': '天天樂',
  'cron-matrix-marksix-refresh-v2': '六合彩', 'cron-matrix-649-refresh-v2': '大樂透',
};
export async function refreshCrawlerSystemStatus(
  api: RefreshClient, id: string,
  options: { requestId?: string; signal?: AbortSignal; current?: () => boolean; onProgress?: (task: ManualRefreshTask) => void } = {},
): Promise<CrawlerRefreshResult> {
  const path = `/api/system-status/${id}/refresh`;
  const checkCurrent = () => {
    if (options.signal?.aborted || options.current?.() === false) throw new DOMException('查詢已停止', 'AbortError');
  };
  const parse = (value: unknown, requestId?: string) => {
    const task = parseManualRefresh(value, refreshLotteries[id], requestId);
    if (!task) throw new Error('未取得有效更新狀態，請查詢工作狀態後再決定是否重試。');
    options.onProgress?.(task);
    return task;
  };
  checkCurrent();
  const initial = options.requestId
    ? await api.get(`${path}/${options.requestId}`) : await api.post(path);
  checkCurrent();
  let task = parse(initial.data.refresh, options.requestId);
  const deadline = Date.now() + 5 * 60_000;
  let reads = options.requestId ? 1 : 0;
  for (;;) {
    checkCurrent();
    if (task.status === 'complete') return { lottery: task.lottery, period: task.period!, drawDate: task.drawDate };
    if (task.status === 'failed') {
      const errors = { SOURCE_NOT_READY: '開獎來源尚未提供本期資料，這次更新未完成。', REFRESH_INTERRUPTED: '更新工作已逾期或中斷，請檢查實際資料後再重試。', REFRESH_FAILED: '開獎資料更新失敗，請檢查工作紀錄。' };
      throw new Error(errors[task.error!]);
    }
    if (Date.now() >= deadline) throw new Error('更新尚未確認完成；已停止自動查詢，可稍後再次查詢更新狀態。');
    // First read immediately; following reads are spaced and cancellable.
    if (reads++ > 0) {
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new DOMException('查詢已停止', 'AbortError')); };
        const timer = setTimeout(() => { options.signal?.removeEventListener('abort', abort); resolve(); }, 5_000);
        options.signal?.addEventListener('abort', abort, { once: true });
      });
    }
    checkCurrent();
    const response = await api.get(`${path}/${task.requestId}`);
    checkCurrent();
    task = parse(response.data.refresh, task.requestId);
  }
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
    { label: '天樞大小', value: size(storage?.tables.tianshu.size_bytes) },
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
