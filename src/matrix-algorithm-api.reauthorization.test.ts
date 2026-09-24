import { beforeEach, describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({
  getSession: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('./lib/supabase', () => ({ getSupabaseClient: () => ({
  rpc: boundary.rpc,
  auth: { getSession: boundary.getSession },
}) }));
vi.mock('./permission-settings', () => ({ readPermissionSettings: vi.fn(async () => ({ revision: 1 })) }));

import { updateAlgorithmCacheSession } from './auth/algorithm-cache-scope';
import { fetchExploreList, fetchTianhengList, fetchTianshuList, fetchTianyanList, fetchTiangongList } from './matrix-algorithm-api';
import { getMatrixDataRevision } from './matrix-data-revision';
import { resetReadCacheForTests } from './read-cache';

const access = () => ({
  canUseSeven: true,
  canUseThirteen: true,
  canUseFullRange: true,
  canUseTianyan: true,
  canUseTiangong: true,
  canViewFullStatus: true,
});

const commonRequest = {
  lottery: '今彩539' as const,
  numberOrder: '依號碼由小到大排序' as const,
  exploreDateOffset: 0 as const,
  exploreRange: '標準範圍' as const,
  ruleCount: 1 as const,
  roadTypes: ['加減' as const],
  selectedStreaks: ['準4進5'],
  sameCode: false,
};

beforeEach(() => {
  resetReadCacheForTests();
  updateAlgorithmCacheSession(null);
  boundary.getSession.mockReset().mockResolvedValue({
    data: { session: { user: { id: 'member-a' }, access_token: 'session-a' } },
    error: null,
  });
  boundary.rpc.mockReset();
});

describe('authoritative Matrix list cache authorization', () => {
  it.each([
    ['探索二期', () => fetchExploreList({ ...commonRequest, explorePeriods: 2 as const })],
    ['天衡三期', () => fetchTianhengList({ ...commonRequest, explorePeriods: 3 as const })],
  ])('does not recheck public %s cache hits for a verified guest', async (_name, fetchList) => {
    boundary.getSession.mockResolvedValue({ data: { session: null }, error: null });
    boundary.rpc.mockImplementation(async (name: string) => name === 'matrix_status_entitlements'
      ? { data: null, error: { code: '42501', message: 'FORBIDDEN' } }
      : { data: { lottery: '今彩539', total: 1, items: [], duplicateStats: [] }, error: null });

    expect((await fetchList()).total).toBe(1);
    expect((await fetchList()).total).toBe(1);
    expect(boundary.rpc).toHaveBeenCalledTimes(1);
  });

  it('still checks a signed-in member on a cached public list', async () => {
    let disabled = false;
    boundary.rpc.mockImplementation(async (name: string) => name === 'matrix_status_entitlements'
      ? disabled ? { data: null, error: { code: '42501', message: 'FORBIDDEN' } } : { data: access(), error: null }
      : { data: { lottery: '今彩539', total: 1, items: [], duplicateStats: [] }, error: null });
    const request = { ...commonRequest, explorePeriods: 2 as const };
    await fetchExploreList(request);
    disabled = true;

    await expect(fetchExploreList(request)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(boundary.rpc.mock.calls.map(([name]) => name)).toEqual(['matrix_explore_list', 'matrix_status_entitlements']);
  });

  it('does not treat a guest full-range list as public, even at two periods', async () => {
    boundary.getSession.mockResolvedValue({ data: { session: null }, error: null });
    boundary.rpc.mockImplementation(async (name: string) => name === 'matrix_status_entitlements'
      ? { data: null, error: { code: '42501', message: 'FORBIDDEN' } }
      : { data: { lottery: '今彩539', total: 1, items: [], duplicateStats: [] }, error: null });
    const request = { ...commonRequest, explorePeriods: 2 as const, exploreRange: '完整範圍' as const };
    await fetchExploreList(request);

    await expect(fetchExploreList(request)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(boundary.rpc.mock.calls.map(([name]) => name)).toEqual(['matrix_explore_list', 'matrix_status_entitlements']);
  });

  const cases = [
    ['探索', () => fetchExploreList({ ...commonRequest, explorePeriods: 13 as const })],
    ['天衡', () => fetchTianhengList({ ...commonRequest, explorePeriods: 13 as const })],
    ['天樞', () => fetchTianshuList({ ...commonRequest, explorePeriods: 13 as const })],
    ['天衍', () => fetchTianyanList({ lottery: '今彩539', selectedStreaks: [], sameCode: false })],
    ['天工', () => fetchTiangongList({
      lottery: '今彩539', periodRange: 50, mode: 'two-stage', hitCondition: '準2進3',
      exploreDirections: ['固定'], firstStageDirections: ['固定'], firstRoadTypes: ['加減'],
      secondStageDirections: ['固定'], secondRoadTypes: ['加減'],
    })],
  ] as const;

  it.each(cases)('cannot return a cached %s list after the same session is disabled', async (_name, fetchList) => {
    let disabled = false;
    boundary.rpc.mockImplementation(async (name: string) => {
      if (name === 'matrix_status_entitlements') return disabled
        ? { data: null, error: { code: '42501', message: 'FORBIDDEN' } }
        : { data: access(), error: null };
      return { data: { lottery: '今彩539', total: 1, items: [], duplicateStats: [] }, error: null };
    });

    expect((await fetchList()).total).toBe(1);
    expect(boundary.rpc.mock.calls.filter(([name]) => name !== 'matrix_status_entitlements')).toHaveLength(1);
    disabled = true;

    await expect(fetchList()).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
    expect(boundary.rpc.mock.calls.filter(([name]) => name !== 'matrix_status_entitlements')).toHaveLength(1);
    expect(boundary.rpc.mock.calls.filter(([name]) => name === 'matrix_status_entitlements')).toHaveLength(1);
  });

  it('denies a cached thirteen-period list when entitlement expires, even while settings revision is unchanged', async () => {
    let canUseThirteen = true;
    boundary.rpc.mockImplementation(async (name: string) => name === 'matrix_status_entitlements'
      ? { data: { ...access(), canUseThirteen }, error: null }
      : { data: { lottery: '今彩539', total: 1, items: [], duplicateStats: [] }, error: null });
    const request = { ...commonRequest, explorePeriods: 13 as const };
    await fetchExploreList(request);
    canUseThirteen = false;

    await expect(fetchExploreList(request)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it.each([
    ['探索七期', 'canUseSeven', () => fetchExploreList({ ...commonRequest, explorePeriods: 7 as const })],
    ['探索完整範圍', 'canUseFullRange', () => fetchExploreList({ ...commonRequest, explorePeriods: 2 as const, exploreRange: '完整範圍' as const })],
    ['天衡十三期', 'canUseThirteen', () => fetchTianhengList({ ...commonRequest, explorePeriods: 13 as const })],
    ['天樞十三期', 'canUseThirteen', () => fetchTianshuList({ ...commonRequest, explorePeriods: 13 as const })],
    ['天衍', 'canUseTianyan', () => fetchTianyanList({ lottery: '今彩539', selectedStreaks: [], sameCode: false })],
    ['天工', 'canUseTiangong', () => fetchTiangongList({
      lottery: '今彩539', periodRange: 50, mode: 'two-stage', hitCondition: '準2進3',
      exploreDirections: ['固定'], firstStageDirections: ['固定'], firstRoadTypes: ['加減'],
      secondStageDirections: ['固定'], secondRoadTypes: ['加減'],
    })],
  ] as const)('rejects cached %s results when their actual server entitlement is withdrawn', async (_name, entitlement, fetchList) => {
    let allowed = true;
    boundary.rpc.mockImplementation(async (name: string) => name === 'matrix_status_entitlements'
      ? { data: { ...access(), [entitlement]: allowed }, error: null }
      : { data: { lottery: '今彩539', total: 1, items: [], duplicateStats: [] }, error: null });
    await fetchList();
    allowed = false;

    await expect(fetchList()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('does not return cached results on an unavailable authorization service, then reloads from the server', async () => {
    let unavailable = false;
    let listTotal = 1;
    boundary.rpc.mockImplementation(async (name: string) => name === 'matrix_status_entitlements'
      ? unavailable ? { data: null, error: { message: 'offline' } } : { data: access(), error: null }
      : { data: { lottery: '今彩539', total: listTotal, items: [], duplicateStats: [] }, error: null });
    const request = { ...commonRequest, explorePeriods: 13 as const };
    await fetchExploreList(request);
    const revision = getMatrixDataRevision();
    unavailable = true;

    await expect(fetchExploreList(request)).rejects.toMatchObject({ code: 'API_ERROR' });
    expect(getMatrixDataRevision()).toBeGreaterThan(revision);
    unavailable = false;
    listTotal = 2;
    expect((await fetchExploreList(request)).total).toBe(2);
  });

  it('rejects a cached response if logout races with its authorization check', async () => {
    let release!: (value: unknown) => void;
    boundary.rpc.mockImplementation((name: string) => name === 'matrix_status_entitlements'
      ? new Promise(resolve => { release = resolve; })
      : Promise.resolve({ data: { lottery: '今彩539', total: 1, items: [], duplicateStats: [] }, error: null }));
    const request = { ...commonRequest, explorePeriods: 13 as const };
    await fetchExploreList(request);
    const pending = fetchExploreList(request);
    await vi.waitFor(() => expect(boundary.rpc.mock.calls.some(([name]) => name === 'matrix_status_entitlements')).toBe(true));
    updateAlgorithmCacheSession(null);
    release({ data: access(), error: null });

    await expect(pending).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });
});
