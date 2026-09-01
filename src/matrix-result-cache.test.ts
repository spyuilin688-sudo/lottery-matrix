import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildMatrixResultCacheKey,
  readLotteryLatestCache,
  readMatrixResultCache,
  setMatrixCurrentPeriod,
  writeLotteryHistoryCache,
  writeLotteryLatestCache,
  writeLotteryQueryCache,
  writeMatrixResultCache,
} from './matrix-result-cache';

type Store = Record<string, string>;
type StorageBehavior = {
  getItem?: (key: string) => string | null;
  removeItem?: (key: string) => void;
  setItem?: (key: string, value: string) => void;
};

function installStorage(initial: Store = {}, behavior: StorageBehavior = {}) {
  let store: Store = { ...initial };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      get length() { return Object.keys(store).length; },
      key(index: number) { return Object.keys(store)[index] ?? null; },
      getItem(key: string) { return behavior.getItem ? behavior.getItem(key) : store[key] ?? null; },
      setItem(key: string, value: string) {
        if (behavior.setItem) return behavior.setItem(key, value);
        store[key] = String(value);
      },
      removeItem(key: string) {
        if (behavior.removeItem) return behavior.removeItem(key);
        delete store[key];
      },
      clear() { store = {}; },
    },
  });
}

const baseRequest = {
  lottery: '今彩539',
  drawPeriod: '115000123',
  numberOrder: '依號碼由小到大排序',
  lockedPosition: 1,
  lockedNumber: 5,
  predictionDistance: 2,
  ruleCount: 1,
  algorithmType: '加減版路',
} as const;

describe('Matrix result PWA cache', () => {
  beforeEach(() => installStorage());

  it('uses every result-affecting condition in the cache key', () => {
    const first = buildMatrixResultCacheKey(baseRequest);
    const second = buildMatrixResultCacheKey({ ...baseRequest, predictionDistance: 3 });
    expect(first).not.toBe(second);
  });

  it('returns the stored result for the same lottery, period and query without time expiry', () => {
    setMatrixCurrentPeriod('今彩539', baseRequest.drawPeriod);
    const result = { valid: true, predictionNumbers: [3, 9] };
    writeMatrixResultCache(baseRequest, result);
    expect(readMatrixResultCache(baseRequest)).toEqual(result);
  });

  it('invalidates the previous-period cache immediately when the draw period changes', () => {
    setMatrixCurrentPeriod('今彩539', baseRequest.drawPeriod);
    writeMatrixResultCache(baseRequest, { valid: true });
    setMatrixCurrentPeriod('今彩539', '115000124');
    expect(readMatrixResultCache(baseRequest)).toBeNull();
  });

  it('keeps all result, query, history, and latest cache writes non-fatal when storage is full', () => {
    installStorage({}, { setItem: () => { throw new Error('QuotaExceededError'); } });

    expect(() => writeMatrixResultCache(baseRequest, { valid: true })).not.toThrow();
    expect(() => writeLotteryQueryCache('今彩539', baseRequest.drawPeriod, { limit: 10 }, [{ period: baseRequest.drawPeriod }])).not.toThrow();
    expect(() => writeLotteryHistoryCache('今彩539', baseRequest.drawPeriod, 10, [{ period: baseRequest.drawPeriod }])).not.toThrow();
    expect(() => writeLotteryLatestCache('今彩539', { period: baseRequest.drawPeriod })).not.toThrow();
  });

  it('treats malformed local cache data as a cache miss even when cleanup cannot write', () => {
    const key = `lottery-latest:${encodeURIComponent('今彩539')}`;
    installStorage({ [key]: '{bad json' }, { removeItem: () => { throw new Error('storage unavailable'); } });

    expect(readLotteryLatestCache('今彩539', 5 * 60 * 1_000)).toBeNull();
  });
});
