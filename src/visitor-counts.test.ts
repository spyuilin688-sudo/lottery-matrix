// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('./lib/supabase', () => ({ getSupabaseClient: () => ({ rpc }) }));
import { recordVisitor, installVisitorTracking } from './visitor-counts';

beforeEach(() => { localStorage.clear(); rpc.mockReset().mockResolvedValue({ error: null }); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-05T10:00:00Z')); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('stores only a random anonymous hash and reuses it for repeated visits', async () => {
  await recordVisitor(); await recordVisitor();
  const hash = rpc.mock.calls[0][1].p_visitor_hash;
  expect(hash).toMatch(/^[a-f0-9]{64}$/);
  expect(rpc.mock.calls[1][1].p_visitor_hash).toBe(hash);
  expect(rpc.mock.calls[0][0]).toBe('record_matrix_visit');
});
it('replaces the identifier at 90 days', async () => {
  await recordVisitor(); const first = rpc.mock.calls[0][1].p_visitor_hash;
  vi.advanceTimersByTime(90 * 86400000);
  await recordVisitor();
  expect(rpc.mock.calls[1][1].p_visitor_hash).not.toBe(first);
});
it('does not block the app when storage or the request fails', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('blocked'); });
  await expect(recordVisitor()).resolves.toBeUndefined();
  expect(rpc).not.toHaveBeenCalled();
});
it('retries with the same identifier after a network failure', async () => {
  rpc.mockRejectedValueOnce(Error('offline'));
  await recordVisitor(); await recordVisitor();
  expect(rpc.mock.calls[1][1]).toEqual(rpc.mock.calls[0][1]);
});
it('records reopening the visible app and removes its listener on cleanup', async () => {
  const stop = installVisitorTracking();
  await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
  stop(); document.dispatchEvent(new Event('visibilitychange'));
  expect(rpc).toHaveBeenCalledTimes(2);
});
