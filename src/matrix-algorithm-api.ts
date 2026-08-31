import type { NumberBallLottery } from './NumberBall';
import { MatrixApiError } from './matrix-api-client';
import { getSupabaseClient } from './lib/supabase';
import { readThroughCache, stableCacheKey } from './read-cache';

export type MatrixNumberOrder = '依號碼由小到大排序' | '依實際開獎順序排序';
export type MatrixAlgorithmType = '加減' | '合值' | '拖牌' | '加減版路' | '合值版路' | '拖牌版路';

type MatrixAlgorithmRule = {
  value: number;
  display: string;
  algorithmType: MatrixAlgorithmType;
};

export type ExploreApiRow = {
  id: string;
  number: string;
  lockedPosition: number;
  predictionDistance: number;
  consecutive: string;
  highestStreak: number;
  predictionNumbers: string[];
  algorithmType: '加減' | '合值' | '拖牌';
  numberOrder: MatrixNumberOrder;
  explorePeriods: 2 | 7 | 13;
  exploreDateOffset: 0 | 1 | 2;
  ruleCount: 1 | 2;
  referenceOffset?: number;
  referencePosition?: number;
};

export type ExploreListRequest = {
  lottery: NumberBallLottery;
  numberOrder: MatrixNumberOrder;
  explorePeriods: 2 | 7 | 13;
  exploreDateOffset: 0 | 1 | 2;
  exploreRange: '標準範圍' | '完整範圍';
  ruleCount: 1 | 2;
  roadTypes: Array<'加減' | '合值' | '拖牌'>;
  selectedStreaks: string[];
  sameCode: boolean;
  predictionNumber?: string;
};

export type ExploreListResponse = {
  kind: 'explore';
  lottery: NumberBallLottery;
  drawPeriod: string;
  analysisVersion: string;
  status: 'complete';
  items: ExploreApiRow[];
  duplicateStats: Array<{ number: string; count: number }>;
  total: number;
};

export type ExploreValidationRow = {
  group: string;
  sourcePeriod: string;
  sourceNumbers: Array<string | number>;
  sourceSortedNumbers: Array<string | number>;
  sourceDrawOrderNumbers: Array<string | number> | null;
  referencePeriod: string;
  referenceNumbers: Array<string | number>;
  referenceSortedNumbers: Array<string | number>;
  referenceDrawOrderNumbers: Array<string | number> | null;
  baseNumber: number;
  predictionPeriod: string;
  predictionNumbers: Array<string | number>;
  candidateRules: number[];
  matchedRules: Array<MatrixAlgorithmRule | number>;
  hitNumbers: number[];
  success: boolean;
};

export type ExploreValidation = {
  itemId: string;
  sourceA?: {
    sourcePeriod: string;
    sourceNumbers: Array<string | number>;
    sourceSortedNumbers: Array<string | number>;
    sourceDrawOrderNumbers: Array<string | number> | null;
    referencePeriod: string;
    referenceNumbers?: Array<string | number>;
    referenceSortedNumbers?: Array<string | number>;
    referenceDrawOrderNumbers?: Array<string | number> | null;
    baseNumber: number;
    predictionPeriod: string | null;
    predictionCompleted: boolean;
  };
  ruleSets: Array<{
    rules: Array<{ value: number; display: string; algorithmType: string }>;
    predictionNumbers: number[];
    historicalValidation: ExploreValidationRow[];
  }>;
};

export type ExploreValidationResponse = {
  kind: 'explore';
  lottery: NumberBallLottery;
  drawPeriod: string;
  analysisVersion: string;
  status: 'complete';
  itemId: string;
  validation: ExploreValidation;
};

export type TianyanApiRow = {
  id: string;
  number: string;
  lockedPosition: number;
  predictionDistance: number;
  consecutive: string;
  highestStreak: number;
  predictionNumbers: string[];
  roadType: '複合';
  hitCondition: '準5+（鎖定2碼）';
  ruleIds: [string, string];
};

export type TianyanListResponse = {
  kind: 'tianyan';
  lottery: NumberBallLottery;
  drawPeriod: string;
  analysisVersion: string;
  status: 'complete';
  items: TianyanApiRow[];
  total: number;
};

export type TianyanValidation = {
  itemId: string;
  rules: Array<{
    id: string;
    referenceOffset: number;
    referencePosition: number;
    algorithmType: string;
    value: number;
  }>;
  groupCount: number;
  minimumIndependentHits: number;
  rule1Only: number;
  rule2Only: number;
  bothHit: number;
  historicalValidation: Array<{
    id: string;
    sourcePeriod: string;
    predictionPeriod: string;
    hitType: 'rule1Only' | 'rule2Only' | 'bothHit' | 'bothMiss';
    success: boolean;
  }>;
};

export type TianyanValidationResponse = {
  kind: 'tianyan';
  lottery: NumberBallLottery;
  drawPeriod: string;
  analysisVersion: string;
  status: 'complete';
  itemId: string;
  validation: TianyanValidation;
};

export type TiangongApiRow = {
  id: string;
  sourceSequence: number[];
  eligiblePeriodRange: 50 | 80;
  interval: number;
  predictionDistance: number;
  predictedPosition: number;
  predictionNumber: string;
  roadType: string;
  ruleIdentity: string;
  mode: 'one-stage' | 'two-stage';
  hitCondition: '準2進3' | '準3進4';
  exploreDirection: '固定' | '依序遞增' | '依序遞減';
  firstStageDirection: '固定' | '依序遞增' | '依序遞減';
  firstRoadType: '加減' | '合值';
  secondStageDirection?: '固定' | '依序遞增' | '依序遞減';
  secondRoadType?: '加減' | '合值';
};

