import { describe, expect, it, vi } from 'vitest';
import { createConnectionStatus } from './connection-status';

const lotteries = ['今彩539', '天天樂', '六合彩', '大樂透'];
const samples = lotteries.map(lottery => ({ lottery, period: '123', analysis_version: '123:v15-sorted', records: 2, list_ok: true, validation_ok: true }));
const rpcNames = ['matrix_tianyan_list', 'matrix_tianyan_validation', 'matrix_tiangong_list', 'matrix_tiangong_validation', 'member_profile', 'notification_dispatch_mark_skipped', 'notification_dispatch_mark_failed', 'release_matrix_watchdog_lease'];
function status(overrides: Record<string, unknown> = {}) {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const name = new URL(String(input)).pathname.split('/').at(-1)!;
    const value = name in overrides ? overrides[name] : name === 'admin_api_registry' ? rpcNames.map(rpc_name => ({ rpc_name }))
      : name === 'admin_matrix_result_probe' ? samples
        : name === 'matrix_permission_settings' ? { subscriptionPurchaseVisible: true, registeredMemberFreeAccess: false, revision: 2, updatedAt: '2026-09-13T10:00:00Z' }
          : name === 'admin_service_operation_evidence' ? [
            { rpc_name: 'notification_dispatch_mark_skipped', observed_at: '2026-09-13T10:00:00Z' },
            { rpc_name: 'notification_dispatch_mark_failed', observed_at: null },
          ] : {};
    return Response.json(value);
  });
  return { fetcher, service: createConnectionStatus({
    supabase: { selectRows: async () => [] }, loadConfig: async () => ({ url: 'https://db.test', serviceRoleKey: 'server-secret' }),
    getWorkerStatus: async () => ({ ok: false, reason: 'APPDEPLOY_CONFIG_MISSING', health: null, jobs: null }),
    fetcher, now: () => new Date('2026-09-13T10:05:00Z'), requestTimeoutMs: 100,
  }) };
}
const item = (items: any[], rpc: string) => items.find(i => i.id === `supabase-rpc-${rpc}`);

describe('admin service evidence', () => {
  it('actually reads permission settings once and never calls their update operation', async () => {
    const { service, fetcher } = status();
    const { items } = await service.get();
    expect(item(items, 'matrix_permission_settings')).toMatchObject({ ok: true, checkEvidence: 'query', detail: { revision: 2 } });
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/matrix_permission_settings'))).toHaveLength(1);
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/admin_matrix_permission_settings_update'))).toBe(false);
  });
  it('rejects malformed permission settings instead of accepting registry existence', async () => {
    const { items } = await status({ matrix_permission_settings: { revision: 2 } }).service.get();
    expect(item(items, 'matrix_permission_settings')).toMatchObject({ ok: false, checkEvidence: 'query' });
  });
  it('checks protected result data without impersonating a member or claiming member RPC execution', async () => {
    const { service, fetcher } = status();
    const { items } = await service.get();
    expect(item(items, 'matrix_tianyan_list')).toMatchObject({ ok: true, checkEvidence: 'data', detail: { samples: expect.any(Array) } });
    expect(item(items, 'matrix_tiangong_validation')).toMatchObject({ ok: true, checkEvidence: 'data' });
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('admin_matrix_result_probe'))).toHaveLength(2);
    expect(fetcher.mock.calls.some(([url]) => /\/matrix_(tianyan|tiangong)_(list|validation)$/.test(String(url)))).toBe(false);
    expect(JSON.stringify(items)).not.toContain('server-secret');
  });
  it('does not hide a missing lottery or invalid validation behind healthy data samples', async () => {
    const { items } = await status({ admin_matrix_result_probe: samples.slice(1) }).service.get();
    expect(item(items, 'matrix_tianyan_list').ok).toBe(false);
    const broken = await status({ admin_matrix_result_probe: samples.map((sample, i) => ({ ...sample, validation_ok: i > 0 })) }).service.get();
    expect(item(broken.items, 'matrix_tianyan_list').ok).toBe(true);
    expect(item(broken.items, 'matrix_tianyan_validation').ok).toBe(false);
  });
  it('keeps empty analysis validation explicitly untested', async () => {
    const { items } = await status({ admin_matrix_result_probe: samples.map(sample => ({ ...sample, records: 0, validation_ok: null })) }).service.get();
    expect(item(items, 'matrix_tianyan_validation')).toMatchObject({ ok: true, checkEvidence: 'no-sample', detail: { probe: 'data' } });
  });
  it('uses shared historical evidence without treating skips, missing activity or unrecorded operations as outages', async () => {
    const { service, fetcher } = status();
    const { items } = await service.get();
    expect(item(items, 'notification_dispatch_mark_skipped')).toMatchObject({ ok: true, checkEvidence: 'registered', detail: { activity: { state: 'recorded', observedAt: '2026-09-13T10:00:00Z' } } });
    expect(item(items, 'notification_dispatch_mark_failed')).toMatchObject({ ok: true, detail: { activity: { state: 'none' } } });
    expect(item(items, 'release_matrix_watchdog_lease')).toMatchObject({ ok: true, detail: { activity: { state: 'not-recorded' } } });
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('admin_service_operation_evidence'))).toHaveLength(1);
    expect(fetcher.mock.calls.some(([url]) => /\/(notification_dispatch_|release_matrix_watchdog_lease)/.test(String(url)))).toBe(false);
  });
  it('does not turn unavailable evidence into a claim that no operations occurred', async () => {
    const { items } = await status({ admin_service_operation_evidence: {} }).service.get();
    expect(item(items, 'notification_dispatch_mark_skipped')).toMatchObject({ detail: { registered: true, activity: { state: 'unavailable' } } });
  });
});
