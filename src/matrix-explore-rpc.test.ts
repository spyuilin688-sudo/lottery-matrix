vi.mock('./permission-settings', () => ({ refreshPermissionSettings: vi.fn(async () => ({ revision: 0 })) }));
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const getSession = vi.fn();

vi.mock('./lib/supabase', () => ({
  getSupabaseClient: () => ({ rpc, auth: { getSession } }),
}));

import {
  fetchExploreList,
  fetchExploreValidation,
  fetchTiangongList,
  fetchTiangongValidation,
  fetchTianyanList,
  fetchTianyanValidation,
} from './matrix-algorithm-api';

import { resetReadCacheForTests } from './read-cache';
import { updateAlgorithmCacheSession } from './auth/algorithm-cache-scope';

describe('Matrix exploration Supabase RPC', () => {
  beforeEach(() => {
    resetReadCacheForTests();
    updateAlgorithmCacheSession(null);
    rpc.mockReset();
    getSession.mockReset();
    getSession.mockResolvedValue({
      data: { session: { user: { id: 'rpc-test-user' }, access_token: 'rpc-test-session' } },
      error: null,
    });
  });

  it('calls the list RPC directly instead of an HTTP API URL', async () => {
    const request = {
      lottery: '今彩539' as const,
      numberOrder: '依號碼由小到大排序' as const,
      explorePeriods: 2 as const,
      exploreDateOffset: 0 as const,
      exploreRange: '標準範圍' as const,
      ruleCount: 1 as const,
      roadTypes: ['加減' as const],
      selectedStreaks: ['準4進5'],
      sameCode: false,
      predictionNumber: '27',
    };
    rpc.mockResolvedValue({ data: { kind: 'explore', items: [] }, error: null });

    await fetchExploreList(request);

    expect(rpc).toHaveBeenCalledWith('matrix_explore_list', { p_request: request });
  });

  it('reuses an unchanged exploration list during the current page session', async () => {
    const request = {
      lottery: '今彩539' as const,
      numberOrder: '依號碼由小到大排序' as const,
      explorePeriods: 7 as const,
      exploreDateOffset: 0 as const,
      exploreRange: '完整範圍' as const,
      ruleCount: 1 as const,
      roadTypes: ['合值' as const],
      selectedStreaks: ['準4進5'],
      sameCode: false,
    };
    rpc.mockResolvedValue({ data: { items: [], draw_period: '115000207', analysis_version: 'v8' }, error: null });

    await fetchExploreList(request);
    await fetchExploreList(request);

    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('calls the validation RPC with the selected item', async () => {
    const meta = {
      lottery: '今彩539' as const,
      drawPeriod: '115000207',
      analysisVersion: 'v2',
    };
    rpc.mockResolvedValue({ data: { kind: 'explore', itemId: 'row-1' }, error: null });

    await fetchExploreValidation(meta, 'row-1', {
      explorePeriods: 7,
      exploreRange: '完整範圍',
    });

    expect(rpc).toHaveBeenCalledWith('matrix_explore_validation', {
      p_request: {
        ...meta, itemId: 'row-1', explorePeriods: 7, exploreRange: '完整範圍',
      },
    });
  });

  it('maps a denied RPC to the existing frontend error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'FORBIDDEN' } });

    await expect(fetchExploreList({
      lottery: '今彩539',
      numberOrder: '依號碼由小到大排序',
      explorePeriods: 13,
      exploreDateOffset: 0,
      exploreRange: '標準範圍',
      ruleCount: 1,
      roadTypes: ['加減'],
      selectedStreaks: ['準4進5'],
      sameCode: false,
    })).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });

  it('maps an RPC function-permission error to login required', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied for function matrix_tiangong_list' },
    });

    await expect(fetchTiangongList({
      lottery: '今彩539',
      periodRange: 50,
      mode: 'two-stage',
      hitCondition: '準2進3',
      exploreDirections: ['固定'],
      firstStageDirections: ['固定'],
      firstRoadTypes: ['加減'],
      secondStageDirections: ['固定'],
      secondRoadTypes: ['加減'],
    })).rejects.toMatchObject({ code: 'AUTH_REQUIRED', status: 401 });
  });

  it('rejects an anonymous session before calling the RPC', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(fetchTianyanList({
      lottery: '今彩539', selectedStreaks: ['準5進6'], sameCode: false,
    })).rejects.toMatchObject({ code: 'AUTH_REQUIRED', status: 401 });

    expect(rpc).not.toHaveBeenCalled();
  });

  it('reads Tianyan results and validation from Supabase artifacts', async () => {
    rpc.mockResolvedValue({ data: { kind: 'tianyan', items: [] }, error: null });

    await fetchTianyanList({ lottery: '今彩539', selectedStreaks: ['準5進6'], sameCode: false });
    await fetchTianyanValidation({
      lottery: '今彩539', drawPeriod: '115000207', analysisVersion: 'v3',
    }, 'tianyan-1');

    expect(rpc.mock.calls).toEqual([
      ['matrix_tianyan_list', { p_request: { lottery: '今彩539', selectedStreaks: ['準5進6'], sameCode: false } }],
      ['matrix_tianyan_validation', { p_request: {
        lottery: '今彩539', drawPeriod: '115000207', analysisVersion: 'v3', itemId: 'tianyan-1',
      } }],
    ]);
  });

  it('reads Tiangong results and validation from Supabase artifacts', async () => {
    const request = {
      lottery: '今彩539' as const,
      periodRange: 50 as const,
      mode: 'two-stage' as const,
      hitCondition: '準2進3' as const,
      exploreDirections: ['固定' as const],
      firstStageDirections: ['固定' as const],
      firstRoadTypes: ['加減' as const],
    };
    rpc.mockResolvedValue({ data: { kind: 'tiangong', items: [] }, error: null });

    await fetchTiangongList(request);
    await fetchTiangongValidation({
      lottery: '今彩539', drawPeriod: '115000207', analysisVersion: 'v3',
    }, 'tiangong-1');

    expect(rpc.mock.calls).toEqual([
      ['matrix_tiangong_list', { p_request: request }],
      ['matrix_tiangong_validation', { p_request: {
        lottery: '今彩539', drawPeriod: '115000207', analysisVersion: 'v3', itemId: 'tiangong-1',
      } }],
    ]);
  });
});
