// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(async (url: string) => {
  if (url === '/api/bootstrap') return { data: { admin: { id: 'admin', name: '管理員', role: '超級管理員', permissions: { view: true, edit: true } } } };
  if (url === '/api/dashboard') return { data: {
    todayVisitors: 0, monthVisitors: 0, totalVisitors: 0, totalUsers: 0,
    monthlyPro: 0, quarterlyPro: 0, yearlyPro: 0, expiring: 0,
    todayRevenue: 0, monthRevenue: 0, quarterRevenue: 0, yearRevenue: 0, cumulativeRevenue: 0,
    userGrowth: [], revenueGrowth: [],
  } };
  if (url === '/api/system-status') return { data: { checkedAt: '2026-09-07T00:00:00Z', items: [
    { id: 'rpc', name: '兌換啟動碼', group: '啟動碼', location: 'Supabase', description: '兌換會員啟動碼。', endpoint: '/rest/v1/rpc/redeem_activation_code', checkMode: 'openapi', checkEvidence: 'registered', ok: true, checkedAt: '2026-09-07T00:00:00Z', responseMs: 12 },
    { id: 'function', name: 'Pilio 開獎通知', group: '通知', location: 'Supabase', description: '讀取開獎結果並建立通知。', endpoint: '/functions/v1/notification-pilio', checkMode: 'live', checkEvidence: 'options', ok: false, checkedAt: '2026-09-07T00:00:00Z', responseMs: 18, error: '此 API 回應異常（HTTP 502）。', detail: { status: 502 } },
  ] } };
  return { data: { items: [] } };
}), post: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock('@appdeploy/client', () => ({ api: mocks, auth: { signIn: vi.fn(), signOut: vi.fn() } }));
import AdminApp from './AdminApp';
import { matrixStorageFixture } from '../backend/matrix-storage-status.fixture';
beforeEach(() => vi.clearAllMocks());

it('renders a failed TinyFish check and its evidence without issuing write requests', async () => {
  const originalGet = mocks.get.getMockImplementation()!;
  mocks.get.mockImplementation(async url => url === '/api/system-status' ? { data: {
    checkedAt: '2026-09-19T13:00:00Z', items: [{
      id: 'tinyfish-fallback', name: 'TinyFish 備援抓取', group: '資料來源', location: 'TinyFish',
      description: '顯示最近備援結果。', endpoint: '/jobs/status#tinyfish', checkMode: 'service',
      checkEvidence: 'reported', ok: false, checkedAt: '2026-09-19T13:00:00Z', responseMs: 0,
      error: '最近備援抓取失敗。', detail: { status: 'failed' },
    }],
  } } : originalGet(url));
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AdminApp />));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent?.includes('系統設定'))?.click());
    const row = container.querySelector('[data-status-id="tinyfish-fallback"]');
    expect(row).not.toBeNull();
    expect(row?.querySelector('.statusBadge.bad')?.textContent).toBe('需處理');
    expect(row?.querySelector('[role="alert"]')?.textContent).toBe('最近備援抓取失敗。');
    expect(container.querySelector('.statusGroupHeader')?.textContent).toContain('TinyFish正常 0 · 等待 0 · 無需處理 0 · 需處理 1');
    expect(container.querySelector('.systemStatusOverview')?.textContent).toContain('有 1 項需要處理');
    expect(container.querySelector('.systemStatusAttention')?.textContent).toContain('TinyFish 備援抓取');
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); container.remove(); mocks.get.mockImplementation(originalGet); }
});

