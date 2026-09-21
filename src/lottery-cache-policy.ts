import type { NumberBallLottery } from './NumberBall';

export type LotteryReadCacheClass = 'latest' | 'standard';

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1_000;
const LATEST_SHORT_TTL_MS = 30_000;
const STANDARD_SHORT_TTL_MS = 5 * 60_000;

function taipeiParts(timestamp: number) {
  const date = new Date(timestamp + TAIPEI_OFFSET_MS);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
  };
}

function taipeiTimestamp(
  year: number,
  month: number,
  day: number,
  hour: number,
) {
  return Date.UTC(year, month, day, hour) - TAIPEI_OFFSET_MS;
}

function shortTtl(cacheClass: LotteryReadCacheClass) {
  return cacheClass === 'latest' ? LATEST_SHORT_TTL_MS : STANDARD_SHORT_TTL_MS;
}

export function lotteryReadCacheExpiresAt(
  lottery: NumberBallLottery,
  cacheClass: LotteryReadCacheClass,
  startedAt = Date.now(),
) {
  const { year, month, day, hour } = taipeiParts(startedAt);

  if (lottery === '天天樂') {
    if (hour >= 13) {
      return taipeiTimestamp(year, month, day + 1, 9);
    }
    if (hour < 9) {
      return taipeiTimestamp(year, month, day, 9);
    }
  } else if (hour >= 1 && hour < 20) {
    return taipeiTimestamp(year, month, day, 20);
  }

  return startedAt + shortTtl(cacheClass);
}

export function lotteryReadCacheTtlMs(
  lottery: NumberBallLottery,
  cacheClass: LotteryReadCacheClass,
  startedAt = Date.now(),
) {
  return Math.max(0, lotteryReadCacheExpiresAt(lottery, cacheClass, startedAt) - startedAt);
}

export function isLotteryReadCacheFresh(
  lottery: NumberBallLottery,
  cacheClass: LotteryReadCacheClass,
  savedAt: number,
  now = Date.now(),
) {
  return savedAt <= now && now < lotteryReadCacheExpiresAt(lottery, cacheClass, savedAt);
}