export type TiangongListRequest = {
  lottery: NumberBallLottery;
  periodRange: 50 | 80;
  mode: 'one-stage' | 'two-stage';
  hitCondition: '準2進3' | '準3進4';
  exploreDirections: Array<'固定' | '依序遞增' | '依序遞減'>;
  firstStageDirections: Array<'固定' | '依序遞增' | '依序遞減'>;
  firstRoadTypes: Array<'加減' | '合值'>;
  secondStageDirections?: Array<'固定' | '依序遞增' | '依序遞減'>;
  secondRoadTypes?: Array<'加減' | '合值'>;
};

export type TiangongListResponse = {
  kind: 'tiangong'; lottery: NumberBallLottery; drawPeriod: string;
  analysisVersion: string; status: 'complete'; items: TiangongApiRow[]; total: number;
};

export type TiangongValidation = {
  itemId: string;
  ruleIdentity: string;
  validationRows: Array<Record<string, unknown> & {
    role: 'first-stage-evidence' | 'second-stage-validation' | 'prediction';
    group: 'A' | 'B' | 'C' | 'D';
    sourcePeriod: string;
    resultPeriod: string;
  }>;
};

export type TiangongValidationResponse = {
  kind: 'tiangong'; lottery: NumberBallLottery; drawPeriod: string;
  analysisVersion: string; status: 'complete'; itemId: string; validation: TiangongValidation;
};

const MATRIX_READ_CACHE_MS = 60_000;

function matrixRpcError(error: { code?: string; message?: string } | null): never {
  const message = String(error?.message ?? 'API_ERROR');
  if (message.includes('FORBIDDEN')) throw new MatrixApiError('FORBIDDEN', 403);
  if (error?.code === '42501' && message.includes('permission denied for function')) {
    throw new MatrixApiError('AUTH_REQUIRED', 401);
  }
  if (message.includes('ANALYSIS_NOT_READY')) throw new MatrixApiError('ANALYSIS_NOT_READY', 404);
  if (message.includes('ANALYSIS_VERSION_MISMATCH')) {
    throw new MatrixApiError('ANALYSIS_VERSION_MISMATCH', 409);
  }
  throw new MatrixApiError('API_ERROR', 500);
}

function normalizeMatrixRpcResponse(name: string, data: unknown): unknown {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return data;
  const raw = data as Record<string, unknown>;
  if (name === 'matrix_explore_list') {
    return {
      ...raw,
      kind: 'explore',
      status: 'complete',
      drawPeriod: raw.draw_period,
      analysisVersion: raw.analysis_version,
      duplicateStats: raw.duplicate_stats ?? [],
    };
  }
  if (name === 'matrix_explore_validation') {
    return {
      ...raw,
      kind: 'explore',
      status: 'complete',
      drawPeriod: raw.draw_period,
      analysisVersion: raw.analysis_version,
      itemId: raw.item_id,
    };
  }
  return data;
}

async function matrixResultRpc<T>(name: string, request: unknown) {
  const { data, error } = await getSupabaseClient().rpc(name, { p_request: request });
  if (error) matrixRpcError(error);
  return normalizeMatrixRpcResponse(name, data) as T;
}

async function cachedMatrixResultRpc<T extends { lottery: NumberBallLottery; analysisVersion?: string }>(
  name: string,
  request: unknown,
): Promise<T> {
  const key = stableCacheKey(`matrix-rpc:${name}`, request);
  return readThroughCache(key, MATRIX_READ_CACHE_MS, () => matrixResultRpc<T>(name, request));
}

export function fetchExploreList(request: ExploreListRequest) {
  return cachedMatrixResultRpc<ExploreListResponse>('matrix_explore_list', request);
}

export function fetchExploreValidation(
  meta: { lottery: NumberBallLottery; drawPeriod: string; analysisVersion: string },
  itemId: string,
  access: Pick<ExploreListRequest, 'explorePeriods' | 'exploreRange'>,
) {
  return cachedMatrixResultRpc<ExploreValidationResponse>(
    'matrix_explore_validation',
    { ...meta, itemId, ...access },
  );
}

export function fetchTianyanList(request: {
  lottery: NumberBallLottery;
  drawPeriod?: string;
  exploreDateOffset?: 0 | 1 | 2;
  selectedStreaks: string[];
}) {
  return cachedMatrixResultRpc<TianyanListResponse>('matrix_tianyan_list', request);
}

export function fetchTianyanValidation(
  meta: { lottery: NumberBallLottery; drawPeriod: string; analysisVersion: string },
  itemId: string,
) {
  return cachedMatrixResultRpc<TianyanValidationResponse>(
    'matrix_tianyan_validation',
    { ...meta, itemId },
  );
}

export function fetchTiangongList(request: TiangongListRequest) {
  return cachedMatrixResultRpc<TiangongListResponse>('matrix_tiangong_list', request);
}

export function fetchTiangongValidation(
  meta: { lottery: NumberBallLottery; drawPeriod: string; analysisVersion: string },
  itemId: string,
) {
  return cachedMatrixResultRpc<TiangongValidationResponse>(
    'matrix_tiangong_validation',
    { ...meta, itemId },
  );
}
