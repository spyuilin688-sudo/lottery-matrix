import { beforeEach, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  rpc: vi.fn(),
  readAlgorithmCacheScope: vi.fn().mockResolvedValue('member:tianshu'),
  getAlgorithmCacheScope: vi.fn().mockReturnValue('member:tianshu'),
  readPermissionSettings: vi.fn().mockResolvedValue({ revision: 1 }),
}));
vi.mock('./lib/supabase', () => ({
  getSupabaseClient: () => ({ rpc: dependencies.rpc }),
}));
vi.mock('./auth/algorithm-cache-scope', () => ({
  getAlgorithmCacheScope: dependencies.getAlgorithmCacheScope,
  readAlgorithmCacheScope: dependencies.readAlgorithmCacheScope,
}));
vi.mock('./permission-settings', () => ({
  readPermissionSettings: dependencies.readPermissionSettings,
}));
vi.mock('./matrix-data-revision', () => ({ getMatrixDataRevision: () => 1 }));
vi.mock('./read-cache', () => ({
  stableCacheKey: () => 'tianshu-test',
  readThroughCache: (_key: string, _ttl: number, loader: (context: { isCurrent: () => boolean }) => unknown) => (
    loader({ isCurrent: () => true })
  ),
}));

import {
  fetchTianshuList,
  fetchTianshuValidation,
  type TianshuListRequest,
} from './matrix-algorithm-api';

const rpc = dependencies.rpc;
const readAlgorithmCacheScope = dependencies.readAlgorithmCacheScope;

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
  readAlgorithmCacheScope.mockClear();
  dependencies.getAlgorithmCacheScope.mockClear();
  dependencies.readPermissionSettings.mockClear();
});

const threePeriodRequest = {
  lottery: '今彩539', numberOrder: '依號碼由小到大排序',
  explorePeriods: 3, exploreDateOffset: 0, exploreRange: '標準範圍',
  ruleCount: 1, roadTypes: ['拖牌'], selectedStreaks: ['準5進6'],
  sameCode: false,
} satisfies TianshuListRequest;

const validationFixture = {
  itemId: 'tianshu-1',
  sourceA: {
    sourcePeriod: '114001',
    sourceNumbers: ['05', '09', '18', '23', '31'],
    sourceSortedNumbers: ['05', '09', '18', '23', '31'],
    sourceDrawOrderNumbers: ['18', '05', '31', '09', '23'],
    lockedPositions: ['1', '3', '5'],
    lockedNumbers: ['05', '18', '31'],
    referencePeriod: '114000',
    referenceNumbers: ['02', '11', '16', '24', '35'],
    referenceSortedNumbers: ['02', '11', '16', '24', '35'],
    referenceDrawOrderNumbers: ['24', '02', '35', '11', '16'],
    baseNumber: 2,
    predictionPeriod: null,
    predictionCompleted: false,
  },
  ruleSets: [{
    rules: [{ value: 3, display: '拖3', algorithmType: '拖牌' }],
    predictionNumbers: [23],
    historicalValidation: [{
      group: 'B',
      sourcePeriod: '113999',
      sourceNumbers: ['03', '08', '17', '22', '30'],
      sourceSortedNumbers: ['03', '08', '17', '22', '30'],
      sourceDrawOrderNumbers: ['17', '03', '30', '08', '22'],
      lockedPositions: ['1', '2', '5'],
      lockedNumbers: ['03', '08', '30'],
      referencePeriod: '113998',
      referenceNumbers: ['01', '10', '15', '21', '34'],
      referenceSortedNumbers: ['01', '10', '15', '21', '34'],
      referenceDrawOrderNumbers: ['21', '01', '34', '10', '15'],
      baseNumber: 1,
      predictionPeriod: '113997',
      predictionNumbers: ['04', '13', '20', '23', '36'],
      candidateRules: [3],
      matchedRules: [{ value: 3, display: '拖3', algorithmType: '拖牌' }],
      hitNumbers: [23],
      success: true,
    }],
  }],
};

it('uses the independent authenticated Tianshu list RPC and preserves the third lock fields', async () => {
  rpc.mockResolvedValue({ data: {
    lottery: '今彩539', draw_period: '114001', analysis_version: '114001:matrix-python-v13',
    items: [{
      id: 'tianshu-1', firstNumber: '05', firstLockedPosition: 1,
      secondNumber: '18', secondLockedPosition: 3,
      thirdNumber: '31', thirdLockedPosition: 5,
    }],
    duplicate_stats: [{ number: '23', count: 2 }], total: 1,
  }, error: null });

  const response = await fetchTianshuList(threePeriodRequest);

  expect(rpc).toHaveBeenCalledWith('matrix_tianshu_list', { p_request: threePeriodRequest });
  expect(response).toEqual(expect.objectContaining({
    kind: 'tianshu', status: 'complete', drawPeriod: '114001',
    analysisVersion: '114001:matrix-python-v13',
    duplicateStats: [{ number: '23', count: 2 }],
  }));
  expect(response.items[0]).toEqual(expect.objectContaining({ thirdNumber: '31', thirdLockedPosition: 5 }));
  expect(readAlgorithmCacheScope).toHaveBeenCalledWith(expect.anything(), { allowGuest: false });
});

