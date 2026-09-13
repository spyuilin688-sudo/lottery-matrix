import { describe, expect, it, vi } from 'vitest';
import { createConnectionStatus } from './connection-status';
import { getServiceEvidenceFacts, getSystemStatusPresentation } from '../src/system-status';

const endpoint = 'https://db.test/rest/v1/rpc/admin_native_notification_health';
const fixture = () => ({
  checked_at: '2026-09-13T12:00:00Z', enabled_devices: 0,
  schedule: { enabled: true, every_minute: true, last_started_at: '2026-09-13T11:59:00Z', last_finished_at: '2026-09-13T11:59:01Z', last_status: 'succeeded' },
  deliveries: { pending: 0, processing: 0, overdue: 0, sent_24h: 0, failed_24h: 0, canceled_24h: 0, last_sent_at: '2026-09-09T21:30:00Z', last_failed_at: '2026-09-10T00:30:00Z' },
});
const check = async (body: unknown, httpStatus = 200) => {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => Response.json(String(input) === endpoint ? body : [], { status: String(input) === endpoint ? httpStatus : 200 }));
  const result = await createConnectionStatus({
    supabase: { selectRows: async () => [] },
    loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'server-secret' }),
    getWorkerStatus: async () => ({ ok: false, reason: 'APPDEPLOY_CONFIG_MISSING', health: null, jobs: null }),
    now: () => new Date('2026-09-13T12:00:00Z'), fetcher, requestTimeoutMs: 25,
  }).get();
  const item = result.items.find(value => value.id === 'native-notification-dispatch');
  expect(item, 'the active native dispatcher must have a monitored row').toBeDefined();
  return { item: item!, fetcher };
};

describe('native notification read-only monitoring', () => {
  it('reports zero enabled devices as idle and reads aggregates without invoking the dispatcher', async () => {
    const { item, fetcher } = await check({ ...fixture(), token: 'must-not-leak', schedule: { ...fixture().schedule, command: 'private-command' } });
    expect(item).toMatchObject({ ok: true, healthState: 'waiting', checkMode: 'service', checkEvidence: 'reported', detail: fixture() });
    expect(fetcher.mock.calls.filter(([url]) => String(url) === endpoint)).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith(endpoint, expect.objectContaining({ method: 'GET', cache: 'no-store', redirect: 'error', headers: { apikey: 'server-secret', Authorization: 'Bearer server-secret' } }));
    expect(fetcher.mock.calls.some(([url]) => /native_notification_(claim|prepare|finalize)|functions\/v1\/native/.test(String(url)))).toBe(false);
    expect(JSON.stringify(item)).not.toMatch(/server-secret|must-not-leak|private-command/);
    expect(getSystemStatusPresentation(item)).toMatchObject({ label: '待命（無啟用裝置）', tone: 'limited', scope: expect.stringContaining('尚未驗證') });
  });

  it('keeps old failures factual without presenting them as a current outage or proving delivery from cron', async () => {
    const { item } = await check({ ...fixture(), enabled_devices: 1 });
    expect(item).toMatchObject({ ok: true, healthState: 'healthy' });
    expect(getSystemStatusPresentation(item)).toMatchObject({ label: '排程紀錄正常', tone: 'limited', scope: expect.stringContaining('排程') });
    expect(getServiceEvidenceFacts(item)).toEqual(expect.arrayContaining([
      { label: '啟用裝置數', value: '1' },
      { label: '24 小時內派送成功', value: '0' },
      { label: '24 小時內派送失敗', value: '0' },
      { label: '最近派送成功', value: '2026-09-09T21:30:00Z', format: 'date' },
      { label: '最近派送失敗', value: '2026-09-10T00:30:00Z', format: 'date' },
      { label: '驗證範圍', value: expect.stringContaining('OAuth、FCM') },
    ]));
  });

  it.each([
    ['disabled schedule', { schedule: { ...fixture().schedule, enabled: false } }],
    ['unexpected schedule', { schedule: { ...fixture().schedule, every_minute: false } }],
    ['failed cron', { schedule: { ...fixture().schedule, last_status: 'failed' } }],
    ['stale cron', { schedule: { ...fixture().schedule, last_started_at: '2026-09-13T11:53:00Z', last_finished_at: '2026-09-13T11:53:01Z' } }],
    ['no cron run', { schedule: { ...fixture().schedule, last_started_at: null, last_finished_at: null, last_status: null } }],
    ['overdue queue', { deliveries: { ...fixture().deliveries, pending: 1, overdue: 1 } }],
    ['recent failure', { deliveries: { ...fixture().deliveries, failed_24h: 1, last_failed_at: '2026-09-13T11:45:00Z' } }],
  ])('shows %s as a specific warning', async (_name, changes) => {
    const { item } = await check({ ...fixture(), ...changes });
    expect(item).toMatchObject({ ok: false, healthState: 'failed', error: expect.any(String) });
    expect(getSystemStatusPresentation(item)).toMatchObject({ label: '需查看紀錄', tone: 'warning' });
  });

  it.each([
    null, [], {}, { ...fixture(), enabled_devices: -1 }, { ...fixture(), enabled_devices: '1' },
    { ...fixture(), checked_at: '2026-02-31T12:00:00Z' }, { ...fixture(), checked_at: '2026-09-13T11:50:00Z' },
    { ...fixture(), checked_at: '2026-09-13T12:02:00Z' },
    { ...fixture(), schedule: { ...fixture().schedule, last_status: 'private error' } },
    { ...fixture(), schedule: { ...fixture().schedule, last_status: ['succeeded'] } },
    { ...fixture(), schedule: { ...fixture().schedule, last_finished_at: '2026-09-14T12:00:00Z' } },
    { ...fixture(), deliveries: { ...fixture().deliveries, sent_24h: 0.5 } },
    { ...fixture(), deliveries: { ...fixture().deliveries, overdue: 1 } },
    { ...fixture(), deliveries: { ...fixture().deliveries, sent_24h: 1, last_sent_at: null } },
  ])('does not turn invalid or stale aggregates into healthy evidence: %j', async body => {
    const { item } = await check(body);
    expect(item).toMatchObject({ ok: false, healthState: 'unknown', detail: null });
    expect(getSystemStatusPresentation(item)).toMatchObject({ label: '狀態待確認', tone: 'limited' });
    expect(getServiceEvidenceFacts(item)).toEqual([]);
  });

  it('contains upstream failures without leaking SQL or implying successful delivery', async () => {
    const { item } = await check({ message: 'secret database details' }, 503);
    expect(item).toMatchObject({ ok: false, healthState: 'unknown', error: '原生通知狀態暫時無法取得，請重新檢查。' });
    expect(JSON.stringify(item)).not.toContain('secret database');
  });
});
