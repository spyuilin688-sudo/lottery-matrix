// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('./lib/supabase', () => ({ getSupabaseClient: () => ({ rpc }) }));
const response = { data: {
  subscriptionPurchaseVisible: false, registeredMemberFreeAccess: true,
  revision: 1, updatedAt: '2026-09-20T00:00:00Z',
}, error: null };
let dispose: (() => void) | undefined;
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  rpc.mockReset().mockResolvedValue(response);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
});
afterEach(() => { dispose?.(); dispose = undefined; vi.useRealTimers(); vi.restoreAllMocks(); });

test('focus and visibility bursts share the current 30-second refresh window', async () => {
  const { installPermissionSettingsRefresh } = await import('./permission-settings');
  dispose = installPermissionSettingsRefresh();
  await vi.advanceTimersByTimeAsync(0);
  window.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(29_999);
  expect(rpc).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(rpc).toHaveBeenCalledTimes(2);
});

test('slow requests do not overlap automatic refreshes and refresh resumes after settlement', async () => {
  let resolve!: (value: typeof response) => void;
  rpc.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const { installPermissionSettingsRefresh } = await import('./permission-settings');
  dispose = installPermissionSettingsRefresh();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(rpc).toHaveBeenCalledTimes(1);
  resolve(response);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(rpc).toHaveBeenCalledTimes(2);
});

test('explicit permission checks remain fresh while background events reuse their refresh window', async () => {
  const { installPermissionSettingsRefresh, refreshPermissionSettings } = await import('./permission-settings');
  dispose = installPermissionSettingsRefresh();
  await vi.advanceTimersByTimeAsync(0);
  await refreshPermissionSettings();
  window.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(0);
  expect(rpc).toHaveBeenCalledTimes(2);
});

test('a recent explicit check moves the next background read to its 30-second deadline', async () => {
  const { installPermissionSettingsRefresh, refreshPermissionSettings } = await import('./permission-settings');
  dispose = installPermissionSettingsRefresh();
  await vi.advanceTimersByTimeAsync(29_000);
  await refreshPermissionSettings();
  await vi.advanceTimersByTimeAsync(29_999);
  expect(rpc).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(rpc).toHaveBeenCalledTimes(3);
});

test('hidden tabs skip polling and returning after the window refreshes once', async () => {
  const { installPermissionSettingsRefresh } = await import('./permission-settings');
  dispose = installPermissionSettingsRefresh();
  await vi.advanceTimersByTimeAsync(0);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(rpc).toHaveBeenCalledTimes(1);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(0);
  expect(rpc).toHaveBeenCalledTimes(2);
});


test('foreground permission read joins an automatic refresh already in flight', async () => {
  let resolve!: (value: typeof response) => void;
  rpc.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const { installPermissionSettingsRefresh, readPermissionSettings } = await import('./permission-settings');
  dispose = installPermissionSettingsRefresh();
  expect(rpc).toHaveBeenCalledTimes(1);

  const foreground = readPermissionSettings();
  expect(rpc).toHaveBeenCalledTimes(1);
  resolve(response);
  await expect(foreground).resolves.toEqual(response.data);
  expect(rpc).toHaveBeenCalledTimes(1);

  await readPermissionSettings();
  expect(rpc).toHaveBeenCalledTimes(2);
});

test('result-cache permission reads coalesce only concurrent RPCs', async () => {
  const { readPermissionSettings } = await import('./permission-settings');
  await Promise.all([readPermissionSettings(), readPermissionSettings(), readPermissionSettings()]);
  expect(rpc).toHaveBeenCalledTimes(1);
  await readPermissionSettings();
  expect(rpc).toHaveBeenCalledTimes(2);
});