it('renders event-driven notification health without sending a notification from the health row', async () => {
  const originalGet = mocks.get.getMockImplementation()!;
  const checkedAt = '2026-09-13T12:00:00Z';
  mocks.get.mockImplementation(async url => url === '/api/system-status' ? { data: { checkedAt, items: [{
    id: 'native-notification-dispatch', name: '通知派送架構', group: '通知', location: 'Supabase',
    description: '驗證事件觸發、Recovery 與通知佇列。', endpoint: '/rest/v1/rpc/admin_notification_delivery_health',
    checkMode: 'service', checkEvidence: 'reported', healthState: 'healthy', ok: true, checkedAt, responseMs: 1,
    detail: {
      checked_at: checkedAt, mode: 'event-driven', event_trigger_enabled: true, admin_transfer_trigger_enabled: true,
      recovery: { enabled: true, strategy: 'dynamic-with-hourly-fallback', schedule: '7 * * * *', queue_trigger_enabled: true, dynamic_enabled: false, next_due_at: null, last_started_at: '2026-09-13T11:07:00Z', last_finished_at: '2026-09-13T11:07:01Z', last_status: 'succeeded' },
      web: { pending: 0, processing: 0, overdue: 0, sent_24h: 2, failed_24h: 0, skipped_24h: 0, last_sent_at: '2026-09-13T11:40:00Z', last_failed_at: null },
      native: { enabled_devices: 0, pending: 0, processing: 0, overdue: 0, sent_24h: 0, failed_24h: 0, canceled_24h: 0, last_sent_at: '2026-09-09T21:30:00Z', last_failed_at: '2026-09-10T00:30:00Z' },
      admin: { enabled_subscriptions: 0, pending: 0, sending: 0, overdue: 0, sent_24h: 0, failed_24h: 0, skipped_24h: 0, last_sent_at: null, last_failed_at: null },
    },
  }] } } : originalGet(url));
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AdminApp />));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent?.includes('系統設定'))?.click());
    const row = container.querySelector('[data-status-id="native-notification-dispatch"]')!;
    expect(row.querySelector('.statusBadge.good')?.textContent).toBe('正常');
    expect(row.querySelector('.statusScope')?.textContent).toContain('目前運作正常');
    expect(container.querySelector('.statusGroupHeader')?.textContent).toContain('正常 1 · 等待 0 · 無需處理 0 · 需處理 0');
    expect(container.querySelector('.systemStatusOverview')?.textContent).toContain('目前沒有需要處理的異常');
    expect(container.querySelector('.systemStatusAttention')?.textContent).toContain('目前沒有需要處理的項目');
    await act(async () => row.querySelector('summary')?.click());
    expect(row.querySelector('details')?.textContent).toContain('派送模式事件觸發');
    expect(row.querySelector('details')?.textContent).toContain('Recovery 模式依待處理時間動態排程');
    expect(row.querySelector('details')?.textContent).toContain('Recovery 保底每小時');
    expect(row.querySelector('details')?.textContent).toContain('動態 Recovery目前無排程');
    expect(row.querySelector('details')?.textContent).toContain('下次 Recovery目前無待處理工作');
    expect(row.querySelector('details')?.textContent).toContain('Web 待處理0');
    expect(row.querySelector('details')?.textContent).toContain('Native 待處理0');
    expect(row.querySelector('details')?.textContent).toContain('Admin 待處理0');
    expect(row.querySelector('details')?.textContent).toContain('不發送測試通知');
    expect(row.querySelector('.statusRowActions')).toBeNull();
    expect(mocks.post).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); container.remove(); mocks.get.mockImplementation(originalGet); }
});

