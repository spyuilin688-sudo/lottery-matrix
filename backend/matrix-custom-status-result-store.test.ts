import { describe, expect, it } from 'vitest';
import { createCustomStatusResultStore } from './matrix-custom-status-result-store';

describe('Matrix custom status result store', () => {
  it('rejects a stale reset when configurations have appeared', async () => {
    const store = createCustomStatusResultStore(
      () => ({ url: 'https://example.supabase.co', serviceRoleKey: 'test' }),
      async () => new Response('false'),
    );
    await expect(store.reset('member-1', '今彩539')).rejects.toThrow('CUSTOM_STATUS_SUPERSEDED');
  });
  it('requires atomic publication acknowledgement', async () => {
    const fetcher: typeof fetch = async () => new Response('true', { status: 200 });
    const store = createCustomStatusResultStore(
      () => ({
        url: 'https://example.supabase.co',
        serviceRoleKey: 'service-role-key',
      }),
      fetcher,
      () => new Date('2026-09-18T00:00:00.000Z'),
    );

    await expect(store.save('member-1', '今彩539', {
      analysisVersion: 'v1',
      drawPeriod: '115000001',
      configKey: 'config-key',
      standardPayload: { status: 'ok' },
      compositePayload: { status: 'ok' },
    })).resolves.toBeUndefined();
  });
});
