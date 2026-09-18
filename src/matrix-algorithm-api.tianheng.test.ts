import { beforeEach, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  rpc: vi.fn(),
  readAlgorithmCacheScope: vi.fn().mockResolvedValue('guest'),
}));
vi.mock('./lib/supabase', () => ({
  getSupabaseClient: () => ({ rpc: dependencies.rpc }),
}));
vi.mock('./auth/algorithm-cache-scope', () => ({
  readAlgorithmCacheScope: dependencies.readAlgorithmCacheScope,
}));
vi.mock('./permission-settings', () => ({
  refreshPermissionSettings: vi.fn().mockResolvedValue({ revision: 1 }),
}));
vi.mock('./matrix-data-revision', () => ({ getMatrixDataRevision: () => 1 }));
vi.mock('./read-cache', () => ({
  stableCacheKey: () => 'tianheng-test',
  readThroughCache: (_key: string, _ttl: number, loader: (context: { isCurrent: () => boolean }) => unknown) => (
    loader({ isCurrent: () => true })
  ),
}));

import {
  fetchTianhengList,
  fetchTianhengValidation,
  type TianhengListRequest,
} from './matrix-algorithm-api';

const rpc = dependencies.rpc;
const readAlgorithmCacheScope = dependencies.readAlgorithmCacheScope;

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
  readAlgorithmCacheScope.mockClear();
});

const threePeriodRequest = {
  lottery: '今彩539', numberOrder: '依號碼由小到大排序',
  explorePeriods: 3, exploreDateOffset: 0, exploreRange: '標準範圍',
  ruleCount: 1, roadTypes: ['拖牌'], selectedStreaks: ['準5進6'],
  sameCode: false,
} satisfies TianhengListRequest;

const validationFixture = {
  itemId: 'tianheng-1',
  sourceA: {
    sourcePeriod: '114001',
    sourceNumbers: ['05', '09', '18', '23', '31'],
    sourceSortedNumbers: ['05', '09', '18', '23', '31'],
    sourceDrawOrderNumbers: ['18', '05', '31', '09', '23'],
    lockedPositions: [1, 4],
    lockedNumbers: ['05', '18'],
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
      lockedPositions: [2, 5],
      lockedNumbers: ['08', '30'],
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

it('calls the Tianheng list RPC with three periods', async () => {
  rpc.mockResolvedValue({ data: {
    kind: 'tianheng', lottery: '今彩539', drawPeriod: '114001',
    analysisVersion: '114001:matrix-python-v13', status: 'complete',
    items: [], duplicateStats: [], total: 0,
  }, error: null });
  await fetchTianhengList(threePeriodRequest);
  expect(rpc).toHaveBeenCalledWith('matrix_tianheng_list', expect.objectContaining({
    p_request: expect.objectContaining({ explorePeriods: 3 }),
  }));
});

it('allows the existing guest cache scope only for Tianheng three periods', async () => {
  await fetchTianhengList(threePeriodRequest);
  expect(readAlgorithmCacheScope).toHaveBeenCalledWith(expect.anything(), { allowGuest: true });
});

it('normalizes the Tianheng list envelope like Explore', async () => {
  rpc.mockResolvedValue({ data: {
    lottery: '今彩539', draw_period: '114001',
    analysis_version: '114001:matrix-python-v13', items: [],
    duplicate_stats: [{ number: '23', count: 2 }], total: 0,
  }, error: null });

  await expect(fetchTianhengList(threePeriodRequest)).resolves.toEqual(expect.objectContaining({
    kind: 'tianheng', status: 'complete', drawPeriod: '114001',
    analysisVersion: '114001:matrix-python-v13',
    duplicateStats: [{ number: '23', count: 2 }],
  }));
});

it('calls and normalizes Tianheng validation with both lock tuples', async () => {
  rpc.mockResolvedValue({ data: {
    lottery: '今彩539', draw_period: '114001',
    analysis_version: '114001:matrix-python-v13', item_id: 'tianheng-1',
    validation: validationFixture,
  }, error: null });

  const response = await fetchTianhengValidation(
    { lottery: '今彩539', drawPeriod: '114001', analysisVersion: '114001:matrix-python-v13' },
    'tianheng-1',
    { explorePeriods: 3, exploreRange: '標準範圍' },
  );

  expect(rpc).toHaveBeenCalledWith('matrix_tianheng_validation', {
    p_request: {
      lottery: '今彩539', drawPeriod: '114001', analysisVersion: '114001:matrix-python-v13',
      itemId: 'tianheng-1', explorePeriods: 3, exploreRange: '標準範圍',
    },
  });
  expect(response).toEqual(expect.objectContaining({
    kind: 'tianheng', status: 'complete', drawPeriod: '114001',
    analysisVersion: '114001:matrix-python-v13', itemId: 'tianheng-1',
    validation: expect.objectContaining({ itemId: 'tianheng-1' }),
  }));
  expect(response.validation.sourceA?.lockedNumbers).toEqual([5, 18]);
  expect(response.validation.ruleSets[0]?.historicalValidation[0]?.lockedNumbers).toEqual([8, 30]);
  expect(readAlgorithmCacheScope).toHaveBeenCalledWith(expect.anything(), { allowGuest: true });
});

it('keeps Tianheng thirteen-period list requests authenticated', async () => {
  await fetchTianhengList({ ...threePeriodRequest, explorePeriods: 13 });
  expect(readAlgorithmCacheScope).toHaveBeenCalledWith(expect.anything(), { allowGuest: false });
});

it('keeps Tianheng thirteen-period validation requests authenticated', async () => {
  await fetchTianhengValidation(
    { lottery: '今彩539', drawPeriod: '114001', analysisVersion: '114001:matrix-python-v13' },
    'tianheng-1',
    { explorePeriods: 13, exploreRange: '標準範圍' },
  );
  expect(readAlgorithmCacheScope).toHaveBeenCalledWith(expect.anything(), { allowGuest: false });
});
