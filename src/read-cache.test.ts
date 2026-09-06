import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearReadCache, readThroughCache, resetReadCacheForTests } from './read-cache';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
afterEach(() => { resetReadCacheForTests(); vi.useRealTimers(); });

describe('read cache invalidation', () => {
  it('does not let a cleared older request replace fresh data', async () => {
    const old = deferred<string>();
    const pending = readThroughCache('data:key', 1000, () => old.promise);
    clearReadCache('data:');
    await readThroughCache('data:key', 1000, async () => 'fresh');
    old.resolve('old');
    await pending;
    expect(await readThroughCache('data:key', 1000, async () => 'unexpected')).toBe('fresh');
  });

  it('keeps the new pending request coalesced when an older one finishes', async () => {
    const old = deferred<string>();
    const fresh = deferred<string>();
    const first = readThroughCache('data:key', 1000, () => old.promise);
    clearReadCache('data:');
    const second = readThroughCache('data:key', 1000, () => fresh.promise);
    old.resolve('old');
    await first;
    const duplicate = vi.fn(async () => 'duplicate');
    const third = readThroughCache('data:key', 1000, duplicate);
    fresh.resolve('fresh');
    expect(await second).toBe('fresh');
    expect(await third).toBe('fresh');
    expect(duplicate).not.toHaveBeenCalled();
  });

  it('honors source expiry instead of renewing the full TTL', async () => {
    vi.useFakeTimers(); vi.setSystemTime(10000);
    await readThroughCache('data:key', 1000, async () => 'old', { expiresAt: () => 10100 });
    vi.setSystemTime(10100);
    expect(await readThroughCache('data:key', 1000, async () => 'fresh')).toBe('fresh');
  });

  it('lets loaders guard persistent writes after invalidation', async () => {
    const response = deferred<string>();
    const persist = vi.fn();
    const pending = readThroughCache('data:key', 1000, async ({ isCurrent }) => {
      const value = await response.promise;
      if (isCurrent()) persist(value);
      return value;
    });
    clearReadCache('data:');
    response.resolve('old');
    await pending;
    expect(persist).not.toHaveBeenCalled();
  });
});
