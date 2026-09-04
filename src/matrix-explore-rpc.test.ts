import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchExploreList,
  fetchExploreValidation,
  fetchTianyanList,
  fetchTianyanValidation,
  fetchTiangongList,
  fetchTiangongValidation,
} from './matrix-algorithm-api';
import { getSupabaseClient } from './lib/supabase';

vi.mock('./lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock('./read-cache', () => ({
  readThroughCache: vi.fn((_key: string, _ttl: number, loader: () => unknown) => loader()),
  stableCacheKey: vi.fn((prefix: string) => prefix),
}));

const rpc = vi.fn();

beforeEach(() => {
  rpc.mockReset();
  vi.mocked(getSupabaseClient).mockReturnValue({ rpc } as never);
});

describe('matrix algorithm RPC client', () => {
  it('reads Explore results from Supabase RPC', async () => {
    rpc.mockResolvedValue({ data: { items: [] }, error: null });

    const request = {
      lottery: '今彩539' as const,
      numberOrder: '依號碼由小到大排序' as const,
      explorePeriods: 7 as const,
      exploreDateOffset: 0 as const,
      exploreRange: '完整範圍' as const,
      ruleCount: 2 as const,
      roadTypes: ['加減'] as const,
      selectedStreaks: ['準5進6'],
      sameCode: true,
    };

    await fetchExploreList(request);

    expect(rpc).toHaveBeenCalledWith('matrix_explore_list', { p_request: request });
  });

  it('reads Explore validation from Supabase RPC', async () => {
    rpc.mockResolvedValue({ data: { validation: {} }, error: null });

    await fetchExploreValidation({
      lottery: '今彩539', drawPeriod: '115000207', analysisVersion: 'v3',
    }, 'item-1', {
      explorePeriods: 7,
      exploreRange: '完整範圍',
    });

    expect(rpc).toHaveBeenCalledWith('matrix_explore_validation', { p_request: {
      lottery: '今彩539', drawPeriod: '115000207', analysisVersion: 'v3', itemId: 'item-1',
      explorePeriods: 7, exploreRange: '完整範圍',
    } });
  });

  it('maps Matrix result RPC errors to product API codes', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'FORBIDDEN' } });

    await expect(fetchExploreList({
      lottery: '今彩539', numberOrder: '依號碼由小到大排序', explorePeriods: 13,
      exploreDateOffset: 0, exploreRange: '完整範圍', ruleCount: 2,
      roadTypes: ['加減'], selectedStreaks: ['準5進6'], sameCode: false,
    })).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });

  it('maps analysis-not-ready errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'ANALYSIS_NOT_READY' } });

    await expect(fetchExploreList({
      lottery: '今彩539', numberOrder: '依號碼由小到大排序', explorePeriods: 2,
      exploreDateOffset: 0, exploreRange: '標準範圍', ruleCount: 1,
      roadTypes: ['拖牌'], selectedStreaks: ['準4進5'], sameCode: false,
    })).rejects.toMatchObject({ code: 'ANALYSIS_NOT_READY', status: 404 });
  });

  it('maps anonymous Supabase function-permission errors to login required', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied for function matrix_explore_list' },
    });

    await expect(fetchExploreList({
      lottery: '今彩539', numberOrder: '依號碼由小到大排序', explorePeriods: 2,
      exploreDateOffset: 0, exploreRange: '標準範圍', ruleCount: 1,
      roadTypes: ['拖牌'], selectedStreaks: ['準4進5'], sameCode: false,
    })).rejects.toMatchObject({ code: 'AUTH_REQUIRED', status: 401 });
  });

  it('maps an anonymous function-permission error to login required', async () => {
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
      exploreDirections: ['固定'] as const,
      firstStageDirections: ['固定'] as const,
      firstRoadTypes: ['加減'] as const,
      secondStageDirections: ['固定'] as const,
      secondRoadTypes: ['加減'] as const,
    };
    rpc.mockResolvedValue({ data: { kind: 'tiangong', items: [] }, error: null });

    await fetchTiangongList(request);
    await fetchTiangongValidation({
      lottery: '今彩539', drawPeriod: '115000207', analysisVersion: 'v4',
    }, 'tiangong-1');

    expect(rpc.mock.calls).toEqual([
      ['matrix_tiangong_list', { p_request: request }],
      ['matrix_tiangong_validation', { p_request: {
        lottery: '今彩539', drawPeriod: '115000207', analysisVersion: 'v4', itemId: 'tiangong-1',
      } }],
    ]);
  });
});
