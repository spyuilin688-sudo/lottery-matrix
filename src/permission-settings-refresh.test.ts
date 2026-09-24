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

test('foreground events share a 30-second burst window and do not restore 30-second polling', async () => {
  const { installPermissionSettingsRefresh } = await import('./permission-settings');
  dispose = installPermissionSettingsRefresh();
  await vi.advanceTimersByTimeAsync(0);
  window.dispatchEvent(new Event('focus'));
  window.dispatchEvent(new Event('online'));
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(29_999);
  expect(rpc).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(1);
  expect(rpc).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(0);
  expect(rpc).toHaveBeenCalledTimes(2);
});

test('visible idle fallback refreshes every 12 hours instead of every five minutes', async () => {
  const { installPermissionSettingsRefresh } = await import('./permission-settings');
  dispose = installPermissionSettingsRefresh();
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(12 * 60 * 60_000 - 1);
  expect(rpc).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(rpc).toHaveBeenCalledTimes(2);
});

test('slow requests never overlap and an elapsed fallback resumes after settlement', async () => {
  let resolve!: (value: typeof response) => void;
  rpc.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const { installPermissionSettingsRefresh } = await import('./permission-settings');
  dispose = installPermissionSettingsRefresh();
  await vi.advanceTimersByTimeAsync(12 * 60 * 60_000);
  expect(rpc).toHaveBeenCalledTimes(1);
  resolve(response);
  await vi.advanceTimersByTimeAsync(0);
  expect(rpc).toHaveBeenCalledTimes(2);
});

test('explicit permission checks remain fresh while foreground events reuse their burst window', async () => {
  const { installPermissionSettingsRefresh, refreshPermissionSettings } = await import('./permission-settings');
  dispose = installPermissionSettingsRefresh();
  await vi.advanceTimersByTimeAsync(0);
  await refreshPermissionSettings();
  window.dispatchEvent(new Event('focus'));
  window.dispatchEvent(new Event('online'));
  await vi.advanceTimersByTimeAsync(0);
  expect(rpc).toHaveBeenCalledTimes(2);
});

test('a recent explicit check moves the next idle fallback to its 12-hour deadline', async () => {
  const { installPermissionSettingsRefresh, refreshPermissionSettings } = await import('./permission-settings');
  dispose = installPermissionSettingsRefresh();
  await vi.advanceTimersByTimeAsync(4 * 60 * 60_000);
  await refreshPermissionSettings();
  await vi.advanceTimersByTimeAsync(12 * 60 * 60_000 - 1);
  expect(rpc).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(rpc).toHaveBeenCalledTimes(3);
});

test('hidden tabs skip fallback polling and returning to foreground refreshes once', async () => {
  const { installPermissionSettingsRefresh } = await import('./permission-settings');
  dispose = installPermissionSettingsRefresh();
  await vi.advanceTimersByTimeAsync(0);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  await vi.advanceTimersByTimeAsync(12 * 60 * 60_000);
  expect(rpc).toHaveBeenCalledTimes(1);

  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(0);
  expect(rpc).toHaveBeenCalledTimes(2);
});

test('settling an in-flight automatic read after disposal cannot re-arm timers or event refreshes', async () => {
  let resolve!: (value: typeof response) => void;
  rpc.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const { installPermissionSettingsRefresh } = await import('./permission-settings');
  dispose = installPermissionSettingsRefresh();
  await vi.advanceTimersByTimeAsync(0);
  expect(rpc).toHaveBeenCalledTimes(1);

  dispose();
  dispose = undefined;
  resolve(response);
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  window.dispatchEvent(new Event('focus'));
  window.dispatchEvent(new Event('online'));
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0);

  expect(rpc).toHaveBeenCalledTimes(1);
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
