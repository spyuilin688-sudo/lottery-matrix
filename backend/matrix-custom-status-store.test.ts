import { describe, expect, it, vi } from 'vitest';
import { createCustomStatusStore } from './matrix-custom-status-store';
import type { CustomStatusConfig } from './matrix-custom-status';

const supabase = { url: 'https://project.supabase.co', serviceRoleKey: 'service-key' };
const saved: CustomStatusConfig = {
  lottery: '今彩539', status: 'ACTIVE', explorePeriods: 13, exploreRange: '完整範圍',
  oneCodeGroups: [{ id: 'one', rows: [{ consecutive: '準4進5', roadType: '加減', numberOrder: '依號碼由小到大排序', sameCodeQuantity: 2 }] }],
  twoCodeGroups: [],
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('Supabase custom status store', () => {
  it('reads only the selected member records', async () => {
    const fetcher = vi.fn(async () => response([{ lottery: '今彩539', status: 'ACTIVE', config: saved }]));
    const store = createCustomStatusStore(() => supabase, fetcher as typeof fetch);
    await expect(store.list('member-1')).resolves.toEqual([saved]);
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toContain('member_id=eq.member-1');
    expect(init?.headers).toMatchObject({ apikey: 'service-key', Authorization: 'Bearer service-key' });
  });

  it('upserts by member, lottery and status without deleting other independent settings', async () => {
    const fetcher = vi.fn(async () => response([{ config: saved }], 201));
    const store = createCustomStatusStore(() => supabase, fetcher as typeof fetch);
    await expect(store.save('member-1', saved)).resolves.toEqual(saved);
    const [, init] = fetcher.mock.calls[0];
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ Prefer: 'resolution=merge-duplicates,return=representation' });
    expect(JSON.parse(String(init?.body))).toMatchObject({ member_id: 'member-1', lottery: '今彩539', status: 'ACTIVE', config: saved, updated_at: expect.any(String) });
  });

  it('resets only the selected lottery and status back to Chapter 15', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    const store = createCustomStatusStore(() => supabase, fetcher as typeof fetch);
    await expect(store.reset('member-1', '六合彩', 'CRITICAL')).resolves.toBeUndefined();
    const [url, init] = fetcher.mock.calls[0];
    expect(init?.method).toBe('DELETE');
    expect(String(url)).toContain('member_id=eq.member-1');
    expect(String(url)).toContain('lottery=eq.%E5%85%AD%E5%90%88%E5%BD%A9');
    expect(String(url)).toContain('status=eq.CRITICAL');
  });

  it('rejects failed Supabase writes', async () => {
    const store = createCustomStatusStore(() => supabase, async () => response({ message: 'failure' }, 500));
    await expect(store.save('member-1', saved)).rejects.toThrow('SUPABASE_CUSTOM_STATUS_SAVE_FAILED');
  });
});
