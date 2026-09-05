// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('./lib/supabase', () => ({ getSupabaseClient: () => ({ rpc }) }));
beforeEach(() => { localStorage.clear(); rpc.mockReset().mockResolvedValue({ error: null }); });
afterEach(() => { vi.unstubAllGlobals(); });

it.each([
  { locking: true, expired: false }, { locking: true, expired: true },
  { locking: false, expired: false }, { locking: false, expired: true },
])('shares one hash across contexts: locks=$locking expired=$expired', async ({ locking, expired }) => {
  if (expired) localStorage.setItem('matrix.visitor.v1', JSON.stringify({ hash: 'a'.repeat(64), createdAt: Date.now() - 90 * 86400000 }));
  let tail: Promise<unknown> = Promise.resolve();
  const request = vi.fn((_name: string, callback: () => Promise<unknown>) => {
    const next = tail.then(callback); tail = next.catch(() => undefined); return next;
  });
  vi.stubGlobal('navigator', locking ? { locks: { request } } : {});
  vi.resetModules(); const contextA = await import('./visitor-counts');
  vi.resetModules(); const contextB = await import('./visitor-counts');
  await Promise.all([contextA.recordVisitor(), contextB.recordVisitor()]);
  expect(rpc).toHaveBeenCalledTimes(2);
  const hashes = rpc.mock.calls.map(([, args]) => args.p_visitor_hash);
  expect(new Set(hashes).size).toBe(1);
  expect(hashes[0]).toMatch(/^[a-f0-9]{64}$/);
  expect(hashes[0]).not.toBe('a'.repeat(64));
  expect(JSON.parse(localStorage.getItem('matrix.visitor.v1')!).hash).toBe(hashes[0]);
  if (locking) expect(request).toHaveBeenCalledTimes(2);
});
