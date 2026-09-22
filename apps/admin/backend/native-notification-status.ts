export const nativeNotificationStatusId = 'native-notification-dispatch';

export type NativeNotificationHealth = {
  checked_at: string;
  mode: 'event-driven';
  event_trigger_enabled: boolean;
  admin_transfer_trigger_enabled: boolean;
  recovery: {
    enabled: boolean;
    strategy: string;
    schedule: string | null;
    queue_trigger_enabled: boolean;
    dynamic_enabled: boolean;
    next_due_at: string | null;
    last_started_at: string | null;
    last_finished_at: string | null;
    last_status: 'succeeded' | 'failed' | 'running' | 'unknown' | null;
  };
  web: {
    pending: number;
    processing: number;
    overdue: number;
    sent_24h: number;
    failed_24h: number;
    skipped_24h: number;
    last_sent_at: string | null;
    last_failed_at: string | null;
  };
  native: {
    enabled_devices: number;
    pending: number;
    processing: number;
    overdue: number;
    sent_24h: number;
    failed_24h: number;
    canceled_24h: number;
    last_sent_at: string | null;
    last_failed_at: string | null;
  };
  admin: {
    enabled_subscriptions: number;
    pending: number;
    sending: number;
    overdue: number;
    sent_24h: number;
    failed_24h: number;
    skipped_24h: number;
    last_sent_at: string | null;
    last_failed_at: string | null;
  };
};

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const timestamp = (value: unknown): value is string =>
  typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && Number.isFinite(Date.parse(value))
  && new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) === value.slice(0, 10);

const snapshotFreshnessMs = 5 * 60_000;
const recoveryFreshnessMs = 75 * 60_000;
const recoveryStrategy = 'dynamic-with-hourly-fallback';
const recoveryFallbackSchedule = '7 * * * *';
const recoveryStatuses = ['succeeded', 'failed', 'running', 'unknown'] as const;

const validQueue = (
  queue: Record<string, unknown>,
  activeKey: 'processing' | 'sending',
  terminalKey: 'skipped_24h' | 'canceled_24h',
  nullableTime: (value: unknown) => boolean,
) => {
  const keys = ['pending', activeKey, 'overdue', 'sent_24h', 'failed_24h', terminalKey];
  if (!keys.every(key => count(queue[key]))
    || !nullableTime(queue.last_sent_at)
    || !nullableTime(queue.last_failed_at)) return false;
  if (Number(queue.overdue) > Number(queue.pending) + Number(queue[activeKey])) return false;
  if (Number(queue.sent_24h) > 0 && queue.last_sent_at === null) return false;
  if (Number(queue.failed_24h) > 0 && queue.last_failed_at === null) return false;
  return true;
};