it.each([3, 13] as const)('keeps Tianshu %s-period requests authenticated', async explorePeriods => {
  await fetchTianshuList({ ...threePeriodRequest, explorePeriods });
  expect(readAlgorithmCacheScope).toHaveBeenCalledWith(expect.anything(), { allowGuest: false });
});

it.each([
  { thirdNumber: undefined, thirdLockedPosition: 5 },
  { thirdNumber: '3', thirdLockedPosition: 5 },
  { thirdNumber: '31', thirdLockedPosition: undefined },
  { thirdNumber: '31', thirdLockedPosition: 3 },
])('rejects a malformed mandatory third lock: $thirdNumber at $thirdLockedPosition', async thirdLock => {
  rpc.mockResolvedValue({ data: {
    lottery: '今彩539', draw_period: '114001', analysis_version: 'v1',
    items: [{
      id: 'tianshu-1', firstNumber: '05', firstLockedPosition: 1,
      secondNumber: '18', secondLockedPosition: 3, ...thirdLock,
    }],
    duplicate_stats: [], total: 1,
  }, error: null });

  await expect(fetchTianshuList(threePeriodRequest)).rejects.toMatchObject({ code: 'API_ERROR' });
});

it('uses the independent validation RPC and normalizes exact three-item tuples', async () => {
  rpc.mockResolvedValue({ data: {
    lottery: '今彩539', draw_period: '114001', analysis_version: '114001:matrix-python-v13',
    item_id: 'tianshu-1', validation: validationFixture,
  }, error: null });

  const response = await fetchTianshuValidation(
    { lottery: '今彩539', drawPeriod: '114001', analysisVersion: '114001:matrix-python-v13' },
    'tianshu-1',
    { explorePeriods: 3, exploreRange: '標準範圍' },
  );

  expect(rpc).toHaveBeenCalledWith('matrix_tianshu_validation', { p_request: {
    lottery: '今彩539', drawPeriod: '114001', analysisVersion: '114001:matrix-python-v13',
    itemId: 'tianshu-1', explorePeriods: 3, exploreRange: '標準範圍',
  } });
  expect(response).toEqual(expect.objectContaining({ kind: 'tianshu', status: 'complete', itemId: 'tianshu-1' }));
  expect(response.validation.sourceA?.lockedPositions).toEqual([1, 3, 5]);
  expect(response.validation.sourceA?.lockedNumbers).toEqual([5, 18, 31]);
  expect(response.validation.ruleSets[0]?.historicalValidation[0]?.lockedPositions).toEqual([1, 2, 5]);
  expect(response.validation.ruleSets[0]?.historicalValidation[0]?.lockedNumbers).toEqual([3, 8, 30]);
  expect(readAlgorithmCacheScope).toHaveBeenCalledWith(expect.anything(), { allowGuest: false });
  expect(dependencies.readPermissionSettings).not.toHaveBeenCalled();
});

it.each([
  { key: 'lockedNumbers', value: ['05', '18'] },
  { key: 'lockedNumbers', value: ['05', '18', '31', '39'] },
  { key: 'lockedNumbers', value: ['05', 'bad', '31'] },
  { key: 'lockedPositions', value: ['1', '3'] },
  { key: 'lockedPositions', value: ['1', '3', '5', '6'] },
  { key: 'lockedPositions', value: ['1', 'bad', '5'] },
] as const)('rejects malformed Tianshu $key tuples: $value', async ({ key, value }) => {
  rpc.mockResolvedValue({ data: {
    lottery: '今彩539', draw_period: '114001', analysis_version: 'v1', item_id: 'tianshu-1',
    validation: { ...validationFixture, sourceA: { ...validationFixture.sourceA, [key]: value } },
  }, error: null });

  await expect(fetchTianshuValidation(
    { lottery: '今彩539', drawPeriod: '114001', analysisVersion: 'v1' },
    'tianshu-1',
    { explorePeriods: 3, exploreRange: '標準範圍' },
  )).rejects.toMatchObject({ code: 'API_ERROR' });
});
