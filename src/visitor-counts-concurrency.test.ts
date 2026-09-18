// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('./lib/supabase', () => ({
  getSupabaseClient: () => ({ functions: { invoke } }),
}));

beforeEach(() => {
  localStorage.clear();
  invoke.mockReset().mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('keeps caller identity out of concurrent browser contexts', async () => {
  const lockRequest = vi.fn();
  vi.stubGlobal('navigator', { locks: { request: lockRequest } });

  vi.resetModules(); const contextA = await import('./visitor-counts');
  vi.resetModules(); const contextB = await import('./visitor-counts');
  await Promise.all([contextA.recordVisitor(), contextB.recordVisitor()]);

  expect(invoke).toHaveBeenCalledTimes(2);
  expect(invoke.mock.calls).toEqual([
    ['visitor-visit', { body: {} }],
    ['visitor-visit', { body: {} }],
  ]);
  expect(lockRequest).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
});
