import { normalizeMatrixNumber, type MatrixLottery } from './matrix-algorithm';

export type TiangongSourceSequence =
  | [number, number, number]
  | [number, number, number, number];
export type TiangongDirection = '固定' | '依序遞增' | '依序遞減';
export type TiangongAlgorithmType = '加減' | '合值';
export type TiangongHitCondition = '準2進3' | '準3進4';

export type TiangongStage = {
  startPosition: number;
  direction: TiangongDirection;
  algorithmType: TiangongAlgorithmType;
  value: number;
  nextN: number;
};

export type TiangongValidationRole = 'first-stage-evidence' | 'second-stage-validation' | 'prediction';

export type TiangongStageEvidence = {
  distance: number;
  position: number;
  algorithmType: TiangongAlgorithmType;
  value: number;
  inputNumber: number;
  outputNumber: number;
  actualNumber?: number;
  hit?: boolean;
};

export type TiangongValidationRow = {
  role: TiangongValidationRole;
  group: 'A' | 'B' | 'C' | 'D';
  sourcePosition: number;
  sourcePeriod: string;
  sourceNumbers: number[];
  referenceOffset: number;
  referencePosition: number;
  referencePeriod: string;
  referenceBallPosition: number;
  baseNumber: number;
  firstStage: TiangongStageEvidence;
  secondStage?: TiangongStageEvidence;
  resultPeriod: string;
  resultNumbers?: number[];
  predictionDistance?: number;
};

export type TiangongCandidate = {
  lottery: MatrixLottery;
  periodRange: 50 | 80;
  sourceSequence: TiangongSourceSequence;
  mode: 'one-stage' | 'two-stage';
  hitCondition: TiangongHitCondition;
  exploreDirection: TiangongDirection;
  baseNumber: number;
  firstStage: TiangongStage;
  secondStage?: TiangongStage;
  validationRows: TiangongValidationRow[];
};

export type TiangongInvalidReason =
  | 'INVALID_PERIOD_RANGE'
  | 'INVALID_SOURCE_SEQUENCE'
  | 'INVALID_STAGE'
  | 'INVALID_RULE'
  | 'PREDICTION_NOT_FUTURE';

export type TiangongResult = {
  valid: boolean;
  reason?: TiangongInvalidReason;
  ruleIdentity: string;
  interval: number;
  predictionDistance: number;
  predictedPosition?: number;
  predictionNumber?: string;
  roadType?: string;
  stageCount: 1 | 2;
  exploreDirection: TiangongDirection;
  firstStage: TiangongStage;
  secondStage?: TiangongStage;
  validationRows: TiangongValidationRow[];
};

export function enumerateEqualSpacingSequences(
  periods: 50 | 80,
  hitCondition: TiangongHitCondition,
): TiangongSourceSequence[] {
  if (periods !== 50 && periods !== 80) throw new Error('INVALID_PERIOD_RANGE');
  const length = hitCondition === '準2進3' ? 3 : 4;
  const sequences: TiangongSourceSequence[] = [];
  for (let first = 1; first <= periods; first += 1) {
    for (let interval = 1; first + interval * (length - 1) <= periods; interval += 1) {
      sequences.push(Array.from({ length }, (_, index) => first + interval * index) as TiangongSourceSequence);
    }
  }
  return sequences;
}

function maximum(lottery: MatrixLottery) {
  return lottery === '今彩539' || lottery === '天天樂' ? 39 : 49;
}

function positionCount(lottery: MatrixLottery) {
  return lottery === '今彩539' || lottery === '天天樂' ? 5 : 7;
}

function validSourceSequence(
  sequence: TiangongSourceSequence,
  range: number,
  hitCondition: TiangongHitCondition,
) {
  const expectedLength = hitCondition === '準2進3' ? 3 : 4;
  if (sequence.length !== expectedLength || sequence.some((value) => !Number.isInteger(value))) return false;
  if (sequence[0] < 1 || sequence[sequence.length - 1] > range) return false;
  const interval = sequence[1] - sequence[0];
  return interval > 0 && sequence.slice(2).every((value, index) => value - sequence[index + 1] === interval);
}

function effectiveRoad(stage: TiangongStage) {
  return stage.algorithmType === '加減' && stage.value === 0 ? '拖牌' : stage.algorithmType;
}

