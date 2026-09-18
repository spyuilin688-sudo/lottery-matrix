type MatrixResultCacheRequest = {
  lottery: string;
  drawPeriod: string;
};

const CACHE_PREFIX = 'matrix-result';
const LOTTERY_QUERY_CACHE_PREFIX = 'lottery-query';
const LOTTERY_HISTORY_CACHE_PREFIX = 'lottery-history';
const LOTTERY_LATEST_CACHE_PREFIX = 'lottery-latest';
const VERSION_PREFIX = 'matrix-result-period';

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function storageAvailable() {
  return storage() !== null;
}

function readStorageItem(key: string) {
  const target = storage();
  if (!target) return null;
  try {
    return target.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageItem(key: string, value: string) {
  const target = storage();
  if (!target) return false;
  try {
    target.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStorageItem(key: string) {
  const target = storage();
  if (!target) return;
  try {
    target.removeItem(key);
  } catch {
    // A damaged or unavailable cache must behave as a cache miss.
  }
}

function storageKeys() {
  const target = storage();
  if (!target) return [];
  try {
    const keys: string[] = [];
    for (let index = 0; index < target.length; index += 1) {
      const itemKey = target.key(index);
      if (itemKey) keys.push(itemKey);
    }
    return keys;
  } catch {
    return [];
  }
}

function writeJsonStorage(key: string, value: unknown) {
  try {
    return writeStorageItem(key, JSON.stringify(value));
  } catch {
    return false;
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function encodeSegment(value: string) {
  return encodeURIComponent(value);
}

function lotteryCachePrefix(lottery: string) {
  return `${CACHE_PREFIX}:${encodeSegment(lottery)}:`;
}

function lotteryQueryCachePrefix(lottery: string) {
  return `${LOTTERY_QUERY_CACHE_PREFIX}:${encodeSegment(lottery)}:`;
}

function lotteryHistoryCachePrefix(lottery: string) {
  return `${LOTTERY_HISTORY_CACHE_PREFIX}:${encodeSegment(lottery)}:`;
}

function lotteryLatestCacheKey(lottery: string) {
  return `${LOTTERY_LATEST_CACHE_PREFIX}:${encodeSegment(lottery)}`;
}

function versionKey(lottery: string) {
  return `${VERSION_PREFIX}:${encodeSegment(lottery)}`;
}

export function buildMatrixResultCacheKey<T extends MatrixResultCacheRequest>(request: T) {
  const canonical = JSON.stringify(stableValue(request));
  return `${lotteryCachePrefix(request.lottery)}${encodeSegment(request.drawPeriod)}:${canonical}`;
}

export function getMatrixCurrentPeriod(lottery: string) {
  if (!storageAvailable()) return null;
  return readStorageItem(versionKey(lottery));
}

export function setMatrixCurrentPeriod(lottery: string, drawPeriod: string) {
  if (!storageAvailable() || !drawPeriod) return;
  const key = versionKey(lottery);
  const previous = readStorageItem(key);
  if (previous === drawPeriod) return;

  clearMatrixLotteryData(lottery);
  writeStorageItem(key, drawPeriod);
}

/** Clear derived data even when corrected numbers retain the same draw period. */
export function clearMatrixLotteryData(lottery: string) {
  const prefixes = [lotteryCachePrefix(lottery), lotteryQueryCachePrefix(lottery), lotteryHistoryCachePrefix(lottery)];
  storageKeys()
    .filter((key) => prefixes.some((prefix) => key.startsWith(prefix)))
    .forEach(removeStorageItem);
}

export function readMatrixResultCache<T>(request: MatrixResultCacheRequest): T | null {
  if (!storageAvailable()) return null;
  if (getMatrixCurrentPeriod(request.lottery) !== request.drawPeriod) return null;
  const cacheKey = buildMatrixResultCacheKey(request);
  const stored = readStorageItem(cacheKey);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as T;
  } catch {
    removeStorageItem(cacheKey);
    return null;
  }
}

export function writeMatrixResultCache<T>(request: MatrixResultCacheRequest, result: T) {
  if (!storageAvailable()) return;
  setMatrixCurrentPeriod(request.lottery, request.drawPeriod);
  writeJsonStorage(buildMatrixResultCacheKey(request), result);
}

function buildLotteryQueryCacheKey(lottery: string, drawPeriod: string, query: unknown) {
  return `${lotteryQueryCachePrefix(lottery)}${encodeSegment(drawPeriod)}:${JSON.stringify(stableValue(query))}`;
}

export function readLotteryQueryCache<T>(lottery: string, drawPeriod: string, query: unknown): T | null {
  if (!storageAvailable() || getMatrixCurrentPeriod(lottery) !== drawPeriod) return null;
  const cacheKey = buildLotteryQueryCacheKey(lottery, drawPeriod, query);
  const stored = readStorageItem(cacheKey);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as T;
  } catch {
    removeStorageItem(cacheKey);
    return null;
  }
}

export function writeLotteryQueryCache<T>(lottery: string, drawPeriod: string, query: unknown, result: T) {
  if (!storageAvailable() || !drawPeriod) return;
  setMatrixCurrentPeriod(lottery, drawPeriod);
  writeJsonStorage(buildLotteryQueryCacheKey(lottery, drawPeriod, query), result);
}

export type TimedLotteryCache<T> = { savedAt: number; value: T };
const LOTTERY_CACHE_MAX_AGE_MS = 5 * 60 * 1_000;

function readTimedCache<T>(key: string, maxAgeMs: number): TimedLotteryCache<T> | null {
  const stored = readStorageItem(key);
  if (!stored) return null;
  try {
    const cached = JSON.parse(stored) as TimedLotteryCache<T> | null;
    if (!cached || !Number.isFinite(cached.savedAt) || cached.savedAt > Date.now()
      || Date.now() - cached.savedAt >= maxAgeMs || !Object.prototype.hasOwnProperty.call(cached, 'value')) {
      removeStorageItem(key);
      return null;
    }
    return cached;
  } catch {
    removeStorageItem(key);
    return null;
  }
}

export function readLotteryLatestCacheEntry<T>(lottery: string, maxAgeMs: number) {
  return readTimedCache<T>(lotteryLatestCacheKey(lottery), maxAgeMs);
}

export function readLotteryLatestCache<T>(lottery: string, maxAgeMs: number): T | null {
  return readLotteryLatestCacheEntry<T>(lottery, maxAgeMs)?.value ?? null;
}

export function writeLotteryLatestCache<T>(lottery: string, value: T) {
  writeJsonStorage(lotteryLatestCacheKey(lottery), { savedAt: Date.now(), value } satisfies TimedLotteryCache<T>);
}

function buildLotteryHistoryCacheKey(lottery: string, drawPeriod: string, limit?: number) {
  return `${lotteryHistoryCachePrefix(lottery)}${encodeSegment(drawPeriod)}:${limit ?? 'all'}`;
}

export function readLotteryHistoryCacheEntry<T>(lottery: string, drawPeriod: string, limit?: number, maxAgeMs = LOTTERY_CACHE_MAX_AGE_MS) {
  if (getMatrixCurrentPeriod(lottery) !== drawPeriod) return null;
  return readTimedCache<T>(buildLotteryHistoryCacheKey(lottery, drawPeriod, limit), maxAgeMs);
}

export function readLotteryHistoryCache<T>(lottery: string, drawPeriod: string, limit?: number): T | null {
  return readLotteryHistoryCacheEntry<T>(lottery, drawPeriod, limit)?.value ?? null;
}

export function writeLotteryHistoryCache<T>(lottery: string, drawPeriod: string, limit: number | undefined, value: T) {
  if (!storageAvailable() || !drawPeriod) return;
  setMatrixCurrentPeriod(lottery, drawPeriod);
  writeJsonStorage(buildLotteryHistoryCacheKey(lottery, drawPeriod, limit), { savedAt: Date.now(), value } satisfies TimedLotteryCache<T>);
}
