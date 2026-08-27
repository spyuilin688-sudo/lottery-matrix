import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('./lib/supabase', () => ({
  getSupabaseClient: () => ({ rpc }),
}));

import { fetchExploreList, fetchExploreValidation } from './matrix-algorithm-api';

describe('Matrix exploration Supabase RPC', () => {
  beforeEach(() => rpc.mockReset());

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
    };
    rpc.mockResolvedValue({ data: { kind: 'explore', items: [] }, error: null });

    await fetchExploreList(request);

    expect(rpc).toHaveBeenCalledWith('matrix_explore_list', { p_request: request });
  });

  it('calls the validation RPC with the selected item', async () => {
    const meta = {
      lottery: '今彩539' as const,
      drawPeriod: '115000207',
      analysisVersion: 'v2',
    };
    rpc.mockResolvedValue({ data: { kind: 'explore', itemId: 'row-1' }, error: null });

    await fetchExploreValidation(meta, 'row-1');

    expect(rpc).toHaveBeenCalledWith('matrix_explore_validation', {
      p_request: { ...meta, itemId: 'row-1' },
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
});
