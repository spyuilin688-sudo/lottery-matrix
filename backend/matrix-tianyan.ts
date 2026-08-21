import { normalizeMatrixNumber, type MatrixAlgorithmType, type MatrixLottery } from './matrix-algorithm';

export type TianyanAlgorithmType = MatrixAlgorithmType;

export type TianyanRule = {
  id: string;
  referenceOffset: number;
  referencePosition: number;
  algorithmType: TianyanAlgorithmType;
  value: number;
  currentBaseNumber: number;
  currentPredictionNumbers?: number[];
};

export type TianyanRuleValidation = {
  baseNumber: number;
  predictionNumber: number;
  hit?: boolean;
};

export type TianyanHistoricalGroup = {
  id: string;
  sourcePeriod: string;
  predictionPeriod: string;
  predictionNumbers: number[];
  rule1: TianyanRuleValidation;
  rule2: TianyanRuleValidation;
};

export type TianyanCandidate = {
  lottery: MatrixLottery;
  rules: [TianyanRule, TianyanRule];
  groups: TianyanHistoricalGroup[];
};

export type TianyanHitType = 'rule1Only' | 'rule2Only' | 'bothHit' | 'bothMiss';

export type TianyanValidationGroup = TianyanHistoricalGroup & {
  rule1Hit: boolean;
  rule2Hit: boolean;
  hitType: TianyanHitType;
  success: boolean;
};

export type TianyanInvalidReason =
  | 'SAME_POSITION_AND_ALGORITHM'
  | 'UNCOVERED_GROUP'
  | 'INSUFFICIENT_INDEPENDENT_CONTRIBUTION'
  | 'TOO_MANY_PREDICTIONS';

export type TianyanResult = {
  valid: boolean;
  reason?: TianyanInvalidReason;
  rules: [TianyanRule, TianyanRule];
  predictionNumbers: string[];
  groupCount: number;
  minimumIndependentHits: number;
  rule1Only: number;
  rule2Only: number;
  bothHit: number;
  groups: TianyanValidationGroup[];
};

function lotteryMaximum(lottery: MatrixLottery) {
  return lottery === '今彩539' || lottery === '天天樂' ? 39 : 49;
}

export function calculateTianyanPrediction(
  algorithmType: TianyanAlgorithmType,
  baseNumber: number,
  value: number,
  maximum: number,
) {
  if (algorithmType === '合值') return normalizeMatrixNumber(value - baseNumber, maximum);
  return normalizeMatrixNumber(baseNumber + value, maximum);
}

function groupHit(group: TianyanHistoricalGroup, key: 'rule1' | 'rule2') {
  const validation = group[key];
  return validation.hit ?? group.predictionNumbers.includes(validation.predictionNumber);
}

function displayNumber(number: number) {
  return String(number).padStart(2, '0');
}

function predictionsFor(rule: TianyanRule, maximum: number) {
  return rule.currentPredictionNumbers ?? [
    calculateTianyanPrediction(rule.algorithmType, rule.currentBaseNumber, rule.value, maximum),
  ];
}

export function evaluateTianyanCandidate(input: TianyanCandidate): TianyanResult {
  const [rule1, rule2] = input.rules;
  const maximum = lotteryMaximum(input.lottery);
  const predictionNumbers = [...new Set([
    ...predictionsFor(rule1, maximum),
    ...predictionsFor(rule2, maximum),
  ])].sort((left, right) => left - right).map(displayNumber);
  const groups = input.groups.slice(0, 30).map((group): TianyanValidationGroup => {
    const rule1Hit = groupHit(group, 'rule1');
    const rule2Hit = groupHit(group, 'rule2');
    const hitType: TianyanHitType = rule1Hit
      ? (rule2Hit ? 'bothHit' : 'rule1Only')
      : (rule2Hit ? 'rule2Only' : 'bothMiss');
    return { ...group, rule1Hit, rule2Hit, hitType, success: rule1Hit || rule2Hit };
  });
  const groupCount = groups.length;
  const minimumIndependentHits = Math.ceil(groupCount * 0.3);
  const rule1Only = groups.filter((group) => group.hitType === 'rule1Only').length;
  const rule2Only = groups.filter((group) => group.hitType === 'rule2Only').length;
  const bothHit = groups.filter((group) => group.hitType === 'bothHit').length;

  const baseResult = {
    rules: input.rules,
    predictionNumbers,
    groupCount,
    minimumIndependentHits,
    rule1Only,
    rule2Only,
    bothHit,
    groups,
  };

  if (rule1.referencePosition === rule2.referencePosition && rule1.algorithmType === rule2.algorithmType) {
    return { ...baseResult, valid: false, reason: 'SAME_POSITION_AND_ALGORITHM' };
  }
  if (groups.some((group) => !group.success)) {
    return { ...baseResult, valid: false, reason: 'UNCOVERED_GROUP' };
  }
  if (rule1Only < minimumIndependentHits || rule2Only < minimumIndependentHits) {
    return { ...baseResult, valid: false, reason: 'INSUFFICIENT_INDEPENDENT_CONTRIBUTION' };
  }
  if (predictionNumbers.length > 2) {
    return { ...baseResult, valid: false, reason: 'TOO_MANY_PREDICTIONS' };
  }
  return { ...baseResult, valid: true };
}
