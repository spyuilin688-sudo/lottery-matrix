import { beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());

const session = { user: { id: 'account-a' }, access_token: 'session-a' };

it('does not notify mounted consumers for initial session hydration, but does on logout', async () => {
  const { subscribeAlgorithmCacheScope, updateAlgorithmCacheSession } = await import('../algorithm-cache-scope');
  const listener = vi.fn();
  const unsubscribe = subscribeAlgorithmCacheScope(listener);
  updateAlgorithmCacheSession(session as never);
  expect(listener).not.toHaveBeenCalled();
  updateAlgorithmCacheSession(null);
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
  updateAlgorithmCacheSession(session as never);
  expect(listener).toHaveBeenCalledTimes(1);
});

it('does not let the first pending session lookup undo a logout event', async () => {
  const { readAlgorithmCacheScope, updateAlgorithmCacheSession } = await import('../algorithm-cache-scope');
  let finish!: (value: unknown) => void;
  const client = { auth: { getSession: () => new Promise((resolve) => { finish = resolve; }) } };
  const pending = readAlgorithmCacheScope(client as never);
  updateAlgorithmCacheSession(null);
  finish({ data: { session }, error: null });
  await expect(pending).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
});

it('allows concurrent initial lookups of the same session', async () => {
  const { readAlgorithmCacheScope } = await import('../algorithm-cache-scope');
  const client = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }) } };
  const [first, second] = await Promise.all([
    readAlgorithmCacheScope(client as never), readAlgorithmCacheScope(client as never),
  ]);
  expect(first).toBe(second);
});

it('allows concurrent lookups to discover the same new account', async () => {
  const { readAlgorithmCacheScope, updateAlgorithmCacheSession } = await import('../algorithm-cache-scope');
  updateAlgorithmCacheSession(session as never);
  const next = { user: { id: 'account-b' }, access_token: 'session-b' };
  const client = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: next }, error: null }) } };
  const [first, second] = await Promise.all([
    readAlgorithmCacheScope(client as never), readAlgorithmCacheScope(client as never),
  ]);
  expect(first).toBe(second);
});
