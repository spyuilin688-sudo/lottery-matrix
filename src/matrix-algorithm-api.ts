import { LOTTERY_API_BASE } from './lottery-api';
import type { NumberBallLottery } from './NumberBall';

export type MatrixNumberOrder = '依號碼由小到大排序' | '依實際開獎順序排序';
export type MatrixAlgorithmType = '加減' | '合值' | '拖牌' | '加減版路' | '合值版路' | '拖牌版路';

export type MatrixAlgorithmRequest = {
  lottery: NumberBallLottery;
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

export async function runMatrixAlgorithmExplore(payload: MatrixAlgorithmRequest) {
  const response = await fetch(`${LOTTERY_API_BASE}/api/matrix/algorithm/explore`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Matrix Algorithm API ${response.status}: ${response.statusText}`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Matrix Algorithm API returned ${contentType || 'non-JSON response'}`);
  }

  return response.json() as Promise<MatrixAlgorithmResponse>;
}
