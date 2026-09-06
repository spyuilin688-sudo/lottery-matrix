import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const getSession = vi.fn();
vi.mock('./lib/supabase', () => ({ getSupabaseClient: () => ({ rpc, auth: { getSession } }) }));

import { invalidateMatrixData } from './matrix-data-revision';
import { updateAlgorithmCacheSession } from './auth/algorithm-cache-scope';
import { resetReadCacheForTests } from './read-cache';

import { fetchExploreList, fetchExploreValidation } from './matrix-algorithm-api';

beforeEach(() => {
  rpc.mockReset();
  resetReadCacheForTests();
  getSession.mockResolvedValue({ data: { session: { user: { id: 'account-a' }, access_token: 'session-a' } }, error: null });
});

describe('Matrix Explore Supabase RPC mapping', () => {
  it('maps list metadata and duplicate stats from RPC snake_case fields', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        ok: true,
        lottery: '今彩539',
        draw_period: '115000210',
        analysis_version: '115000210:matrix-python-v6',
        total: 2,
        items: [],
        duplicate_stats: [{ number: '15', count: 2 }],
      },
      error: null,
    });

    const result = await fetchExploreList({
      lottery: '今彩539',
      numberOrder: '依號碼由小到大排序',
      explorePeriods: 2,
      exploreDateOffset: 0,
      exploreRange: '標準範圍',
      ruleCount: 1,
      roadTypes: ['加減'],
      selectedStreaks: ['準4進5'],
      sameCode: true,
    });

    expect(result.drawPeriod).toBe('115000210');
    expect(result.analysisVersion).toBe('115000210:matrix-python-v6');
    expect(result.duplicateStats).toEqual([{ number: '15', count: 2 }]);
  });

  it('maps validation metadata from RPC snake_case fields', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        ok: true,
        lottery: '今彩539',
        draw_period: '115000210',
        analysis_version: '115000210:matrix-python-v6',
        item_id: 'item-1',
        validation: { itemId: 'item-1', ruleSets: [] },
      },
      error: null,
    });

    const result = await fetchExploreValidation(
      {
        lottery: '今彩539',
        drawPeriod: '115000210',
        analysisVersion: '115000210:matrix-python-v6',
      },
      'item-1',
      { explorePeriods: 2, exploreRange: '標準範圍' },
    );

    expect(result.drawPeriod).toBe('115000210');
    expect(result.analysisVersion).toBe('115000210:matrix-python-v6');
    expect(result.itemId).toBe('item-1');
    expect(result.validation).toEqual({ itemId: 'item-1', ruleSets: [] });
  });

  it('preserves list metadata returned in the RPC camelCase contract', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        kind: 'explore',
        lottery: '今彩539',
        drawPeriod: '115000212',
        analysisVersion: '115000212:matrix-python-v12',
        status: 'complete',
        total: 0,
        items: [],
        duplicateStats: [],
      },
      error: null,
    });

    const result = await fetchExploreList({
      lottery: '今彩539',
      numberOrder: '依號碼由小到大排序',
      explorePeriods: 2,
      exploreDateOffset: 0,
      exploreRange: '標準範圍',
      ruleCount: 1,
      roadTypes: ['加減'],
      selectedStreaks: ['準4進5'],
      sameCode: false,
    });

    expect(result.drawPeriod).toBe('115000212');
    expect(result.analysisVersion).toBe('115000212:matrix-python-v12');
  });

  it('preserves validation metadata returned in the RPC camelCase contract', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        kind: 'explore',
        lottery: '今彩539',
        drawPeriod: '115000212',
        analysisVersion: '115000212:matrix-python-v12',
        status: 'complete',
        itemId: 'item-v12',
        validation: { itemId: 'item-v12', ruleSets: [] },
      },
      error: null,
    });

    const result = await fetchExploreValidation(
      {
        lottery: '今彩539',
        drawPeriod: '115000212',
        analysisVersion: '115000212:matrix-python-v12',
      },
      'item-v12',
      { explorePeriods: 2, exploreRange: '標準範圍' },
    );

    expect(result.drawPeriod).toBe('115000212');
    expect(result.analysisVersion).toBe('115000212:matrix-python-v12');
    expect(result.itemId).toBe('item-v12');
  });
});

const accountRequest = {
  lottery: '今彩539' as const, numberOrder: '依號碼由小到大排序' as const,
  explorePeriods: 2 as const, exploreDateOffset: 0 as const, exploreRange: '標準範圍' as const,
  ruleCount: 1 as const, roadTypes: ['加減' as const], selectedStreaks: [], sameCode: false,
};

