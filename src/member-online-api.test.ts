import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./lib/supabase', () => ({ getSupabaseClient: () => supabase }));

import { postMemberOnline } from './member-online-api';

beforeEach(() => supabase.rpc.mockReset());

describe('member online Supabase RPC', () => {
  it('starts and ends the authenticated member session without a member id from the browser', async () => {
    supabase.rpc
      .mockResolvedValueOnce({ data: { sessionId: 'session-id' }, error: null })
      .mockResolvedValueOnce({ data: { onlineSeconds: 12 }, error: null });

    await expect(postMemberOnline('/api/member-online/start', {})).resolves.toEqual({ sessionId: 'session-id' });
    await expect(postMemberOnline('/api/member-online/end', { sessionId: 'session-id' })).resolves.toEqual({ onlineSeconds: 12 });

    expect(supabase.rpc.mock.calls).toEqual([
      ['member_online_start'],
      ['member_online_end', { p_session_id: 'session-id' }],
    ]);
  });

  it('rejects unsupported member online paths locally', async () => {
    await expect(postMemberOnline('/api/member-online/delete', {})).rejects.toThrow('MEMBER_ONLINE_ROUTE_UNSUPPORTED');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
