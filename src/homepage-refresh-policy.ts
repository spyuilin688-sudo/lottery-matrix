import type { NumberBallLottery } from './NumberBall';

export const HOME_REFRESH_INTERVAL_MS = 10 * 60_000;

export type HomepageRefreshGroup = 'fantasy5' | 'evening';

export type HomepageRefreshCycle = {
  group: HomepageRefreshGroup;
  cycleDate: string;
  lotteries: readonly NumberBallLottery[];
};

const FANTASY5_LOTTERIES = ['天天樂'] as const satisfies readonly NumberBallLottery[];
const EVENING_LOTTERIES = ['今彩539', '大樂透', '六合彩'] as const satisfies readonly NumberBallLottery[];
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1_000;

type TaipeiParts = {
  year: number;
  month: number;
  day: number;
  minuteOfDay: number;
};

function taipeiParts(now: Date): TaipeiParts {
  const wallClock = new Date(now.getTime() + TAIPEI_OFFSET_MS);
  return {
    year: wallClock.getUTCFullYear(),
    month: wallClock.getUTCMonth() + 1,
    day: wallClock.getUTCDate(),
    minuteOfDay: wallClock.getUTCHours() * 60 + wallClock.getUTCMinutes(),
  };
}

function isoDate(year: number, month: number, day: number, offsetDays = 0): string {
  const value = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return [
    String(value.getUTCFullYear()).padStart(4, '0'),
    String(value.getUTCMonth() + 1).padStart(2, '0'),
    String(value.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function taipeiEpoch(year: number, month: number, day: number, hour: number, minute: number, offsetDays = 0): number {
  return Date.UTC(year, month - 1, day + offsetDays, hour, minute) - TAIPEI_OFFSET_MS;
}

export function homepageRefreshCycleAt(now = new Date()): HomepageRefreshCycle | null {
  const parts = taipeiParts(now);

  if (parts.minuteOfDay >= 9 * 60 + 30 && parts.minuteOfDay <= 13 * 60) {
    return {
      group: 'fantasy5',
      cycleDate: isoDate(parts.year, parts.month, parts.day),
      lotteries: FANTASY5_LOTTERIES,
    };
  }

  if (parts.minuteOfDay >= 20 * 60 + 30) {
    return {
      group: 'evening',
      cycleDate: isoDate(parts.year, parts.month, parts.day),
      lotteries: EVENING_LOTTERIES,
    };
  }

  if (parts.minuteOfDay <= 60) {
    return {
      group: 'evening',
      cycleDate: isoDate(parts.year, parts.month, parts.day, -1),
      lotteries: EVENING_LOTTERIES,
    };
  }

  return null;
}

export function homepageRefreshCycleKey(cycle: HomepageRefreshCycle): string {
  return `${cycle.group}:${cycle.cycleDate}`;
}

export function millisecondsUntilNextHomepageRefreshWindow(now = new Date()): number {
  const parts = taipeiParts(now);
  const nowMs = now.getTime();
  let targetMs: number;

  if (parts.minuteOfDay < 9 * 60 + 30) {
    targetMs = taipeiEpoch(parts.year, parts.month, parts.day, 9, 30);
  } else if (parts.minuteOfDay < 20 * 60 + 30) {
    targetMs = taipeiEpoch(parts.year, parts.month, parts.day, 20, 30);
  } else {
    targetMs = taipeiEpoch(parts.year, parts.month, parts.day, 9, 30, 1);
  }

  return Math.max(1_000, targetMs - nowMs);
}