describe('authenticated algorithm cache', () => {
  it('reuses results only within the same account session', async () => {
    rpc.mockResolvedValueOnce({ data: { lottery: '今彩539', total: 1 }, error: null })
      .mockResolvedValueOnce({ data: { lottery: '今彩539', total: 2 }, error: null });
    expect((await fetchExploreList(accountRequest)).total).toBe(1);
    expect((await fetchExploreList(accountRequest)).total).toBe(1);
    getSession.mockResolvedValue({ data: { session: { user: { id: 'account-b' }, access_token: 'session-b' } }, error: null });
    expect((await fetchExploreList(accountRequest)).total).toBe(2);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('cannot serve a cached authenticated result after logout', async () => {
    rpc.mockResolvedValue({ data: { lottery: '今彩539', total: 1 }, error: null });
    await fetchExploreList(accountRequest);
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(fetchExploreList(accountRequest)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('rejects an old account response when the session switches during the request', async () => {
    let finish!: (value: unknown) => void;
    rpc.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const oldRequest = fetchExploreList(accountRequest);
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    getSession.mockResolvedValue({ data: { session: { user: { id: 'account-b' }, access_token: 'session-b' } }, error: null });
    rpc.mockResolvedValueOnce({ data: { lottery: '今彩539', total: 2 }, error: null });
    expect((await fetchExploreList(accountRequest)).total).toBe(2);
    finish({ data: { lottery: '今彩539', total: 1 }, error: null });
    await expect(oldRequest).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect((await fetchExploreList(accountRequest)).total).toBe(2);
  });
});

describe('algorithm cache auth events', () => {
  it('clears an account cache even when the same account signs back in', async () => {
    rpc.mockResolvedValueOnce({ data: { lottery: '今彩539', total: 1 }, error: null })
      .mockResolvedValueOnce({ data: { lottery: '今彩539', total: 2 }, error: null });
    await fetchExploreList(accountRequest);
    updateAlgorithmCacheSession(null);
    updateAlgorithmCacheSession({ user: { id: 'account-a' }, access_token: 'session-a' } as never);
    expect((await fetchExploreList(accountRequest)).total).toBe(2);
  });

  it('does not restore a session from a lookup started before logout', async () => {
    rpc.mockResolvedValue({ data: { lottery: '今彩539', total: 1 }, error: null });
    await fetchExploreList(accountRequest);
    let finish!: (value: unknown) => void;
    getSession.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = fetchExploreList(accountRequest);
    updateAlgorithmCacheSession(null);
    finish({ data: { session: { user: { id: 'account-a' }, access_token: 'session-a' } }, error: null });
    await expect(pending).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('retains a cached result across token refresh within the same logical session', async () => {
    const session = (version: number) => ({
      user: { id: 'account-a' },
      access_token: `header.${btoa(JSON.stringify({ session_id: 'logical-a', version }))}.signature`,
    });
    getSession.mockResolvedValue({ data: { session: session(1) }, error: null });
    rpc.mockResolvedValue({ data: { lottery: '今彩539', total: 1 }, error: null });
    await fetchExploreList(accountRequest);
    updateAlgorithmCacheSession(session(2) as never);
    getSession.mockResolvedValue({ data: { session: session(2) }, error: null });
    await fetchExploreList(accountRequest);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe('algorithm data revision', () => {
  it('rejects an in-flight RPC result invalidated by changed lottery data', async () => {
    let finish!: (value: unknown) => void;
    rpc.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = fetchExploreList(accountRequest);
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    invalidateMatrixData();
    rpc.mockResolvedValueOnce({ data: { lottery: '今彩539', total: 2 }, error: null });
    expect((await fetchExploreList(accountRequest)).total).toBe(2);
    finish({ data: { lottery: '今彩539', total: 1 }, error: null });
    await expect(pending).rejects.toMatchObject({ code: 'ANALYSIS_VERSION_MISMATCH' });
    expect((await fetchExploreList(accountRequest)).total).toBe(2);
  });

  it('rejects a cache hit invalidated during the final session verification', async () => {
    const auth = { data: { session: { user: { id: 'account-a' }, access_token: 'session-a' } }, error: null };
    rpc.mockResolvedValue({ data: { lottery: '今彩539', total: 1 }, error: null });
    await fetchExploreList(accountRequest);
    let finish!: (value: unknown) => void;
    getSession.mockResolvedValueOnce(auth)
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const cached = fetchExploreList(accountRequest);
    await vi.waitFor(() => expect(finish).toBeDefined());
    invalidateMatrixData();
    finish(auth);
    await expect(cached).rejects.toMatchObject({ code: 'ANALYSIS_VERSION_MISMATCH' });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
