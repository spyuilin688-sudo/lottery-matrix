import { readPermissionSettings } from './permission-settings';
import type { NumberBallLottery } from './NumberBall';
import { MatrixApiError } from './matrix-api-client';
import { getSupabaseClient } from './lib/supabase';
import { readThroughCache, stableCacheKey } from './read-cache';
import { getAlgorithmCacheScope, isGuestAlgorithmCacheSession, readAlgorithmCacheScope } from './auth/algorithm-cache-scope';
import { getMatrixDataRevision, invalidateMatrixData } from './matrix-data-revision';
import { lotteryReadCacheTtlMs } from './lottery-cache-policy';

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

export type TianshuApiRow = TianhengApiRow & {
  thirdNumber: string;
  thirdLockedPosition: number;
};

export type TianshuListRequest = TianhengListRequest;

export type TianshuListResponse = {
  kind: 'tianshu';
  lottery: NumberBallLottery;
  drawPeriod: string;
  analysisVersion: string;
  status: 'complete';
  items: TianshuApiRow[];
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

export type TianshuValidationRow = Omit<TianhengValidationRow, 'lockedPositions' | 'lockedNumbers'> & {
  lockedPositions: [number, number, number];
  lockedNumbers: [number, number, number];
};

export type TianshuValidation = {
  itemId: string;
  sourceA?: Omit<NonNullable<TianhengValidation['sourceA']>, 'lockedPositions' | 'lockedNumbers'> & {
    lockedPositions: [number, number, number];
    lockedNumbers: [number, number, number];
  };
  ruleSets: Array<{
    rules: Array<{ value: number; display: string; algorithmType: string }>;
    predictionNumbers: number[];
    historicalValidation: TianshuValidationRow[];
  }>;
};

export type TianshuValidationResponse = {
  kind: 'tianshu';
  lottery: NumberBallLottery;
  drawPeriod: string;
  analysisVersion: string;
  status: 'complete';
  itemId: string;
  validation: TianshuValidation;
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
  periodRange: 50;
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

function normalizeLockedTuple(value: unknown, expectedLength: 2): [number, number];
function normalizeLockedTuple(value: unknown, expectedLength: 3): [number, number, number];
function normalizeLockedTuple(value: unknown, expectedLength: 2 | 3): [number, number] | [number, number, number];
function normalizeLockedTuple(value: unknown, expectedLength: 2 | 3): [number, number] | [number, number, number] {
  if (!Array.isArray(value) || value.length !== expectedLength) {
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
  return expectedLength === 2
    ? [normalized[0], normalized[1]]
    : [normalized[0], normalized[1], normalized[2]];
}

function normalizeLockedValidation(value: unknown, lockCount: 2 | 3): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const validation = value as Record<string, unknown>;
  const rawSource = validation.sourceA;
  const sourceA = rawSource !== null && typeof rawSource === 'object' && !Array.isArray(rawSource)
    ? {
        ...rawSource,
        lockedNumbers: normalizeLockedTuple(
          (rawSource as Record<string, unknown>).lockedNumbers,
          lockCount,
        ),
        ...(lockCount === 3 ? {
          lockedPositions: normalizeLockedTuple(
            (rawSource as Record<string, unknown>).lockedPositions,
            3,
          ),
        } : {}),
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
                lockedNumbers: normalizeLockedTuple(
                  (rawRow as Record<string, unknown>).lockedNumbers,
                  lockCount,
                ),
                ...(lockCount === 3 ? {
                  lockedPositions: normalizeLockedTuple(
                    (rawRow as Record<string, unknown>).lockedPositions,
                    3,
                  ),
                } : {}),
              };
            })
          : ruleSet.historicalValidation;
        return { ...ruleSet, historicalValidation };
      })
    : validation.ruleSets;
  return { ...validation, sourceA, ruleSets };
}

