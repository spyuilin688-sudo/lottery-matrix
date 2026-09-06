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
