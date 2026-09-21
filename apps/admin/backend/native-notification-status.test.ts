import { describe, expect, it, vi } from 'vitest';
import { createConnectionStatus } from './connection-status';
import { getServiceEvidenceFacts, getSystemStatusPresentation } from '../src/system-status';

const endpoint = 'https://db.test/rest/v1/rpc/admin_notification_delivery_health';
const fixture = () => ({
  checked_at: '2026-09-13T12:00:00Z',
  mode: 'event-driven',
  event_trigger_enabled: true,
  admin_transfer_trigger_enabled: true,
  recovery: {
    enabled: true,
    schedule: '*/5 * * * *',
    last_started_at: '2026-09-13T11:55:00Z',
    last_finished_at: '2026-09-13T11:55:01Z',
    last_status: 'succeeded',
  },
  web: {
    pending: 0, processing: 0, overdue: 0,
    sent_24h: 2, failed_24h: 0, skipped_24h: 0,
    last_sent_at: '2026-09-13T11:40:00Z', last_failed_at: null,
  },
  native: {
    enabled_devices: 0, pending: 0, processing: 0, overdue: 0,
    sent_24h: 0, failed_24h: 0, canceled_24h: 0,
    last_sent_at: '2026-09-09T21:30:00Z', last_failed_at: '2026-09-10T00:30:00Z',
  },
  admin: {
    enabled_subscriptions: 0, pending: 0, sending: 0, overdue: 0,
    sent_24h: 0, failed_24h: 0, skipped_24h: 0,
    last_sent_at: null, last_failed_at: null,
  },
});

const check = async (body: unknown, httpStatus = 200) => {
  const fetcher = vi.fn(async (input: RequestInfo | URL) =>
    Response.json(String(input) === endpoint ? body : [], {
      status: String(input) === endpoint ? httpStatus : 200,
    }));
  const result = await createConnectionStatus({
    supabase: { selectRows: async () => [] },
    loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'server-secret' }),
    getWorkerStatus: async () => ({ ok: false, reason: 'APPDEPLOY_CONFIG_MISSING', health: null, jobs: null }),
    now: () => new Date('2026-09-13T12:00:00Z'),
    fetcher,
    requestTimeoutMs: 25,
  }).get();
  const item = result.items.find(value => value.id === 'native-notification-dispatch');
  expect(item, 'notification delivery health must have a monitored row').toBeDefined();
  return { item: item!, fetcher };
};

describe('event-driven notification delivery monitoring', () => {
  it('verifies event triggers, five-minute recovery and all three queues without sending notifications', async () => {
    const { item, fetcher } = await check({
      ...fixture(),
      token: 'must-not-leak',
      recovery: { ...fixture().recovery, command: 'private-command' },
    });
    expect(item).toMatchObject({
      ok: true,
      healthState: 'healthy',
      checkMode: 'service',
      checkEvidence: 'reported',
      detail: fixture(),
    });
    expect(fetcher.mock.calls.filter(([url]) => String(url) === endpoint)).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith(endpoint, expect.objectContaining({
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      headers: { apikey: 'server-secret', Authorization: 'Bearer server-secret' },
    }));
    expect(fetcher.mock.calls.some(([url]) =>
      /notification_(dispatch|claim|prepare|finalize)|admin-transfer-push/.test(String(url)))).toBe(false);
    expect(JSON.stringify(item)).not.toMatch(/server-secret|must-not-leak|private-command/);
    expect(getSystemStatusPresentation(item)).toMatchObject({
      label: '事件派送正常',
      tone: 'limited',
      scope: expect.stringContaining('5 分鐘 Recovery'),
    });
    expect(getServiceEvidenceFacts(item)).toEqual(expect.arrayContaining([
      { label: '派送模式', value: '事件觸發' },
      { label: '事件觸發', value: '已啟用' },
      { label: '管理員轉帳觸發', value: '已啟用' },
      { label: 'Recovery 頻率', value: '每 5 分鐘' },
      { label: 'Web 待處理', value: '0' },
      { label: 'Native 待處理', value: '0' },
      { label: 'Admin 待處理', value: '0' },
      { label: '24 小時 Web 派送成功', value: '2' },
      { label: '驗證範圍', value: expect.stringContaining('不發送測試通知') },
    ]));
  });

  it.each([
    ['event trigger disabled', { event_trigger_enabled: false }],
    ['admin trigger disabled', { admin_transfer_trigger_enabled: false }],
    ['recovery disabled', { recovery: { ...fixture().recovery, enabled: false } }],
    ['wrong recovery schedule', { recovery: { ...fixture().recovery, schedule: '* * * * *' } }],
    ['failed recovery', { recovery: { ...fixture().recovery, last_status: 'failed' } }],
    ['stale recovery', { recovery: { ...fixture().recovery, last_started_at: '2026-09-13T11:45:00Z', last_finished_at: '2026-09-13T11:45:01Z' } }],
    ['web overdue', { web: { ...fixture().web, pending: 1, overdue: 1 } }],
    ['native overdue', { native: { ...fixture().native, pending: 1, overdue: 1 } }],
    ['admin overdue', { admin: { ...fixture().admin, pending: 1, overdue: 1 } }],
    ['recent web failure', { web: { ...fixture().web, failed_24h: 1, last_failed_at: '2026-09-13T11:45:00Z' } }],
    ['recent native failure', { native: { ...fixture().native, failed_24h: 1, last_failed_at: '2026-09-13T11:45:00Z' } }],
    ['recent admin failure', { admin: { ...fixture().admin, failed_24h: 1, last_failed_at: '2026-09-13T11:45:00Z' } }],
  ])('shows %s as a specific warning', async (_name, changes) => {
    const { item } = await check({ ...fixture(), ...changes });
    expect(item).toMatchObject({ ok: false, healthState: 'failed', error: expect.any(String) });
    expect(getSystemStatusPresentation(item)).toMatchObject({ label: '需查看紀錄', tone: 'warning' });
  });

  it.each([
    null,
    [],
    {},
    { ...fixture(), mode: 'polling' },
    { ...fixture(), checked_at: '2026-02-31T12:00:00Z' },
    { ...fixture(), checked_at: '2026-09-13T11:50:00Z' },
    { ...fixture(), recovery: { ...fixture().recovery, last_status: 'private error' } },
    { ...fixture(), web: { ...fixture().web, sent_24h: 0.5 } },
    { ...fixture(), web: { ...fixture().web, overdue: 1 } },
    { ...fixture(), native: { ...fixture().native, enabled_devices: -1 } },
    { ...fixture(), admin: { ...fixture().admin, enabled_subscriptions: '1' } },
  ])('does not turn malformed or stale aggregates into healthy evidence: %j', async body => {
    const { item } = await check(body);
    expect(item).toMatchObject({ ok: false, healthState: 'unknown', detail: null });
    expect(getSystemStatusPresentation(item)).toMatchObject({ label: '狀態待確認', tone: 'limited' });
    expect(getServiceEvidenceFacts(item)).toEqual([]);
  });

  it('contains upstream failures without leaking SQL or implying successful delivery', async () => {
    const { item } = await check({ message: 'secret database details' }, 503);
    expect(item).toMatchObject({
      ok: false,
      healthState: 'unknown',
      error: '通知派送狀態暫時無法取得，請重新檢查。',
    });
    expect(JSON.stringify(item)).not.toContain('secret database');
  });
});
