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
