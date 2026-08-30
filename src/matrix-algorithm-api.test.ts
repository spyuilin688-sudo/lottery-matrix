import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('./lib/supabase', () => ({ getSupabaseClient: () => ({ rpc }) }));

import { fetchExploreList, fetchExploreValidation } from './matrix-algorithm-api';

beforeEach(() => {
  rpc.mockReset();
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
});
