/** All administrative calendar dates use Taiwan's business timezone. */
export const adminBusinessTimeZone = 'Asia/Taipei';
const businessDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: adminBusinessTimeZone, year: 'numeric', month: '2-digit', day: '2-digit',
});

export function adminBusinessDateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = businessDateFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Inclusive input dates become a half-open timestamp range. */
export function adminBusinessDateRange(startDate: string, endDate: string) {
  const midnight = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('日期格式不正確');
    const date = new Date(`${value}T00:00:00+08:00`);
    if (!Number.isFinite(date.getTime()) || adminBusinessDateKey(date) !== value) throw new Error('日期格式不正確');
    return date;
  };
  const start = startDate ? midnight(startDate) : null;
  const end = endDate ? midnight(endDate) : null;
  if (start && end && start > end) throw new Error('日期範圍不正確');
  return {
    start: start?.toISOString() ?? null,
    endExclusive: end ? new Date(end.getTime() + 86_400_000).toISOString() : null,
  };
}
