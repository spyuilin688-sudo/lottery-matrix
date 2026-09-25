// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('./lib/supabase', () => ({ getSupabaseClient: () => ({ functions: { invoke } }) }));
import { recordVisitor, installVisitorTracking } from './visitor-counts';

beforeEach(() => { localStorage.clear(); invoke.mockReset().mockResolvedValue({ error: null }); vi.stubEnv('DEV', false); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it('records through the Edge Function without sending a caller-controlled identity', async () => {
  await recordVisitor(); await recordVisitor();
  expect(invoke).toHaveBeenCalledTimes(2);
  expect(invoke).toHaveBeenNthCalledWith(1, 'visitor-visit', { body: {} });
  expect(localStorage.length).toBe(0);
});
it('does not block the app when the request fails', async () => {
  invoke.mockRejectedValueOnce(Error('offline'));
  await expect(recordVisitor()).resolves.toBeUndefined();
  expect(invoke).toHaveBeenCalledTimes(1);
});
it('records reopening the visible app and removes its listener on cleanup', async () => {
  const stop = installVisitorTracking();
  await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
  await recordVisitor();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  await new Promise((resolve) => setTimeout(resolve, 1_550));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
  await recordVisitor();
  stop(); document.dispatchEvent(new Event('visibilitychange'));
  expect(invoke).toHaveBeenCalledTimes(2);
});

it('shares one request for repeated visible events and ignores a short hidden bounce', async () => {
  vi.useFakeTimers();
  let resolveVisit!: (result: { error: null }) => void;
  invoke.mockImplementationOnce(() => new Promise(resolve => { resolveVisit = resolve; }));
  let visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility as DocumentVisibilityState);
  const stop = installVisitorTracking();
  document.dispatchEvent(new Event('visibilitychange'));
  expect(invoke).toHaveBeenCalledTimes(1);
  resolveVisit({ error: null });
  await Promise.resolve(); await Promise.resolve();
  document.dispatchEvent(new Event('visibilitychange'));
  expect(invoke).toHaveBeenCalledTimes(1);
  visibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
  visibility = 'visible'; document.dispatchEvent(new Event('visibilitychange'));
  expect(invoke).toHaveBeenCalledTimes(1);
  visibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(2_000);
  visibility = 'visible'; document.dispatchEvent(new Event('visibilitychange'));
  expect(invoke).toHaveBeenCalledTimes(2);
  stop();
});

it('records return from a pagehide lifecycle with no visibilitychange', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const stop = installVisitorTracking();
  await recordVisitor();
  window.dispatchEvent(new Event('pagehide'));
  window.dispatchEvent(new Event('pageshow'));
  expect(invoke).toHaveBeenCalledTimes(2);
  stop();
  window.dispatchEvent(new Event('pageshow'));
  expect(invoke).toHaveBeenCalledTimes(2);
});

it('records a BFCache return even when background timers were frozen', async () => {
  let visibility: DocumentVisibilityState = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  const stop = installVisitorTracking();
  await recordVisitor();
  visibility = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('pagehide'));
  visibility = 'visible';
  window.dispatchEvent(new Event('pageshow'));
  expect(invoke).toHaveBeenCalledTimes(2);
  stop();
});

it('does not count development or browser test sessions', async () => {
  vi.stubEnv('DEV', true);
  const stop = installVisitorTracking();
  document.dispatchEvent(new Event('visibilitychange'));
  await Promise.resolve();
  expect(invoke).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
  stop();
});