function normalizeTianshuItems(value: unknown): unknown {
  if (!Array.isArray(value)) throw new MatrixApiError('API_ERROR', 500);
  return value.map((rawItem) => {
    if (rawItem === null || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      throw new MatrixApiError('API_ERROR', 500);
    }
    const item = rawItem as Record<string, unknown>;
    if (typeof item.thirdNumber !== 'string' || !/^\d{2}$/.test(item.thirdNumber)
      || !Number.isSafeInteger(item.thirdLockedPosition)
      || !Number.isSafeInteger(item.secondLockedPosition)
      || (item.thirdLockedPosition as number) <= (item.secondLockedPosition as number)) {
      throw new MatrixApiError('API_ERROR', 500);
    }
    return rawItem;
  });
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
      validation: normalizeLockedValidation(raw.validation, 2),
    };
  }
  if (name === 'matrix_tianshu_list') {
    return {
      ...raw,
      kind: 'tianshu',
      status: 'complete',
      drawPeriod: raw.drawPeriod ?? raw.draw_period,
      analysisVersion: raw.analysisVersion ?? raw.analysis_version,
      duplicateStats: raw.duplicateStats ?? raw.duplicate_stats ?? [],
      items: normalizeTianshuItems(raw.items),
    };
  }
  if (name === 'matrix_tianshu_validation') {
    return {
      ...raw,
      kind: 'tianshu',
      status: 'complete',
      drawPeriod: raw.drawPeriod ?? raw.draw_period,
      analysisVersion: raw.analysisVersion ?? raw.analysis_version,
      itemId: raw.itemId ?? raw.item_id,
      validation: normalizeLockedValidation(raw.validation, 3),
    };
  }
  return data;
}

async function matrixResultRpc<T>(name: string, request: unknown) {
  const { data, error } = await getSupabaseClient().rpc(name, { p_request: request });
  if (error) matrixRpcError(error);
  return normalizeMatrixRpcResponse(name, data) as T;
}

type MatrixListEntitlements = {
  canUseSeven: boolean;
  canUseThirteen: boolean;
  canUseFullRange: boolean;
  canUseTianyan: boolean;
  canUseTiangong: boolean;
};

async function authorizeCachedMatrixList(name: string, request: unknown) {
  try {
    // This RPC calls the same database entitlement function as the list RPCs.
    // Unlike the public settings revision, it checks this member's current status.
    const { data, error } = await getSupabaseClient().rpc('matrix_status_entitlements');
    if (error) matrixRpcError(error);
    const access = data as MatrixListEntitlements | null;
    if (!access || (['canUseSeven', 'canUseThirteen', 'canUseFullRange', 'canUseTianyan', 'canUseTiangong'] as const)
      .some((field) => typeof access[field] !== 'boolean')) {
      throw new MatrixApiError('API_ERROR', 500);
    }
    const periods = (request as { explorePeriods?: number }).explorePeriods;
    const fullRange = (request as { exploreRange?: string }).exploreRange === '完整範圍';
    const allowed = (name !== 'matrix_explore_list' || periods !== 7 || access.canUseSeven)
      && ((name !== 'matrix_explore_list' && name !== 'matrix_tianheng_list' && name !== 'matrix_tianshu_list')
        || periods !== 13 || access.canUseThirteen)
      && ((!['matrix_explore_list', 'matrix_tianheng_list', 'matrix_tianshu_list'].includes(name))
        || !fullRange || access.canUseFullRange)
      && (name !== 'matrix_tianyan_list' || access.canUseTianyan)
      && (name !== 'matrix_tiangong_list' || access.canUseTiangong);
    if (!allowed) throw new MatrixApiError('FORBIDDEN', 403);
  } catch (error) {
    // A denied or unavailable fresh check must also hide results already on screen.
    invalidateMatrixData();
    throw error instanceof MatrixApiError ? error : new MatrixApiError('API_ERROR', 500);
  }
}