function validStage(stage: TiangongStage, count: number) {
  if (!Number.isInteger(stage.startPosition) || stage.startPosition < 1 || stage.startPosition > count) return false;
  if (!Number.isInteger(stage.nextN) || stage.nextN < 1) return false;
  if (!['固定', '依序遞增', '依序遞減'].includes(stage.direction)) return false;
  if (stage.algorithmType === '加減') return Number.isInteger(stage.value) && stage.value >= -49 && stage.value <= 49;
  return stage.algorithmType === '合值' && Number.isInteger(stage.value) && stage.value >= 1 && stage.value <= 98;
}

function applyStage(value: number, stage: TiangongStage, max: number) {
  if (stage.algorithmType === '合值') return normalizeMatrixNumber(stage.value - value, max);
  return normalizeMatrixNumber(value + stage.value, max);
}

function predictedPosition(stage: TiangongStage, hitCondition: TiangongHitCondition, count: number) {
  const predictionGroup = hitCondition === '準2進3' ? 3 : 4;
  const delta = stage.direction === '依序遞增' ? 1 : stage.direction === '依序遞減' ? -1 : 0;
  const position = stage.startPosition + delta * (predictionGroup - 1);
  return position >= 1 && position <= count ? position : null;
}

function roadType(first: TiangongStage, second?: TiangongStage) {
  const firstRoad = effectiveRoad(first);
  if (!second) return `${firstRoad}版路`;
  const secondRoad = effectiveRoad(second);
  return firstRoad === secondRoad ? `${firstRoad}版路` : `${firstRoad}＋${secondRoad}`;
}

function identity(input: TiangongCandidate, predictionDistance: number) {
  const stage = (value: TiangongStage) => [
    value.startPosition, value.direction, value.algorithmType, value.value, value.nextN,
  ].join(':');
  return [
    input.periodRange,
    input.sourceSequence.join('-'),
    input.mode,
    input.hitCondition,
    input.exploreDirection,
    predictionDistance,
    stage(input.firstStage),
    ...(input.secondStage ? [stage(input.secondStage)] : []),
  ].join('|');
}

export function evaluateTiangongCandidate(input: TiangongCandidate): TiangongResult {
  const stageCount = input.mode === 'two-stage' ? 2 : 1;
  const predictionDistance = input.firstStage.nextN
    + (stageCount === 2 ? input.secondStage?.nextN ?? 0 : 0)
    - input.sourceSequence[0]
    + 1;
  const base: TiangongResult = {
    valid: false,
    ruleIdentity: identity(input, predictionDistance),
    interval: input.sourceSequence[1] - input.sourceSequence[0],
    predictionDistance,
    stageCount,
    exploreDirection: input.exploreDirection,
    firstStage: input.firstStage,
    ...(stageCount === 2 && input.secondStage ? { secondStage: input.secondStage } : {}),
    validationRows: input.validationRows,
  };
  if (input.periodRange !== 50 && input.periodRange !== 80) return { ...base, reason: 'INVALID_PERIOD_RANGE' };
  if (!validSourceSequence(input.sourceSequence, input.periodRange, input.hitCondition)) {
    return { ...base, reason: 'INVALID_SOURCE_SEQUENCE' };
  }
  if (stageCount === 2 && !input.secondStage) return { ...base, reason: 'INVALID_STAGE' };
  const count = positionCount(input.lottery);
  const stages = stageCount === 2 ? [input.firstStage, input.secondStage!] : [input.firstStage];
  if (stages.some((stage) => !validStage(stage, count))) return { ...base, reason: 'INVALID_RULE' };
  if (predictionDistance < 1) return { ...base, reason: 'PREDICTION_NOT_FUTURE' };
  const max = maximum(input.lottery);
  const prediction = stages.reduce((value, stage) => applyStage(value, stage, max), input.baseNumber);
  const finalStage = stages[stages.length - 1];
  const finalPosition = predictedPosition(finalStage, input.hitCondition, count);
  if (finalPosition === null) return { ...base, reason: 'INVALID_RULE' };
  return {
    ...base,
    valid: true,
    predictedPosition: finalPosition,
    predictionNumber: String(prediction).padStart(2, '0'),
    roadType: roadType(input.firstStage, stageCount === 2 ? input.secondStage : undefined),
  };
}

export function deduplicateTiangongResults(results: TiangongResult[]) {
  const seen = new Set<string>();
  return results.filter((result) => {
    const signature = [
      result.valid,
      result.reason ?? '',
      result.ruleIdentity,
      result.predictedPosition ?? '',
      result.predictionNumber ?? '',
      result.roadType ?? '',
    ].join('|');
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}
