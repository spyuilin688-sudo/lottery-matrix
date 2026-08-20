import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildMatrixResultCacheKey,
  readMatrixResultCache,
  setMatrixCurrentPeriod,
  writeMatrixResultCache,
} from './matrix-result-cache';

type Store = Record<string, string>;

function installStorage() {
  let store: Store = {};
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      get length() { return Object.keys(store).length; },
      key(index: number) { return Object.keys(store)[index] ?? null; },
      getItem(key: string) { return store[key] ?? null; },
      setItem(key: string, value: string) { store[key] = String(value); },
      removeItem(key: string) { delete store[key]; },
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
});
