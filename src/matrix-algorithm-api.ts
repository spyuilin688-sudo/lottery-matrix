import type { NumberBallLottery } from './NumberBall';
import { matrixApiFetch } from './matrix-api-client';
import {
  buildMatrixResultCacheKey,
  readMatrixResultCache,
  setMatrixCurrentPeriod,
  writeMatrixResultCache,
} from './matrix-result-cache';

export type MatrixNumberOrder = '依號碼由小到大排序' | '依實際開獎順序排序';
export type MatrixAlgorithmType = '加減' | '合值' | '拖牌' | '加減版路' | '合值版路' | '拖牌版路';

export type MatrixAlgorithmRequest = {
  lottery: NumberBallLottery;
  drawPeriod: string;
  numberOrder: MatrixNumberOrder | '依號碼由小到大' | '依實際開獎順序';
  lockedPosition: number;
  lockedNumber: number;
  referenceOffset?: number;
  referencePosition?: number;
  predictionDistance: number;
  ruleCount: 1 | 2;
  algorithmType: MatrixAlgorithmType;
};

export type MatrixAlgorithmRule = {
  value: number;
  display: string;
};

export type MatrixAlgorithmValidationRow = {
  group: string;
  sourcePeriod: string;
  sourceNumbers: number[];
  sourceSortedNumbers: Array<string | number>;
  sourceDrawOrderNumbers: Array<string | number> | null;
  referencePeriod: string;
  baseNumber: number;
  predictionPeriod: string;
  predictionNumbers: Array<string | number>;
  candidateRules: number[];
  matchedRules: number[];
  hitNumbers: number[];
  success: boolean;
};

export type MatrixAlgorithmRuleSet = {
  rules: MatrixAlgorithmRule[];
  predictionNumbers: number[];
  historicalValidation: MatrixAlgorithmValidationRow[];
};

export type MatrixAlgorithmResponse = {
  valid: boolean;
  reason?: string;
  searchCondition: MatrixAlgorithmRequest;
  highestStreak?: number;
  displayStreak?: string;
  predictionNumbers?: number[];
  sourceA?: {
    sourcePeriod: string;
    sourceNumbers: number[];
    sourceSortedNumbers: Array<string | number>;
    sourceDrawOrderNumbers: Array<string | number> | null;
    referencePeriod: string;
    baseNumber: number;
    predictionPeriod: string | null;
    predictionCompleted: boolean;
  };
  results?: MatrixAlgorithmRuleSet[];
  ruleSets?: MatrixAlgorithmRuleSet[];
  missingDrawOrderCount?: number;
  missingDrawOrderPeriods?: string[];
  conflictingRules?: number[];
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
  matchedRules: number[];
  hitNumbers: number[];
  success: boolean;
};

export type ExploreValidation = {
  itemId: string;
  sourceA?: Record<string, unknown>;
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

const pendingRequests = new Map<string, Promise<MatrixAlgorithmResponse>>();

export function fetchExploreList(request: ExploreListRequest) {
  return matrixApiFetch<ExploreListResponse>('/api/matrix/algorithm/explore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  }, { auth: 'optional' });
}

export function fetchExploreValidation(
  meta: { lottery: NumberBallLottery; drawPeriod: string; analysisVersion: string },
  itemId: string,
) {
  return matrixApiFetch<ExploreValidationResponse>('/api/matrix/algorithm/explore/validation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...meta, itemId }),
  }, { auth: 'optional' });
}

export function fetchTianyanList(request: {
  lottery: NumberBallLottery;
  drawPeriod?: string;
  selectedStreaks: string[];
}) {
  return matrixApiFetch<TianyanListResponse>('/api/matrix/algorithm/tianyan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
}

export function fetchTianyanValidation(
  meta: { lottery: NumberBallLottery; drawPeriod: string; analysisVersion: string },
  itemId: string,
) {
  return matrixApiFetch<TianyanValidationResponse>('/api/matrix/algorithm/tianyan/validation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...meta, itemId }),
  });
}

export function fetchTiangongList(request: TiangongListRequest) {
  return matrixApiFetch<TiangongListResponse>('/api/matrix/algorithm/tiangong', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
  });
}

export function fetchTiangongValidation(
  meta: { lottery: NumberBallLottery; drawPeriod: string; analysisVersion: string },
  itemId: string,
) {
  return matrixApiFetch<TiangongValidationResponse>('/api/matrix/algorithm/tiangong/validation', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...meta, itemId }),
  });
}

export async function runMatrixAlgorithmExplore(payload: MatrixAlgorithmRequest) {
  if (!payload.drawPeriod.trim()) throw new Error('Matrix Algorithm API requires drawPeriod');
  setMatrixCurrentPeriod(payload.lottery, payload.drawPeriod);
  const cached = readMatrixResultCache<MatrixAlgorithmResponse>(payload);
  if (cached) return cached;

  const requestKey = buildMatrixResultCacheKey(payload);
  const pending = pendingRequests.get(requestKey);
  if (pending) return pending;

  const request = (async () => {
    const result = await matrixApiFetch<MatrixAlgorithmResponse>('/api/matrix/algorithm/explore', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    writeMatrixResultCache(payload, result);
    return result;
  })();

  pendingRequests.set(requestKey, request);
  try {
    return await request;
  } finally {
    pendingRequests.delete(requestKey);
  }
}
