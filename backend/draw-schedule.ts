const PACIFIC_TIME_ZONE = 'America/Los_Angeles';

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const pacificFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: PACIFIC_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function partsInPacific(date: Date): DateParts {
  const values = Object.fromEntries(
    pacificFormatter
      .formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)]),
  );
  return values as DateParts;
}

function pacificDateTimeToInstant(parts: DateParts): Date {
  const wallClockUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  let candidate = wallClockUtc;
  for (let index = 0; index < 2; index += 1) {
    const observed = partsInPacific(new Date(candidate));
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    candidate -= observedAsUtc - wallClockUtc;
  }
  return new Date(candidate);
}

function addPacificCalendarDay(parts: DateParts): DateParts {
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

export function nextFantasy5DrawAt(now = new Date()): string {
  const today = partsInPacific(now);
  let draw = pacificDateTimeToInstant({ ...today, hour: 18, minute: 30, second: 0 });
  if (draw.getTime() <= now.getTime()) {
    draw = pacificDateTimeToInstant(addPacificCalendarDay({ ...today, hour: 18, minute: 30, second: 0 }));
  }
  return draw.toISOString();
}

export function isFantasy5RefreshTime(now = new Date()): boolean {
  const pacific = partsInPacific(now);
  return pacific.hour === 18 && pacific.minute === 50;
}

export function nextDrawAtForDisplay(
  lottery: string,
  cachedNextDrawAt: string | null,
  now = new Date(),
): string | null {
  if (lottery === '天天樂') return nextFantasy5DrawAt(now);
  if (cachedNextDrawAt) return cachedNextDrawAt;
  if (lottery === '今彩539' || lottery === '大樂透') return nextTaipeiLotteryDrawAt(lottery, now);
  return null;
}

export function nextTaipeiLotteryDrawAt(lottery: '今彩539' | '大樂透', now = new Date()): string {
  const drawDays = lottery === '今彩539' ? new Set([1, 2, 3, 4, 5, 6]) : new Set([2, 5]);
  const taipeiWallClock = new Date(now.getTime() + 8 * 60 * 60 * 1_000);
  for (let offset = 0; offset < 8; offset += 1) {
    const localDate = new Date(Date.UTC(taipeiWallClock.getUTCFullYear(), taipeiWallClock.getUTCMonth(), taipeiWallClock.getUTCDate() + offset));
    if (!drawDays.has(localDate.getUTCDay())) continue;
    const draw = new Date(Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate(), 12, 30));
    if (draw.getTime() > now.getTime()) return draw.toISOString();
  }
  throw new Error('NEXT_DRAW_NOT_FOUND');
}