// Allowlist aggregate fields only. Tokens, member identities, SQL and provider
// payloads must never be projected into the admin client.
export function parseNativeNotificationHealth(value: unknown, now: Date): NativeNotificationHealth | null {
  if (!Number.isFinite(now.getTime()) || !record(value) || !timestamp(value.checked_at)
    || value.mode !== 'event-driven'
    || typeof value.event_trigger_enabled !== 'boolean'
    || typeof value.admin_transfer_trigger_enabled !== 'boolean'
    || !record(value.recovery) || !record(value.web) || !record(value.native) || !record(value.admin)) return null;

  const checked = Date.parse(value.checked_at);
  if (now.getTime() - checked > snapshotFreshnessMs || checked - now.getTime() > 60_000) return null;
  const nullableTime = (time: unknown) =>
    time === null || (timestamp(time) && Date.parse(time) <= checked + 60_000);
  const nullableTimestamp = (time: unknown) => time === null || timestamp(time);
  const recovery = value.recovery;
  if (typeof recovery.enabled !== 'boolean'
    || typeof recovery.strategy !== 'string'
    || !(recovery.schedule === null || typeof recovery.schedule === 'string')
    || typeof recovery.queue_trigger_enabled !== 'boolean'
    || typeof recovery.dynamic_enabled !== 'boolean'
    || !nullableTimestamp(recovery.next_due_at)
    || !nullableTime(recovery.last_started_at)
    || !nullableTime(recovery.last_finished_at)
    || !(recovery.last_status === null
      || (typeof recovery.last_status === 'string' && recoveryStatuses.includes(recovery.last_status as typeof recoveryStatuses[number])))
    || (recovery.last_finished_at !== null
      && (recovery.last_started_at === null || Date.parse(String(recovery.last_finished_at)) < Date.parse(String(recovery.last_started_at))))
    || (recovery.last_status === null && recovery.last_started_at !== null)
    || !count(value.native.enabled_devices)
    || !count(value.admin.enabled_subscriptions)
    || !validQueue(value.web, 'processing', 'skipped_24h', nullableTime)
    || !validQueue(value.native, 'processing', 'canceled_24h', nullableTime)
    || !validQueue(value.admin, 'sending', 'skipped_24h', nullableTime)) return null;

  return {
    checked_at: value.checked_at,
    mode: 'event-driven',
    event_trigger_enabled: value.event_trigger_enabled,
    admin_transfer_trigger_enabled: value.admin_transfer_trigger_enabled,
    recovery: {
      enabled: recovery.enabled,
      strategy: recovery.strategy,
      schedule: recovery.schedule as string | null,
      queue_trigger_enabled: recovery.queue_trigger_enabled,
      dynamic_enabled: recovery.dynamic_enabled,
      next_due_at: recovery.next_due_at as string | null,
      last_started_at: recovery.last_started_at as string | null,
      last_finished_at: recovery.last_finished_at as string | null,
      last_status: recovery.last_status as NativeNotificationHealth['recovery']['last_status'],
    },
    web: {
      pending: value.web.pending as number,
      processing: value.web.processing as number,
      overdue: value.web.overdue as number,
      sent_24h: value.web.sent_24h as number,
      failed_24h: value.web.failed_24h as number,
      skipped_24h: value.web.skipped_24h as number,
      last_sent_at: value.web.last_sent_at as string | null,
      last_failed_at: value.web.last_failed_at as string | null,
    },
    native: {
      enabled_devices: value.native.enabled_devices as number,
      pending: value.native.pending as number,
      processing: value.native.processing as number,
      overdue: value.native.overdue as number,
      sent_24h: value.native.sent_24h as number,
      failed_24h: value.native.failed_24h as number,
      canceled_24h: value.native.canceled_24h as number,
      last_sent_at: value.native.last_sent_at as string | null,
      last_failed_at: value.native.last_failed_at as string | null,
    },
    admin: {
      enabled_subscriptions: value.admin.enabled_subscriptions as number,
      pending: value.admin.pending as number,
      sending: value.admin.sending as number,
      overdue: value.admin.overdue as number,
      sent_24h: value.admin.sent_24h as number,
      failed_24h: value.admin.failed_24h as number,
      skipped_24h: value.admin.skipped_24h as number,
      last_sent_at: value.admin.last_sent_at as string | null,
      last_failed_at: value.admin.last_failed_at as string | null,
    },
  };
}

export function nativeNotificationWarning(health: NativeNotificationHealth, now: Date): string | undefined {
  if (!health.event_trigger_enabled) return '通知事件觸發器未啟用。';
  if (!health.admin_transfer_trigger_enabled) return '管理員轉帳通知觸發器未啟用。';
  if (!health.recovery.enabled) return '通知 Recovery 保底排程已停用。';
  if (health.recovery.strategy !== recoveryStrategy) return '通知 Recovery 不是動態排程模式。';
  if (health.recovery.schedule !== recoveryFallbackSchedule) return '通知 Recovery 每小時保底排程設定不正確。';
  if (!health.recovery.queue_trigger_enabled) return '通知 Recovery 動態排程觸發器未完整啟用。';
  if (health.recovery.next_due_at && !health.recovery.dynamic_enabled) return '通知有待補救工作，但動態 Recovery 尚未排程。';
  if (!health.recovery.next_due_at && health.recovery.dynamic_enabled) return '通知沒有待補救工作，但仍殘留動態 Recovery 排程。';
  if (health.recovery.last_status === 'failed') return '最近一次通知 Recovery 保底執行失敗。';
  if (health.recovery.last_started_at
    && now.getTime() - Date.parse(health.recovery.last_started_at) > recoveryFreshnessMs) {
    return '通知 Recovery 每小時保底超過 75 分鐘沒有執行紀錄。';
  }
  if (health.recovery.last_status !== null
    && !['succeeded', 'running'].includes(health.recovery.last_status)) {
    return '通知 Recovery 的最近狀態待確認。';
  }
  if (health.recovery.last_status === 'succeeded' && !health.recovery.last_finished_at) {
    return '通知 Recovery 尚無完整結束紀錄。';
  }
  if (health.web.overdue > 0) return 'Web Push 有超過 5 分鐘未處理的工作。';
  if (health.native.overdue > 0) return 'Native Push 有超過 5 分鐘未處理的工作。';
  if (health.admin.overdue > 0) return '管理員 Push 有超過 5 分鐘未處理的工作。';
  if (health.web.failed_24h > 0) return 'Web Push 在 24 小時內有派送失敗紀錄。';
  if (health.native.failed_24h > 0) return 'Native Push 在 24 小時內有派送失敗紀錄。';
  if (health.admin.failed_24h > 0) return '管理員 Push 在 24 小時內有派送失敗紀錄。';
  return undefined;
}
