import { refreshPermissionSettings } from './permission-settings';
import type { NumberBallLottery } from './NumberBall';
import { MatrixApiError } from './matrix-api-client';
import { getSupabaseClient } from './lib/supabase';
import { readThroughCache, stableCacheKey } from './read-cache';
import { readAlgorithmCacheScope } from './auth/algorithm-cache-scope';
import { getMatrixDataRevision } from './matrix-data-revision';

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

export type TianhengApiRow = {
  id: string;
  firstNumber: string;
  firstLockedPosition: number;
  secondNumber: string;
  secondLockedPosition: number;
  predictionDistance: number;
  consecutive: string;
  highestStreak: number;
  predictionNumbers: string[];
  algorithmType: '加減' | '合值' | '拖牌';
  numberOrder: MatrixNumberOrder;
  explorePeriods: 3 | 13;
  exploreDateOffset: 0 | 1 | 2;
  ruleCount: 1 | 2;
  referenceOffset?: number;
  referencePosition?: number;
};

export type TianhengListRequest = Omit<ExploreListRequest, 'explorePeriods'> & {
  explorePeriods: 3 | 13;
};

export type TianhengListResponse = {
  kind: 'tianheng';
  lottery: NumberBallLottery;
  drawPeriod: string;
  analysisVersion: string;
  status: 'complete';
  items: TianhengApiRow[];
  duplicateStats: Array<{ number: string; count: number }>;
  total: number;
};

