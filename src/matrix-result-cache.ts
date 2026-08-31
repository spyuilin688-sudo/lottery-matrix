type MatrixResultCacheRequest = {
  lottery: string;
  drawPeriod: string;
};

const CACHE_PREFIX = 'matrix-result';
const LOTTERY_QUERY_CACHE_PREFIX = 'lottery-query';
const LOTTERY_HISTORY_CACHE_PREFIX = 'lottery-history';
const LOTTERY_LATEST_CACHE_PREFIX = 'lottery-latest';
const VERSION_PREFIX = 'matrix-result-period';

function storageAvailable() {
  return typeof localStorage !== 'undefined';
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
  return localStorage.getItem(versionKey(lottery));
}

export function setMatrixCurrentPeriod(lottery: string, drawPeriod: string) {
  if (!storageAvailable() || !drawPeriod) return;
  const key = versionKey(lottery);
  const previous = localStorage.getItem(key);
  if (previous === drawPeriod) return;

  const prefixes = [
    lotteryCachePrefix(lottery),
    lotteryQueryCachePrefix(lottery),
    lotteryHistoryCachePrefix(lottery),
  ];
  const keysToRemove: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const itemKey = localStorage.key(index);
    if (itemKey && prefixes.some((prefix) => itemKey.startsWith(prefix))) keysToRemove.push(itemKey);
  }
  keysToRemove.forEach((itemKey) => localStorage.removeItem(itemKey));
  localStorage.setItem(key, drawPeriod);
}

export function readMatrixResultCache<T>(request: MatrixResultCacheRequest): T | null {
  if (!storageAvailable()) return null;
  if (getMatrixCurrentPeriod(request.lottery) !== request.drawPeriod) return null;
  const cacheKey = buildMatrixResultCacheKey(request);
  const stored = localStorage.getItem(cacheKey);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as T;
  } catch {
    localStorage.removeItem(cacheKey);
    return null;
  }
}

export function writeMatrixResultCache<T>(request: MatrixResultCacheRequest, result: T) {
  if (!storageAvailable()) return;
  setMatrixCurrentPeriod(request.lottery, request.drawPeriod);
  localStorage.setItem(buildMatrixResultCacheKey(request), JSON.stringify(result));
}

function buildLotteryQueryCacheKey(lottery: string, drawPeriod: string, query: unknown) {
  return `${lotteryQueryCachePrefix(lottery)}${encodeSegment(drawPeriod)}:${JSON.stringify(stableValue(query))}`;
}

export function readLotteryQueryCache<T>(lottery: string, drawPeriod: string, query: unknown): T | null {
  if (!storageAvailable() || getMatrixCurrentPeriod(lottery) !== drawPeriod) return null;
  const cacheKey = buildLotteryQueryCacheKey(lottery, drawPeriod, query);
  const stored = localStorage.getItem(cacheKey);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as T;
  } catch {
    localStorage.removeItem(cacheKey);
    return null;
  }
}

export function writeLotteryQueryCache<T>(lottery: string, drawPeriod: string, query: unknown, result: T) {
  if (!storageAvailable() || !drawPeriod) return;
  setMatrixCurrentPeriod(lottery, drawPeriod);
  localStorage.setItem(buildLotteryQueryCacheKey(lottery, drawPeriod, query), JSON.stringify(result));
}

type TimedLotteryCache<T> = { savedAt: number; value: T };

export function readLotteryLatestCache<T>(lottery: string, maxAgeMs: number): T | null {
  if (!storageAvailable()) return null;
  const key = lotteryLatestCacheKey(lottery);
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  try {
    const cached = JSON.parse(stored) as TimedLotteryCache<T>;
    if (!Number.isFinite(cached.savedAt) || Date.now() - cached.savedAt >= maxAgeMs) {
      localStorage.removeItem(key);
      return null;
    }
    return cached.value;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

export function writeLotteryLatestCache<T>(lottery: string, value: T) {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(
      lotteryLatestCacheKey(lottery),
      JSON.stringify({ savedAt: Date.now(), value } satisfies TimedLotteryCache<T>),
    );
  } catch {
    // A full browser cache must not block the latest result from being displayed.
  }
}

function buildLotteryHistoryCacheKey(lottery: string, drawPeriod: string, limit?: number) {
  return `${lotteryHistoryCachePrefix(lottery)}${encodeSegment(drawPeriod)}:${limit ?? 'all'}`;
}

export function readLotteryHistoryCache<T>(lottery: string, drawPeriod: string, limit?: number): T | null {
  if (!storageAvailable() || getMatrixCurrentPeriod(lottery) !== drawPeriod) return null;
  const key = buildLotteryHistoryCacheKey(lottery, drawPeriod, limit);
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as T;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

export function writeLotteryHistoryCache<T>(lottery: string, drawPeriod: string, limit: number | undefined, value: T) {
  if (!storageAvailable() || !drawPeriod) return;
  setMatrixCurrentPeriod(lottery, drawPeriod);
  try {
    localStorage.setItem(buildLotteryHistoryCacheKey(lottery, drawPeriod, limit), JSON.stringify(value));
  } catch {
    // A full browser cache must not block the history result from being displayed.
  }
}
