export const nativeNotificationStatusId = 'native-notification-dispatch';

export type NativeNotificationHealth = {
  checked_at: string;
  enabled_devices: number;
  schedule: {
    enabled: boolean; every_minute: boolean; last_started_at: string | null; last_finished_at: string | null;
    last_status: 'succeeded' | 'failed' | 'running' | 'unknown' | null;
  };
  deliveries: {
    pending: number; processing: number; overdue: number; sent_24h: number; failed_24h: number; canceled_24h: number;
    last_sent_at: string | null; last_failed_at: string | null;
  };
};

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const timestamp = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
  && new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) === value.slice(0, 10);
const freshnessMs = 5 * 60_000;

// Allowlist aggregate fields; never return device tokens, identities, SQL or provider errors.
export function parseNativeNotificationHealth(value: unknown, now: Date): NativeNotificationHealth | null {
  if (!Number.isFinite(now.getTime()) || !record(value) || !timestamp(value.checked_at) || !count(value.enabled_devices)
    || !record(value.schedule) || !record(value.deliveries)) return null;
  const checked = Date.parse(value.checked_at);
  if (now.getTime() - checked > freshnessMs || checked - now.getTime() > 60_000) return null;
  const nullableTime = (time: unknown) => time === null || (timestamp(time) && Date.parse(time) <= checked + 60_000);
  const schedule = value.schedule;
  const deliveries = value.deliveries;
  if (typeof schedule.enabled !== 'boolean' || typeof schedule.every_minute !== 'boolean'
    || !nullableTime(schedule.last_started_at) || !nullableTime(schedule.last_finished_at)
    || !(schedule.last_status === null || (typeof schedule.last_status === 'string' && ['succeeded', 'failed', 'running', 'unknown'].includes(schedule.last_status)))
    || !['pending', 'processing', 'overdue', 'sent_24h', 'failed_24h', 'canceled_24h'].every(key => count(deliveries[key]))
    || !nullableTime(deliveries.last_sent_at) || !nullableTime(deliveries.last_failed_at)) return null;
  if (Number(deliveries.overdue) > Number(deliveries.pending) + Number(deliveries.processing)
    || (Number(deliveries.sent_24h) > 0 && deliveries.last_sent_at === null)
    || (Number(deliveries.failed_24h) > 0 && deliveries.last_failed_at === null)
    || (schedule.last_finished_at !== null && (schedule.last_started_at === null || Date.parse(String(schedule.last_finished_at)) < Date.parse(String(schedule.last_started_at))))
    || (schedule.last_status === null && schedule.last_started_at !== null)) return null;
  return {
    checked_at: value.checked_at, enabled_devices: value.enabled_devices,
    schedule: { enabled: schedule.enabled, every_minute: schedule.every_minute,
      last_started_at: schedule.last_started_at as string | null, last_finished_at: schedule.last_finished_at as string | null,
      last_status: schedule.last_status as NativeNotificationHealth['schedule']['last_status'] },
    deliveries: {
      pending: deliveries.pending as number, processing: deliveries.processing as number, overdue: deliveries.overdue as number,
      sent_24h: deliveries.sent_24h as number, failed_24h: deliveries.failed_24h as number, canceled_24h: deliveries.canceled_24h as number,
      last_sent_at: deliveries.last_sent_at as string | null, last_failed_at: deliveries.last_failed_at as string | null,
    },
  };
}

export function nativeNotificationWarning(health: NativeNotificationHealth, now: Date): string | undefined {
  if (!health.schedule.enabled) return '原生通知排程已停用。';
  if (!health.schedule.every_minute) return '原生通知排程未設定為每分鐘執行。';
  if (health.schedule.last_status === 'failed') return '最近一次原生通知排程回報失敗。';
  if (!health.schedule.last_started_at || now.getTime() - Date.parse(health.schedule.last_started_at) > freshnessMs) return '原生通知排程超過 5 分鐘沒有執行紀錄。';
  if (!['succeeded', 'running'].includes(health.schedule.last_status ?? '')) return '原生通知排程的最近狀態待確認。';
  if (health.schedule.last_status === 'succeeded' && !health.schedule.last_finished_at) return '原生通知排程尚無完整結束紀錄。';
  if (health.deliveries.overdue > 0) return '原生通知有超過 5 分鐘未處理的到期工作。';
  if (health.deliveries.failed_24h > 0) return '原生通知在 24 小時內有派送失敗紀錄，請查看派送情況。';
  return undefined;
}
