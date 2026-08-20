type MatrixResultCacheRequest = {
  lottery: string;
  drawPeriod: string;
};

const CACHE_PREFIX = 'matrix-result';
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

  const prefix = lotteryCachePrefix(lottery);
  const keysToRemove: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const itemKey = localStorage.key(index);
    if (itemKey?.startsWith(prefix)) keysToRemove.push(itemKey);
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
