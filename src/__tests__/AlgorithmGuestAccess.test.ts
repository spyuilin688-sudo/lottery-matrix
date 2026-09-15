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

const response = {
  lottery: '今彩539',
  drawPeriod: '115000210',
  analysisVersion: 'registered-access-v1',
  status: 'complete',
  items: [],
  duplicateStats: [],
  total: 0,
};

beforeEach(() => {
  resetReadCacheForTests();
  updateAlgorithmCacheSession(null);
  sdk.getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
  sdk.rpc.mockReset().mockResolvedValue({ data: response, error: null });
});

test('未登入只保留探索二期基本查詢', async () => {
  await expect(fetchExploreList({
    lottery: '今彩539',
    numberOrder: '依號碼由小到大排序',
    explorePeriods: 2,
    exploreDateOffset: 0,
    exploreRange: '標準範圍',
    ruleCount: 1,
    roadTypes: ['加減'],
    selectedStreaks: ['準5進6'],
    sameCode: false,
  })).resolves.toBeTruthy();

  expect(sdk.rpc.mock.calls.map(([name]) => name)).toEqual([
    'matrix_explore_list',
  ]);
});

test('未登入不能使用天衡三期', async () => {
  await expect(fetchTianhengList({
    lottery: '今彩539',
    numberOrder: '依號碼由小到大排序',
    explorePeriods: 3,
    exploreDateOffset: 0,
    exploreRange: '標準範圍',
    ruleCount: 1,
    roadTypes: ['加減'],
    selectedStreaks: ['準5進6'],
    sameCode: false,
  })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });

  expect(sdk.rpc).not.toHaveBeenCalled();
});

test('未登入即使免費會員開關開啟也不能直接使用探索七期與十三期', async () => {
  for (const explorePeriods of [7, 13] as const) {
    await expect(fetchExploreList({
      lottery: '今彩539',
      numberOrder: '依號碼由小到大排序',
      explorePeriods,
      exploreDateOffset: 0,
      exploreRange: '標準範圍',
      ruleCount: 1,
      roadTypes: ['加減'],
      selectedStreaks: ['準5進6'],
      sameCode: false,
    })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  }
  expect(sdk.rpc).not.toHaveBeenCalled();
});

test('未登入即使免費會員開關開啟也不能使用天衍與天工', async () => {
  await expect(fetchTianyanList({
    lottery: '今彩539',
    selectedStreaks: ['準5進6'],
    sameCode: false,
  })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });

  await expect(fetchTiangongList({
    lottery: '今彩539',
    periodRange: 50,
    mode: 'two-stage',
    hitCondition: '準2進3',
    exploreDirections: ['固定'],
    firstStageDirections: ['固定'],
    firstRoadTypes: ['加減'],
  })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });

  expect(sdk.rpc).not.toHaveBeenCalled();
});
