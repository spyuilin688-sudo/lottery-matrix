// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(async (url: string) => {
  if (url === '/api/bootstrap') return { data: { admin: { id: 'admin', name: '管理員', role: '超級管理員', permissions: { view: true, edit: true } } } };
  if (url === '/api/dashboard') return { data: {} };
  if (url === '/api/system-status') return { data: { checkedAt: '2026-09-07T00:00:00Z', items: [
    { id: 'rpc', name: '兌換啟動碼', group: '啟動碼', location: 'Supabase', description: '兌換會員啟動碼。', endpoint: '/rest/v1/rpc/redeem_activation_code', checkMode: 'openapi', checkEvidence: 'registered', ok: true, checkedAt: '2026-09-07T00:00:00Z', responseMs: 12 },
    { id: 'function', name: 'Pilio 開獎通知', group: '通知', location: 'Supabase', description: '讀取開獎結果並建立通知。', endpoint: '/functions/v1/notification-pilio', checkMode: 'live', checkEvidence: 'options', ok: false, checkedAt: '2026-09-07T00:00:00Z', responseMs: 18, error: '此 API 回應異常（HTTP 502）。', detail: { status: 502 } },
  ] } };
  return { data: { items: [] } };
}), post: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock('@appdeploy/client', () => ({ api: mocks, auth: { signIn: vi.fn(), signOut: vi.fn() } }));
import AdminApp from './AdminApp';
import { matrixStorageFixture } from '../backend/matrix-storage-status.fixture';

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
    expect(rows[0].querySelector('.statusBadge')?.textContent).toBe('API 已建立');
    expect(rows[0].querySelector('.statusDescription')?.closest('details')).toBeNull();
    expect(rows[0].querySelector('.statusScope')?.textContent).toContain('此操作會修改資料或工作狀態，自動檢查不會執行正式操作');
    expect(rows[1].querySelector('[role=alert]')?.closest('details')).toBeNull();
    expect(rows[1].querySelector('[role=alert]')?.textContent).toContain('HTTP 502');
    const details = rows[0].querySelector('details')!;
    expect(details.open).toBe(false);
    await act(async () => details.querySelector('summary')?.click());
    expect(details.open).toBe(true);
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
      ['執行中', false], ['等待開獎來源更新', false], ['狀態待確認', false], ['異常', true],
    ]);
    expect(container.querySelector('.statusGroupHeader')?.textContent).toContain('4 項 · 3 項僅部分檢查 · 1 項異常');
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
    expect(row.querySelector('.statusBadge')?.textContent).toBe('Warning');
    expect(row.querySelector('.statusBadge')?.classList.contains('good')).toBe(false);
    expect(row.querySelector('.statusRowMain > .statusFacts')?.textContent).toContain('資料庫大小2.50 GB');
    expect(container.querySelector('.statusGroupHeader')?.textContent).toContain('1 項警告');
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
    expect(row.querySelector('.statusBadge')?.textContent).toBe('Warning');
    fail = false; malformed = true;
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === '重新檢查')?.click());
    expect(row.querySelector('.statusBadge')?.textContent).toBe('狀態待確認');
    expect(row.textContent).not.toContain('Healthy');
    expect(row.querySelector('.statusRowMain > .statusFacts')?.textContent).toContain('資料庫大小無法取得');
  } finally { await act(async () => root.unmount()); container.remove(); mocks.get.mockImplementation(originalGet); }
});