export type TianhengValidationRow = {
  group: string;
  sourcePeriod: string;
  sourceNumbers: Array<string | number>;
  sourceSortedNumbers: Array<string | number>;
  sourceDrawOrderNumbers: Array<string | number> | null;
  lockedPositions: [number, number];
  lockedNumbers: [number, number];
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

export type TianhengValidation = {
  itemId: string;
  sourceA?: {
    sourcePeriod: string;
    sourceNumbers: Array<string | number>;
    sourceSortedNumbers: Array<string | number>;
    sourceDrawOrderNumbers: Array<string | number> | null;
    lockedPositions: [number, number];
    lockedNumbers: [number, number];
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
    historicalValidation: TianhengValidationRow[];
  }>;
};

export type TianhengValidationResponse = {
  kind: 'tianheng';
  lottery: NumberBallLottery;
  drawPeriod: string;
  analysisVersion: string;
  status: 'complete';
  itemId: string;
  validation: TianhengValidation;
};

export type TianyanRoadTypeLabel =
  | '加減版路'
  | '合值版路'
  | '拖牌版路'
  | '加減合值'
  | '加減拖牌'
  | '合值拖牌';

export type TianyanApiRow = {
  id: string;
  number: string;
  lockedPosition: number;
  predictionDistance: number;
  consecutive: string;
  highestStreak: number;
  predictionNumbers: string[];
  roadType: '複合';
  roadTypeLabel: TianyanRoadTypeLabel;
  hitCondition: '準5+（鎖定2碼）';
  numberOrder: MatrixNumberOrder;
  ruleIds: [string, string];
};

export type TianyanListResponse = {
  kind: 'tianyan';
  lottery: NumberBallLottery;
  drawPeriod: string;
  analysisVersion: string;
  status: 'complete';
  items: TianyanApiRow[];
  duplicateStats: Array<{ number: string; count: number }>;
  total: number;
};

export type TianyanRuleValidation = {
  validationPeriodOffset: number;
  validationPeriod: string;
  validationPosition: number;
  baseNumber: number;
  algorithmType: '加減' | '合值' | '拖牌';
  candidateValues: number[];
  ruleValue: number;
  calculationResult: number;
  hit: boolean;
};

export type TianyanValidation = {
  itemId: string;
  sourceA?: {
    sourcePeriod: string;
    sourceNumbers: Array<string | number>;
    lockedPosition: number;
    lockedNumber: number;
    predictionDistance: number;
  };
  rules: Array<{
    id: string;
    validationPeriodOffset: number;
    validationPeriod: string;
    validationPosition: number;
    referenceOffset: number;
    referencePosition: number;
    algorithmType: '加減' | '合值' | '拖牌';
    value: number;
    ruleValue: number;
    currentBaseNumber: number;
    currentPredictionNumber: number;
  }>;
  groupCount: number;
  minimumIndependentHits: number;
  rule1Only: number;
  rule2Only: number;
  bothHit: number;
  mergedSearchPredictionNumbers: string[];
  historicalValidation: Array<{
    group: string;
    sourcePeriod: string;
    sourceNumbers: Array<string | number>;
    lockedPosition: number;
    lockedNumber: number;
    predictionPeriod: string;
    predictionNumbers: Array<string | number>;
    rule1: TianyanRuleValidation;
    rule2: TianyanRuleValidation;
    hitType: 'rule1Only' | 'rule2Only' | 'bothHit';
    hitNumbers: number[];
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
  eligiblePeriodRange: 50 | 80;
  interval: number;
  predictedPosition: number;
  predictionNumber: string;
  roadType: string;
  exploreDirection: '固定' | '依序遞增' | '依序遞減';
  firstStageDirection: '固定' | '依序遞增' | '依序遞減';
  firstRoadType: '加減' | '合值';
  secondStageDirection: '固定' | '依序遞增' | '依序遞減';
  secondRoadType: '加減' | '合值';
};

export type TiangongListRequest = {
  lottery: NumberBallLottery;
  periodRange: 50 | 80;
  mode: 'two-stage';
  hitCondition: '準2進3';
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

export type TiangongEvidenceStage = { numbers?: number[]; period: string; position: number; calculated_number: string | null; actual_number: string | null; matched: boolean | null };
export type TiangongEvidenceSource = { numbers?: number[]; period: string; position: number; number: string };
export type TiangongOperation = { type: "add_sub" | "sum"; value?: number; residue?: number };
export type TiangongValidation = { itemId: string; evidence: { stage1_distance?: number; stage2_distance?: number; stage1_operation?: TiangongOperation; stage2_operation?: TiangongOperation; rows: Array<{ group: 'A' | 'B' | 'C'; role: 'validation' | 'prediction'; source: TiangongEvidenceSource; stage1: TiangongEvidenceStage; stage2: TiangongEvidenceStage }>; d_exclusion: { status: string; source?: TiangongEvidenceSource; stage1?: TiangongEvidenceStage; stage2?: TiangongEvidenceStage | null; [key: string]: unknown } } };

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

function normalizeTianhengLockedNumbers(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new MatrixApiError('API_ERROR', 500);
  }
  const normalized = value.map((item) => (
    typeof item === 'number'
      ? item
      : typeof item === 'string' && item.trim() !== ''
        ? Number(item)
        : Number.NaN
  ));
  if (!normalized.every(Number.isFinite)) {
    throw new MatrixApiError('API_ERROR', 500);
  }
  return [normalized[0], normalized[1]];
}

function normalizeTianhengValidation(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const validation = value as Record<string, unknown>;
  const rawSource = validation.sourceA;
  const sourceA = rawSource !== null && typeof rawSource === 'object' && !Array.isArray(rawSource)
    ? {
        ...rawSource,
        lockedNumbers: normalizeTianhengLockedNumbers(
          (rawSource as Record<string, unknown>).lockedNumbers,
        ),
      }
    : rawSource;
  const ruleSets = Array.isArray(validation.ruleSets)
    ? validation.ruleSets.map((rawRuleSet) => {
        if (rawRuleSet === null || typeof rawRuleSet !== 'object' || Array.isArray(rawRuleSet)) {
          return rawRuleSet;
        }
        const ruleSet = rawRuleSet as Record<string, unknown>;
        const historicalValidation = Array.isArray(ruleSet.historicalValidation)
          ? ruleSet.historicalValidation.map((rawRow) => {
              if (rawRow === null || typeof rawRow !== 'object' || Array.isArray(rawRow)) {
                return rawRow;
              }
              return {
                ...rawRow,
                lockedNumbers: normalizeTianhengLockedNumbers(
                  (rawRow as Record<string, unknown>).lockedNumbers,
                ),
              };
            })
          : ruleSet.historicalValidation;
        return { ...ruleSet, historicalValidation };
      })
    : validation.ruleSets;
  return { ...validation, sourceA, ruleSets };
}

function normalizeMatrixRpcResponse(name: string, data: unknown): unknown {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return data;
  const raw = data as Record<string, unknown>;
  if (name === 'matrix_explore_list') {
    return {
      ...raw,
      kind: 'explore',
      status: 'complete',
      drawPeriod: raw.drawPeriod ?? raw.draw_period,
      analysisVersion: raw.analysisVersion ?? raw.analysis_version,
      duplicateStats: raw.duplicateStats ?? raw.duplicate_stats ?? [],
    };
  }
  if (name === 'matrix_explore_validation') {
    return {
      ...raw,
      kind: 'explore',
      status: 'complete',
      drawPeriod: raw.drawPeriod ?? raw.draw_period,
      analysisVersion: raw.analysisVersion ?? raw.analysis_version,
      itemId: raw.itemId ?? raw.item_id,
    };
  }
  if (name === 'matrix_tianheng_list') {
    return {
      ...raw,
      kind: 'tianheng',
      status: 'complete',
      drawPeriod: raw.drawPeriod ?? raw.draw_period,
      analysisVersion: raw.analysisVersion ?? raw.analysis_version,
      duplicateStats: raw.duplicateStats ?? raw.duplicate_stats ?? [],
    };
  }
  if (name === 'matrix_tianheng_validation') {
    return {
      ...raw,
      kind: 'tianheng',
      status: 'complete',
      drawPeriod: raw.drawPeriod ?? raw.draw_period,
      analysisVersion: raw.analysisVersion ?? raw.analysis_version,
      itemId: raw.itemId ?? raw.item_id,
      validation: normalizeTianhengValidation(raw.validation),
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
  const client = getSupabaseClient();
  // Visitor-eligible RPCs still rely on their database rules to decide
  // access to the requested period and range.
  const sessionOptions = {
    allowGuest: (
      (name === 'matrix_explore_list' || name === 'matrix_explore_validation')
        && (request as { explorePeriods?: number }).explorePeriods === 2
    ) || (
      (name === 'matrix_tianheng_list' || name === 'matrix_tianheng_validation')
        && (request as { explorePeriods?: number }).explorePeriods === 3
    ),
  };
  const scope = await readAlgorithmCacheScope(client, sessionOptions);
  const permissionSettings = await refreshPermissionSettings();
  const assertCurrentSession = async () => {
    if (await readAlgorithmCacheScope(client, sessionOptions) !== scope) {
      throw new MatrixApiError('AUTH_REQUIRED', 401);
    }
  };
  const revision = getMatrixDataRevision();
  const assertCurrentData = () => {
    if (getMatrixDataRevision() !== revision) {
      throw new MatrixApiError('ANALYSIS_VERSION_MISMATCH', 409);
    }
  };
  const key = stableCacheKey(`matrix-rpc:${name}`, { scope, permissionRevision: permissionSettings.revision, request });
  const result = await readThroughCache(key, MATRIX_READ_CACHE_MS, async ({ isCurrent }) => {
    const value = await matrixResultRpc<T>(name, request);
    await assertCurrentSession();
    assertCurrentData();
    if (!isCurrent()) throw new MatrixApiError('ANALYSIS_VERSION_MISMATCH', 409);
    return value;
  });
  // Cache hits must also verify the session before reaching a caller.
  await assertCurrentSession();
  assertCurrentData();
  return result;
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

export function fetchTianhengList(request: TianhengListRequest) {
  return cachedMatrixResultRpc<TianhengListResponse>('matrix_tianheng_list', request);
}

export function fetchTianhengValidation(
  meta: { lottery: NumberBallLottery; drawPeriod: string; analysisVersion: string },
  itemId: string,
  access: Pick<TianhengListRequest, 'explorePeriods' | 'exploreRange'>,
) {
  return cachedMatrixResultRpc<TianhengValidationResponse>(
    'matrix_tianheng_validation',
    { ...meta, itemId, ...access },
  );
}

export function fetchTianyanList(request: {
  explorePeriods?: 2 | 7 | 13;
  exploreRange?: "標準範圍" | "完整範圍";
  numberOrder?: "依號碼由小到大排序" | "依實際開獎順序排序";
  lottery: NumberBallLottery;
  drawPeriod?: string;
  exploreDateOffset?: 0 | 1 | 2;
  selectedStreaks: string[];
  sameCode: boolean;
  predictionNumber?: string;
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
