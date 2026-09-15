import { beforeEach, expect, test, vi } from 'vitest';
import {
  fetchExploreList,
  fetchTianhengList,
  fetchTianyanList,
  fetchTiangongList,
} from '../matrix-algorithm-api';
import { resetReadCacheForTests } from '../read-cache';
import { updateAlgorithmCacheSession } from '../auth/algorithm-cache-scope';

const sdk = vi.hoisted(() => ({
  rpc: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  getSupabaseClient: () => ({
    rpc: sdk.rpc,
    auth: { getSession: sdk.getSession },
  }),
}));

vi.mock('../permission-settings', () => ({
  refreshPermissionSettings: vi.fn().mockResolvedValue({
    subscriptionPurchaseVisible: false,
    registeredMemberFreeAccess: true,
    revision: 1,
    updatedAt: '2026-09-15T00:00:00.000Z',
  }),
}));

beforeEach(() => {
  resetReadCacheForTests();
  updateAlgorithmCacheSession(null);
  sdk.getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
  sdk.rpc.mockReset().mockResolvedValue({
    data: {
      lottery: '今彩539',
      drawPeriod: '115000210',
      analysisVersion: 'guest-access-v1',
      status: 'complete',
      items: [],
      duplicateStats: [],
      total: 0,
    },
    error: null,
  });
});

test('未登入可直接讀取四套演算法的完整查詢', async () => {
  await expect(fetchExploreList({
    lottery: '今彩539',
    numberOrder: '依號碼由小到大排序',
    explorePeriods: 13,
    exploreDateOffset: 0,
    exploreRange: '完整範圍',
    ruleCount: 1,
    roadTypes: ['加減'],
    selectedStreaks: ['準9進10'],
    sameCode: false,
  })).resolves.toBeTruthy();

  await expect(fetchTianhengList({
    lottery: '今彩539',
    numberOrder: '依號碼由小到大排序',
    explorePeriods: 13,
    exploreDateOffset: 0,
    exploreRange: '完整範圍',
    ruleCount: 1,
    roadTypes: ['加減'],
    selectedStreaks: ['準9進10'],
    sameCode: false,
  })).resolves.toBeTruthy();

  await expect(fetchTianyanList({
    lottery: '今彩539',
    explorePeriods: 13,
    exploreRange: '完整範圍',
    numberOrder: '依號碼由小到大排序',
    exploreDateOffset: 0,
    selectedStreaks: ['準11進12'],
    sameCode: false,
  })).resolves.toBeTruthy();

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
  })).resolves.toBeTruthy();

  expect(sdk.rpc.mock.calls.map(([name]) => name)).toEqual([
    'matrix_explore_list',
    'matrix_tianheng_list',
    'matrix_tianyan_list',
    'matrix_tiangong_list',
  ]);
});
