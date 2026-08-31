type CacheEntry<T> = { expiresAt: number; value: T };

const values = new Map<string, CacheEntry<unknown>>();
const pending = new Map<string, Promise<unknown>>();

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
  load: () => Promise<T>,
): Promise<T> {
  const cached = values.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) values.delete(key);

  const existing = pending.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const request = load().then((value) => {
    values.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  });
  pending.set(key, request);
  try {
    return await request;
  } finally {
    pending.delete(key);
  }
}

export function clearReadCache(prefix: string) {
  for (const key of values.keys()) if (key.startsWith(prefix)) values.delete(key);
  for (const key of pending.keys()) if (key.startsWith(prefix)) pending.delete(key);
}

export function resetReadCacheForTests() {
  values.clear();
  pending.clear();
}
