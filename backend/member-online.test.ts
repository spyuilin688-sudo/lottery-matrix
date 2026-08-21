import { describe, expect, it, vi } from 'vitest';
import { createMemberOnlineRpc, createMemberOnlineService } from './member-online';

describe('member online service', () => {
  it('starts and ends only the authenticated member session', async () => {
    const rpc = vi.fn(async (name: string) => name === 'record_member_online_start'
      ? [{ session_id: 'session-1' }]
      : [{ online_seconds: 125 }]);
    const service = createMemberOnlineService(rpc, () => new Date('2026-08-21T10:30:00Z'));

    await expect(service.start('member-1')).resolves.toEqual({ sessionId: 'session-1' });
    await expect(service.end('member-1', 'session-1')).resolves.toEqual({ onlineSeconds: 125 });
    expect(rpc).toHaveBeenNthCalledWith(1, 'record_member_online_start', {
      p_member_id: 'member-1', p_now: '2026-08-21T10:30:00.000Z',
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'record_member_online_end', {
      p_member_id: 'member-1', p_session_id: 'session-1', p_now: '2026-08-21T10:30:00.000Z',
    });
  });
});

describe('member online Supabase RPC', () => {
  it('uses the service role only on the backend RPC endpoint', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify([{ session_id: 's1' }]), {
      status: 200, headers: { 'content-type': 'application/json' },
    }));
    const rpc = createMemberOnlineRpc(async () => ({
      url: 'https://project.supabase.co', anonKey: 'anon', serviceRoleKey: 'service-secret',
    }), fetcher as typeof fetch);

    await rpc('record_member_online_start', { p_member_id: 'member-1' });

    expect(fetcher).toHaveBeenCalledWith(
      'https://project.supabase.co/rest/v1/rpc/record_member_online_start',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ apikey: 'service-secret', Authorization: 'Bearer service-secret' }),
        body: JSON.stringify({ p_member_id: 'member-1' }),
      }),
    );
  });
});