async function cachedMatrixResultRpc<T extends { lottery: NumberBallLottery; analysisVersion?: string }>(
  name: string,
  request: unknown,
): Promise<T> {
  const client = getSupabaseClient();
  // Matrix Explore two-period and Tianheng three-period reads are public.
  // Higher periods, full range, Tianyan and Tiangong remain entitlement-gated;
  // the database remains authoritative for period/range entitlement checks.
  const explorePeriods = (request as { explorePeriods?: number }).explorePeriods;
  const sessionOptions = {
    allowGuest: (
      ((name === 'matrix_explore_list' || name === 'matrix_explore_validation') && explorePeriods === 2)
      || ((name === 'matrix_tianheng_list' || name === 'matrix_tianheng_validation') && explorePeriods === 3)
    ),
  };
  const scope = await readAlgorithmCacheScope(client, sessionOptions);
  const permissionSettings = await readPermissionSettings();
  const assertCurrentSession = () => {
    if (getAlgorithmCacheScope() !== scope) {
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
  const lottery = (request as { lottery: NumberBallLottery }).lottery;
  let loadedFromServer = false;
  const result = await readThroughCache(key, lotteryReadCacheTtlMs(lottery, 'standard'), async ({ isCurrent }) => {
    const value = await matrixResultRpc<T>(name, request);
    assertCurrentSession();
    assertCurrentData();
    if (!isCurrent()) throw new MatrixApiError('ANALYSIS_VERSION_MISMATCH', 409);
    loadedFromServer = true;
    return value;
  });
  // The list RPC already checks current entitlement on a miss; a cache hit
  // needs a lightweight, server-authoritative check before exposing old rows.
  if (!loadedFromServer) {
    const publicGuestList = isGuestAlgorithmCacheSession()
      && (request as { exploreRange?: string }).exploreRange === '標準範圍'
      && ((name === 'matrix_explore_list' && explorePeriods === 2)
        || (name === 'matrix_tianheng_list' && explorePeriods === 3));
    if (!publicGuestList) await authorizeCachedMatrixList(name, request);
  }
  // Cache hits must also verify the session before reaching a caller.
  assertCurrentSession();
  assertCurrentData();
  return result;
}

async function directMatrixValidationRpc<T>(
  name: string,
  request: unknown,
  options: { allowGuest?: boolean } = {},
): Promise<T> {
  const client = getSupabaseClient();
  const sessionOptions = { allowGuest: options.allowGuest === true };
  const scope = await readAlgorithmCacheScope(client, sessionOptions);
  const revision = getMatrixDataRevision();
  const value = await matrixResultRpc<T>(name, request);
  if (getAlgorithmCacheScope() !== scope) {
    throw new MatrixApiError('AUTH_REQUIRED', 401);
  }
  if (getMatrixDataRevision() !== revision) {
    throw new MatrixApiError('ANALYSIS_VERSION_MISMATCH', 409);
  }
  return value;
}

export function fetchExploreList(request: ExploreListRequest) {
  return cachedMatrixResultRpc<ExploreListResponse>('matrix_explore_list', request);
}

export function fetchExploreValidation(
  meta: { lottery: NumberBallLottery; drawPeriod: string; analysisVersion: string },
  itemId: string,
  access: Pick<ExploreListRequest, 'explorePeriods' | 'exploreRange'>,
) {
  return directMatrixValidationRpc<ExploreValidationResponse>(
    'matrix_explore_validation',
    { ...meta, itemId, ...access },
    { allowGuest: access.explorePeriods === 2 },
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
  return directMatrixValidationRpc<TianhengValidationResponse>(
    'matrix_tianheng_validation',
    { ...meta, itemId, ...access },
    { allowGuest: access.explorePeriods === 3 },
  );
}

export function fetchTianshuList(request: TianshuListRequest) {
  return cachedMatrixResultRpc<TianshuListResponse>('matrix_tianshu_list', request);
}

export function fetchTianshuValidation(
  meta: { lottery: NumberBallLottery; drawPeriod: string; analysisVersion: string },
  itemId: string,
  access: Pick<TianshuListRequest, 'explorePeriods' | 'exploreRange'>,
) {
  return directMatrixValidationRpc<TianshuValidationResponse>(
    'matrix_tianshu_validation',
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
  return directMatrixValidationRpc<TianyanValidationResponse>(
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
  return directMatrixValidationRpc<TiangongValidationResponse>(
    'matrix_tiangong_validation',
    { ...meta, itemId },
  );
}
