export const notificationCalendarStatusId = 'notification-calendar';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
const timestamp = (value: unknown): value is string => typeof value === 'string' && date(value.slice(0,10))
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const nullable = (value: unknown, check: (value: unknown) => boolean) => value === null || check(value);
const messages = ['官方日期待確認，六合彩選號提醒暫停。','今天開獎，依設定時間提醒。','今天沒有排定開獎，不發送選號提醒。'];

export function parseNotificationCalendarStatus(value: unknown, now: Date) {
  if (!record(value) || value.lottery !== '六合彩' || typeof value.status !== 'string' || !['已確認','待確認'].includes(value.status)
    || !timestamp(value.checked_at) || Math.abs(now.getTime()-Date.parse(value.checked_at)) > 5*60_000
    || !['last_checked_at','last_success_at','valid_until'].every(key=>nullable(value[key],timestamp))
    || !['coverage_start','coverage_end','next_draw_date'].every(key=>nullable(value[key],date))
    || typeof value.is_draw_day_today !== 'boolean' || typeof value.message !== 'string' || !messages.includes(value.message)) return null;
  if (value.status === '已確認' && (!timestamp(value.valid_until) || Date.parse(value.valid_until) <= now.getTime()
    || !timestamp(value.last_success_at) || Date.parse(value.last_success_at) > now.getTime()+60_000
    || !date(value.coverage_start) || !date(value.coverage_end))) return null;
  return {
    lottery: '六合彩', status: value.status, checked_at: value.checked_at,
    last_checked_at: value.last_checked_at, last_success_at: value.last_success_at, valid_until: value.valid_until,
    coverage_start: value.coverage_start, coverage_end: value.coverage_end, next_draw_date: value.next_draw_date,
    is_draw_day_today: value.is_draw_day_today, message: value.message,
  };
}