it('renders query samples and related operation dates with limited evidence visibly distinct from success', async () => {
  const originalGet = mocks.get.getMockImplementation()!;
  const base = { group: 'Matrix 演算法', location: 'Supabase', description: '取得正式分析資料。', endpoint: '/rest/v1/rpc/example', checkMode: 'registry', ok: true, checkedAt: '2026-09-13T10:05:00Z', responseMs: 10 };
  mocks.get.mockImplementation(async (url: string) => url === '/api/system-status' ? { data: { checkedAt: base.checkedAt, items: [
    { ...base, id: 'supabase-rpc-matrix_tianheng_list', name: 'Matrix 天衡清單', checkEvidence: 'query', detail: { samples: [{ lottery: '今彩539', period: '123', records: 2, ok: true }] } },
    { ...base, id: 'supabase-rpc-matrix_tianyan_list', name: 'Matrix 天衍清單', checkEvidence: 'data', detail: { probe: 'data' } },
    { ...base, id: 'supabase-rpc-notification_dispatch_mark_skipped', name: '標記通知派送略過', checkEvidence: 'registered', detail: { activity: { state: 'recorded', source: '通知派送略過', observedAt: '2026-09-13T10:00:00Z' } } },
  ] } } : originalGet(url));
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AdminApp />));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent?.includes('系統設定'))?.click());
    const rows = container.querySelectorAll('.statusRow');
    expect(rows).toHaveLength(3);
    expect(rows[0].querySelector('.statusBadge.good')?.textContent).toBe('正常');
    expect(rows[1].querySelector('.statusBadge.neutral')?.textContent).toBe('無需處理');
    expect(rows[1].querySelector('.statusScope')?.textContent).toContain('無需處理');
    expect(rows[2].querySelector('.statusBadge.good')?.textContent).toBe('正常');
    await act(async () => rows[0].querySelector('summary')?.click());
    expect(rows[0].querySelector('details')?.textContent).toContain('123 期 · 測試條件 2筆 · 通過');
    await act(async () => rows[2].querySelector('summary')?.click());
    expect(rows[2].querySelector('details')?.textContent).toContain('最近相關紀錄2026/09/13');
    expect(rows[2].querySelector('details')?.textContent).toContain('通知派送略過');
  } finally { await act(async () => root.unmount()); container.remove(); mocks.get.mockImplementation(originalGet); }
});

it('keeps purpose, evidence and errors visible while technical details collapse without calling write APIs', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AdminApp />));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    const navigation = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('系統設定'));
    expect(navigation, container.textContent ?? '').toBeDefined();
    await act(async () => navigation?.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    const rows = container.querySelectorAll('.statusRow');
    expect(rows).toHaveLength(2);
    expect(container.querySelector('.systemStatusLegend')?.textContent).toContain('主狀態只表示是否需要處理');
    expect(container.querySelector('.systemStatusOverview')?.textContent).toContain('有 1 項需要處理');
    expect(container.querySelector('.systemStatusAttention')?.textContent).toContain('Pilio 開獎通知');
    expect(rows[0].querySelector('.statusBadge')?.textContent).toBe('無需處理');
    expect(rows[0].querySelector('.statusDescription')?.closest('details')).toBeNull();
    expect(rows[0].querySelector('.statusScope')?.textContent).toContain('目前無需處理');
    expect(rows[1].querySelector('[role=alert]')?.closest('details')).toBeNull();
    expect(rows[1].querySelector('[role=alert]')?.textContent).toContain('HTTP 502');
    const details = rows[0].querySelector('details')!;
    expect(details.open).toBe(false);
    await act(async () => details.querySelector('summary')?.click());
    expect(details.open).toBe(true);
    expect(details.querySelector('summary')?.textContent).toBe('查看技術明細');
    expect(details.textContent).toContain('技術驗證API 已確認');
    expect(details.textContent).toContain('/rest/v1/rpc/redeem_activation_code');
    await act(async () => details.querySelector('summary')?.click());
    expect(details.open).toBe(false);
    await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === '重新檢查')?.click());
    expect(mocks.get.mock.calls.filter(([url]) => url === '/api/system-status')).toHaveLength(2);
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); container.remove(); }
});

