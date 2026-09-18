type CacheEntry<T> = { expiresAt: number; value: T };

const values = new Map<string, CacheEntry<unknown>>();
type PendingRead = { promise: Promise<unknown> };
const pending = new Map<string, PendingRead>();

export function stableCacheKey(namespace: string, value: unknown) {
  const stable = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(stable);
    if (item !== null && typeof item === 'object') {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, stable(child)]),
      );
    }
    return item;
  };
  return `${namespace}:${JSON.stringify(stable(value))}`;
}

export async function readThroughCache<T>(
  key: string,
  ttlMs: number,
  load: (context: { isCurrent: () => boolean }) => Promise<T>,
  options: { expiresAt?: () => number } = {},
): Promise<T> {
  const cached = values.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) values.delete(key);

  const existing = pending.get(key);
  if (existing) return existing.promise as Promise<T>;

  // Register ownership before invoking the loader, including synchronous work.
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  const entry: PendingRead = { promise };
  pending.set(key, entry);
  const isCurrent = () => pending.get(key) === entry;
  try {
    const value = await load({ isCurrent });
    if (isCurrent()) {
      const expiresAt = Math.min(Date.now() + ttlMs, options.expiresAt?.() ?? Infinity);
      if (expiresAt > Date.now()) values.set(key, { value, expiresAt });
    }
    resolve(value);
  } catch (error) {
    reject(error);
  } finally {
    if (isCurrent()) pending.delete(key);
  }
  return promise;
}

export function clearReadCache(prefix: string) {
  for (const key of values.keys()) if (key.startsWith(prefix)) values.delete(key);
  for (const key of pending.keys()) if (key.startsWith(prefix)) pending.delete(key);
}

export function resetReadCacheForTests() {
  values.clear();
  pending.clear();
}
