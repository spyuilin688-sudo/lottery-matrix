// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionSwitches } from './PermissionSwitches';

const current = {
  subscriptionPurchaseVisible: false,
  registeredMemberFreeAccess: true,
  revision: 7,
  updatedAt: '2026-09-10T22:00:00.000Z',
};

async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

describe('permission switch workspace', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  const switches = () => ({
    purchase: container.querySelector<HTMLInputElement>('[role="switch"][aria-label="顯示訂閱購買"]'),
    free: container.querySelector<HTMLInputElement>('[role="switch"][aria-label="註冊會員免費使用"]'),
  });

  it('loads both independent settings and keeps them read-only for non-super administrators', async () => {
    const client = { get: vi.fn(async () => ({ data: current })), put: vi.fn() };
    await act(async () => root.render(<PermissionSwitches client={client} canEdit={false} confirm={vi.fn()} />));
    await settle();

    expect(client.get).toHaveBeenCalledWith('/api/permission-settings');
    expect(switches().purchase?.checked).toBe(false);
    expect(switches().free?.checked).toBe(true);
    expect(switches().purchase?.disabled).toBe(true);
    expect(switches().free?.disabled).toBe(true);
    expect(container.textContent).toContain('僅超級管理員可修改');
  });

  it('shows the current PWA state and refreshes it automatically every hour', async () => {
    let hourlyRefresh: (() => void) | undefined;
    vi.spyOn(window, 'setInterval').mockImplementation(((handler: TimerHandler, timeout?: number) => {
      expect(timeout).toBe(60 * 60 * 1000);
      hourlyRefresh = handler as () => void;
      return 1;
    }) as typeof window.setInterval);
    const client = { get: vi.fn(async () => ({ data: current })), put: vi.fn() };

    await act(async () => root.render(<PermissionSwitches client={client} canEdit confirm={vi.fn()} />));
    await settle();

    expect(container.textContent).toContain('目前 PWA 狀態');
    expect(container.textContent).toContain('訂閱購買：關閉');
    expect(container.textContent).toContain('會員免費使用：開啟');
    expect(container.textContent).toContain('每小時自動檢查');
    await act(async () => { hourlyRefresh?.(); await Promise.resolve(); });
    expect(client.get).toHaveBeenCalledTimes(2);
  });

  it('does not let an older hourly read overwrite a successful switch update', async () => {
    let hourlyRefresh: (() => void) | undefined;
    let releaseStaleRead!: (value: { data: typeof current }) => void;
    vi.spyOn(window, 'setInterval').mockImplementation(((handler: TimerHandler) => {
      hourlyRefresh = handler as () => void;
      return 1;
    }) as typeof window.setInterval);
    const updated = { ...current, subscriptionPurchaseVisible: true, revision: 8 };
    const get = vi.fn()
      .mockResolvedValueOnce({ data: current })
      .mockImplementationOnce(() => new Promise((resolve) => { releaseStaleRead = resolve; }));
    const client = { get, put: vi.fn(async () => ({ data: updated })) };
    await act(async () => root.render(<PermissionSwitches client={client} canEdit confirm={vi.fn(async () => true)} />));
    await settle();

    act(() => { hourlyRefresh?.(); });
    await act(async () => switches().purchase?.click());
    expect(switches().purchase?.checked).toBe(true);
    await act(async () => releaseStaleRead({ data: current }));

    expect(switches().purchase?.checked).toBe(true);
    expect(container.textContent).toContain('訂閱購買：開啟');
  });

  it('shows an honest load failure and retries without displaying guessed switch values', async () => {
    const get = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ data: current });
    const client = { get, put: vi.fn() };
    await act(async () => root.render(<PermissionSwitches client={client} canEdit confirm={vi.fn()} />));
    await settle();

    expect(switches().purchase).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('權限設定載入失敗');
    const retry = [...container.querySelectorAll('button')].find((button) => button.textContent === '重新載入');
    await act(async () => retry?.click());
    await settle();

    expect(get).toHaveBeenCalledTimes(2);
    expect(switches().purchase).not.toBeNull();
  });

  it('cancels a super-administrator change before sending any write', async () => {
    const client = { get: vi.fn(async () => ({ data: current })), put: vi.fn() };
    const confirm = vi.fn(async () => false);
    await act(async () => root.render(<PermissionSwitches client={client} canEdit confirm={confirm} />));
    await settle();

    await act(async () => switches().purchase?.click());
    await settle();

    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: '確認開啟顯示訂閱購買',
      confirmLabel: '確認開啟',
    }));
    expect(client.put).not.toHaveBeenCalled();
    expect(switches().purchase?.checked).toBe(false);
  });

  it('waits for the server, disables both controls, and accepts only the returned revision', async () => {
    let resolveWrite!: (value: { data: unknown }) => void;
    const put = vi.fn((): Promise<{ data: unknown }> => new Promise((resolve) => { resolveWrite = resolve; }));
    const client = { get: vi.fn(async () => ({ data: current })), put };
    await act(async () => root.render(<PermissionSwitches client={client} canEdit confirm={vi.fn(async () => true)} />));
    await settle();

    await act(async () => switches().purchase?.click());
    expect(put).toHaveBeenCalledWith('/api/permission-settings/subscriptionPurchaseVisible', {
      value: true,
      expectedRevision: 7,
    });
    expect(switches().purchase?.checked).toBe(false);
    expect(switches().purchase?.disabled).toBe(true);
    expect(switches().free?.disabled).toBe(true);

    await act(async () => resolveWrite({ data: { ...current, subscriptionPurchaseVisible: true, revision: 8 } }));
    await settle();
    expect(switches().purchase?.checked).toBe(true);
    expect(container.querySelector('[role="status"]')?.textContent).toContain('顯示訂閱購買已開啟');
  });

  it('reloads authoritative state after a failed or conflicting update', async () => {
    const latest = { ...current, subscriptionPurchaseVisible: true, revision: 8 };
    const get = vi.fn()
      .mockResolvedValueOnce({ data: current })
      .mockResolvedValueOnce({ data: latest });
    const put = vi.fn(async () => { throw new Error('SETTINGS_CONFLICT'); });
    const client = { get, put };
    await act(async () => root.render(<PermissionSwitches client={client} canEdit confirm={vi.fn(async () => true)} />));
    await settle();

    await act(async () => switches().purchase?.click());
    await settle();

    expect(get).toHaveBeenCalledTimes(2);
    expect(switches().purchase?.checked).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('設定已由其他管理員更新');
  });
});