it('counts only actual failures as abnormal while running, waiting and unknown jobs remain limited', async () => {
  const originalGet = mocks.get.getMockImplementation()!;
  mocks.get.mockImplementation(async (url: string) => url === '/api/system-status' ? { data: { checkedAt: '2026-09-12T02:00:00Z', items: [
    ['running', true, 'running'], ['waiting', true, 'waiting_source'], ['unknown', false, 'unknown'], ['failed', false, 'failed'],
  ].map(([healthState, ok, status]) => ({
    id: `cron-${healthState}`, name: `${healthState}排程`, group: '排程', location: 'Supabase', description: '開獎資料更新排程。', endpoint: '/rest/v1/system_job_status', checkMode: 'live', checkEvidence: 'reported', healthState, ok, checkedAt: '2026-09-12T02:00:00Z', responseMs: 0, detail: { status }, ...(healthState === 'failed' ? { error: '排程執行失敗。' } : {}),
  })) } } : originalGet(url));
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AdminApp />));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent?.includes('系統設定'))?.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect([...container.querySelectorAll('.statusBadge')].map(badge => [badge.textContent, badge.classList.contains('bad')])).toEqual([
      ['等待', false], ['等待', false], ['需處理', true], ['需處理', true],
    ]);
    expect(container.querySelector('.statusGroupHeader')?.textContent).toContain('正常 0 · 等待 2 · 無需處理 0 · 需處理 2');
    expect(container.querySelectorAll('.statusRow [role=alert]')).toHaveLength(1);
  } finally {
    await act(async () => root.unmount()); container.remove();
    mocks.get.mockImplementation(originalGet);
  }
});

it('keeps storage size visible, separates Warning counts, and preserves details during failed refresh', async () => {
  const originalGet = mocks.get.getMockImplementation()!;
  let fail = false;
  let malformed = false;
  mocks.get.mockImplementation(async url => {
    if (url !== '/api/system-status') return originalGet(url);
    if (fail) throw new Error('狀態重新檢查失敗');
    return { data: { checkedAt: '2026-09-12T02:00:00Z', items: [{
      id: 'matrix-storage', name: 'Matrix Storage', description: '分析資料儲存與清理狀態。', group: '系統', location: 'Supabase', endpoint: '/rest/v1/rpc/matrix_analysis_storage_health', checkMode: 'service', checkEvidence: 'reported', ok: false, checkedAt: '2026-09-12T02:00:00Z', responseMs: 12,
      detail: malformed ? { status: 'Healthy' } : { ...matrixStorageFixture(), status: 'Warning' },
    }] } };
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AdminApp />));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent?.includes('系統設定'))?.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    const row = container.querySelector('[data-status-id="matrix-storage"]')!;
    expect(row.querySelector('.statusBadge')?.textContent).toBe('需處理');
    expect(row.querySelector('.statusBadge')?.classList.contains('good')).toBe(false);
    expect(row.querySelector('.statusRowMain > .statusFacts')?.textContent).toContain('資料庫大小2.50 GB');
    expect(container.querySelector('.statusGroupHeader')?.textContent).toContain('正常 0 · 等待 0 · 無需處理 0 · 需處理 1');
    expect(row.textContent).not.toContain('%');
    expect(row.querySelector('.statusRowActions')).toBeNull();
    const details = row.querySelector('details')!;
    expect(details.open).toBe(false);
    await act(async () => details.querySelector('summary')?.click());
    expect(details.open).toBe(true);
    expect(details.textContent).toContain('120.00 MB');
    expect(details.textContent).toContain('1,234');
    expect(details.textContent).toContain('2026/09/12 09:00');
    fail = true;
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === '重新檢查')?.click());
    expect(container.querySelector('[role=alert]')?.textContent).toContain('狀態重新檢查失敗');
    expect(details.open).toBe(true);
    expect(row.textContent).toContain('2.50 GB');
    expect(row.querySelector('.statusBadge')?.textContent).toBe('需處理');
    fail = false; malformed = true;
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === '重新檢查')?.click());
    expect(row.querySelector('.statusBadge')?.textContent).toBe('需處理');
    expect(row.textContent).not.toContain('Healthy');
    expect(row.querySelector('.statusRowMain > .statusFacts')?.textContent).toContain('資料庫大小無法取得');
  } finally { await act(async () => root.unmount()); container.remove(); mocks.get.mockImplementation(originalGet); }
});
