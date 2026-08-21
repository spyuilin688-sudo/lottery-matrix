import { normalizeMatrixNumber, type MatrixDraw, type MatrixLottery } from './matrix-algorithm';
import {
  enumerateEqualSpacingSequences,
  evaluateTiangongCandidate,
  type TiangongAlgorithmType,
  type TiangongCandidate,
  type TiangongDirection,
  type TiangongHitCondition,
  type TiangongSourceSequence,
  type TiangongStage,
  type TiangongValidationRow,
} from './matrix-tiangong';

export type PositionPath = {
  startPosition: number;
  direction: TiangongDirection;
  positionsOldestToNewest: number[];
};

export type DerivedRule = Pick<TiangongStage, 'algorithmType' | 'value'>;

export type TiangongSearchOptions = {
  periodRanges?: Array<50 | 80>;
  modes?: Array<'one-stage' | 'two-stage'>;
  hitConditions?: TiangongHitCondition[];
  sourceSequences?: TiangongSourceSequence[];
  referenceOffsets?: number[];
  explorePaths?: PositionPath[];
  firstStagePaths?: PositionPath[];
  secondStagePaths?: PositionPath[];
  firstStageDistances?: number[];
  secondStageDistances?: number[];
};

type NormalizedDraw = {
  period: string;
  numbers: number[];
};

function maximum(lottery: MatrixLottery): 39 | 49 {
  return lottery === '今彩539' || lottery === '天天樂' ? 39 : 49;
}

function positionCount(lottery: MatrixLottery) {
  return lottery === '今彩539' || lottery === '天天樂' ? 5 : 7;
}

function normalizeHistory(lottery: MatrixLottery, history: MatrixDraw[]): NormalizedDraw[] {
  const count = positionCount(lottery);
  return history.map((draw) => {
    const values = Array.isArray(draw.drawOrderNumbers) && draw.drawOrderNumbers.length === count
      ? draw.drawOrderNumbers
      : draw.numbers;
    if (values.length !== count) throw new Error('INVALID_MATRIX_DRAW');
    const numbers = values.map(Number);
    if (numbers.some((value) => !Number.isInteger(value))) throw new Error('INVALID_MATRIX_DRAW');
    return { period: draw.period, numbers };
  });
}

export function resultPosition(sourcePosition: number, distance: number) {
  return sourcePosition - distance;
}

export function enumeratePositionPaths(count: number, groupCount: 3 | 4): PositionPath[] {
  const paths: PositionPath[] = [];
  const directions: Array<[TiangongDirection, number]> = [
    ['固定', 0],
    ['依序遞增', 1],
    ['依序遞減', -1],
  ];
  for (const [direction, delta] of directions) {
    for (let startPosition = 1; startPosition <= count; startPosition += 1) {
      const positionsOldestToNewest = Array.from(
        { length: groupCount },
        (_, index) => startPosition + delta * index,
      );
      if (positionsOldestToNewest.every((position) => position >= 1 && position <= count)) {
        paths.push({ startPosition, direction, positionsOldestToNewest });
      }
    }
  }
  return paths;
}

function applyRule(base: number, rule: DerivedRule, max: 39 | 49) {
  return rule.algorithmType === '合值'
    ? normalizeMatrixNumber(rule.value - base, max)
    : normalizeMatrixNumber(base + rule.value, max);
}

export function deriveTiangongRules(base: number, target: number, max: 39 | 49): DerivedRule[] {
  const rules: DerivedRule[] = [];
  const delta = target - base;
  for (let cycle = -3; cycle <= 3; cycle += 1) {
    const value = delta + cycle * max;
    if (value >= -49 && value <= 49 && normalizeMatrixNumber(base + value, max) === target) {
      rules.push({ algorithmType: '加減', value });
    }
  }
  const directSum = base + target;
  for (let cycle = -3; cycle <= 3; cycle += 1) {
    const value = directSum + cycle * max;
    if (value >= 1 && value <= 98 && normalizeMatrixNumber(value - base, max) === target) {
      rules.push({ algorithmType: '合值', value });
    }
  }
  return rules.sort((left, right) => (
    left.algorithmType.localeCompare(right.algorithmType) || left.value - right.value
  ));
}

export function enumerateReferencePositions(
  sourcePosition: number,
  finalDistance: number,
  historyLength: number,
) {
  const positions: number[] = [];
  for (let distance = 1; distance <= 14; distance += 1) positions.push(sourcePosition + distance);
  positions.push(sourcePosition);
  for (let distance = 1; distance < finalDistance; distance += 1) positions.push(sourcePosition - distance);
  const finalPosition = resultPosition(sourcePosition, finalDistance);
  return positions.filter((position) => (
    position >= 1 && position <= historyLength && position !== finalPosition
  ));
}

function referenceOffsets(
  sourcePositionsOldestToNewest: number[],
  finalDistance: number,
  historyLength: number,
  requested?: number[],
) {
  const allowed = sourcePositionsOldestToNewest.map((sourcePosition) => new Set(
    enumerateReferencePositions(sourcePosition, finalDistance, historyLength)
      .map((referencePosition) => referencePosition - sourcePosition),
  ));
  const first = requested ?? [...allowed[0]];
  return first.filter((offset) => allowed.every((set) => set.has(offset)));
}

function groupName(sourceSequenceIndex: number): 'A' | 'B' | 'C' | 'D' {
  return ['A', 'B', 'C', 'D'][sourceSequenceIndex] as 'A' | 'B' | 'C' | 'D';
}

function futurePeriod(latestPeriod: string, predictionDistance: number) {
  if (!/^\d+$/.test(latestPeriod)) return `下${predictionDistance}期`;
  return String(Number(latestPeriod) + predictionDistance).padStart(latestPeriod.length, '0');
}

function stageEvidence(
  stage: TiangongStage,
  position: number,
  inputNumber: number,
  outputNumber: number,
  actualNumber?: number,
) {
  return {
    distance: stage.nextN,
    position,
    algorithmType: stage.algorithmType,
    value: stage.value,
    inputNumber,
    outputNumber,
    ...(actualNumber === undefined ? {} : { actualNumber, hit: outputNumber === actualNumber }),
  };
}

function oneStageEvidence(
  history: NormalizedDraw[],
  sourceSequence: TiangongSourceSequence,
  referenceOffset: number,
  explorePath: PositionPath,
  resultPath: PositionPath,
  stage: TiangongStage,
  rule: DerivedRule,
  max: 39 | 49,
): TiangongValidationRow[] {
  const rows: TiangongValidationRow[] = [];
  const sequenceLength = sourceSequence.length;
  const sourcePositionsOldestToNewest = [...sourceSequence].reverse();
  sourcePositionsOldestToNewest.forEach((sourcePosition, traversalIndex) => {
    const sourceSequenceIndex = sequenceLength - traversalIndex - 1;
    const source = history[sourcePosition - 1];
    const referencePosition = sourcePosition + referenceOffset;
    const reference = history[referencePosition - 1];
    const baseNumber = reference.numbers[explorePath.positionsOldestToNewest[traversalIndex] - 1];
    const outputNumber = applyRule(baseNumber, rule, max);
    const finalPosition = resultPosition(sourcePosition, stage.nextN);
    const actual = finalPosition >= 1 ? history[finalPosition - 1] : undefined;
    const resultBallPosition = resultPath.positionsOldestToNewest[traversalIndex];
    const actualNumber = actual?.numbers[resultBallPosition - 1];
    const isPrediction = sourceSequenceIndex === 0;
    rows.push({
      role: isPrediction ? 'prediction' : 'first-stage-evidence',
      group: groupName(sourceSequenceIndex),
      sourcePosition,
      sourcePeriod: source.period,
      sourceNumbers: source.numbers,
      referenceOffset,
      referencePosition,
      referencePeriod: reference.period,
      referenceBallPosition: explorePath.positionsOldestToNewest[traversalIndex],
      baseNumber,
      firstStage: stageEvidence(stage, resultBallPosition, baseNumber, outputNumber, actualNumber),
      resultPeriod: actual?.period ?? futurePeriod(history[0].period, 1 - finalPosition),
      ...(actual ? { resultNumbers: actual.numbers } : { predictionDistance: 1 - finalPosition }),
    });
  });
  return rows;
}

function candidateSignature(candidate: TiangongCandidate) {
  const result = evaluateTiangongCandidate(candidate);
  return [
    result.ruleIdentity,
    result.predictionDistance,
    result.predictedPosition,
    result.predictionNumber,
    result.roadType,
  ].join('|');
}

function oneStageCandidates(
  lottery: MatrixLottery,
  history: NormalizedDraw[],
  periodRange: 50 | 80,
  hitCondition: TiangongHitCondition,
  options: TiangongSearchOptions,
) {
  const length = hitCondition === '準2進3' ? 3 : 4;
  const max = maximum(lottery);
  const count = positionCount(lottery);
  const sequences = (options.sourceSequences
    ?? enumerateEqualSpacingSequences(periodRange, hitCondition))
    .filter((sequence) => sequence.length === length && sequence[sequence.length - 1] <= periodRange);
  const explorePaths = options.explorePaths ?? enumeratePositionPaths(count, length);
  const resultPaths = options.firstStagePaths ?? enumeratePositionPaths(count, length);
  const candidates: TiangongCandidate[] = [];

  for (const sourceSequence of sequences) {
    if (sourceSequence[sourceSequence.length - 1] > history.length) continue;
    const a = sourceSequence[0];
    const interval = sourceSequence[1] - a;
    const distances = options.firstStageDistances
      ?? Array.from({ length: interval }, (_, index) => a + index);
    const sourcePositionsOldestToNewest = [...sourceSequence].reverse();
    for (const nextN of distances) {
      if (!Number.isInteger(nextN) || nextN < a || nextN >= a + interval) continue;
      const validationResultPositions = sourcePositionsOldestToNewest
        .slice(0, -1)
        .map((position) => resultPosition(position, nextN));
      if (validationResultPositions.some((position) => position < 1 || position > history.length)) continue;
      const offsets = referenceOffsets(
        sourcePositionsOldestToNewest,
        nextN,
        history.length,
        options.referenceOffsets,
      );
      for (const explorePath of explorePaths) {
        if (explorePath.positionsOldestToNewest.length !== length) continue;
        for (const resultPath of resultPaths) {
          if (resultPath.positionsOldestToNewest.length !== length) continue;
          for (const referenceOffset of offsets) {
            const validationPairs = sourcePositionsOldestToNewest.slice(0, -1).map((sourcePosition, index) => {
              const reference = history[sourcePosition + referenceOffset - 1];
              const result = history[resultPosition(sourcePosition, nextN) - 1];
              return {
                base: reference.numbers[explorePath.positionsOldestToNewest[index] - 1],
                target: result.numbers[resultPath.positionsOldestToNewest[index] - 1],
              };
            });
            const rules = deriveTiangongRules(validationPairs[0].base, validationPairs[0].target, max)
              .filter((rule) => validationPairs.slice(1).every(({ base, target }) => (
                applyRule(base, rule, max) === target
              )));
            for (const rule of rules) {
              const firstStage: TiangongStage = {
                startPosition: resultPath.startPosition,
                direction: resultPath.direction,
                algorithmType: rule.algorithmType,
                value: rule.value,
                nextN,
              };
              const rows = oneStageEvidence(
                history,
                sourceSequence,
                referenceOffset,
                explorePath,
                resultPath,
                firstStage,
                rule,
                max,
              );
              const predictionRow = rows[rows.length - 1];
              candidates.push({
                lottery,
                periodRange,
                sourceSequence,
                mode: 'one-stage',
                hitCondition,
                exploreDirection: explorePath.direction,
                baseNumber: predictionRow.baseNumber,
                firstStage,
                validationRows: rows,
              });
            }
          }
        }
      }
    }
  }
  return candidates;
}

function twoStageEvidence(
  history: NormalizedDraw[],
  sourceSequence: TiangongSourceSequence,
  referenceOffset: number,
  explorePath: PositionPath,
  firstPath: PositionPath,
  secondPath: PositionPath,
  firstStage: TiangongStage,
  secondStage: TiangongStage,
  firstRule: DerivedRule,
  secondRule: DerivedRule,
  max: 39 | 49,
): TiangongValidationRow[] {
  const firstRows: TiangongValidationRow[] = [];
  const secondRows: TiangongValidationRow[] = [];
  const sourcePositionsOldestToNewest = [...sourceSequence].reverse();
  const sequenceLength = sourceSequence.length;
  let predictionRow: TiangongValidationRow | null = null;

  sourcePositionsOldestToNewest.forEach((sourcePosition, traversalIndex) => {
    const sourceSequenceIndex = sequenceLength - traversalIndex - 1;
    const source = history[sourcePosition - 1];
    const referencePosition = sourcePosition + referenceOffset;
    const reference = history[referencePosition - 1];
    const referenceBallPosition = explorePath.positionsOldestToNewest[traversalIndex];
    const baseNumber = reference.numbers[referenceBallPosition - 1];
    const firstOutput = applyRule(baseNumber, firstRule, max);
    const firstResultPosition = resultPosition(sourcePosition, firstStage.nextN);
    const firstResult = history[firstResultPosition - 1];
    const firstBallPosition = firstPath.positionsOldestToNewest[traversalIndex];
    const firstActual = firstResult.numbers[firstBallPosition - 1];
    const firstEvidence = stageEvidence(
      firstStage,
      firstBallPosition,
      baseNumber,
      firstOutput,
      firstActual,
    );
    const common = {
      group: groupName(sourceSequenceIndex),
      sourcePosition,
      sourcePeriod: source.period,
      sourceNumbers: source.numbers,
      referenceOffset,
      referencePosition,
      referencePeriod: reference.period,
      referenceBallPosition,
      baseNumber,
      firstStage: firstEvidence,
    };
    firstRows.push({
      ...common,
      role: 'first-stage-evidence',
      resultPeriod: firstResult.period,
      resultNumbers: firstResult.numbers,
    });

    const finalDistance = firstStage.nextN + secondStage.nextN;
    const finalResultPosition = resultPosition(sourcePosition, finalDistance);
    const secondBallPosition = secondPath.positionsOldestToNewest[traversalIndex];
    const secondOutput = applyRule(firstOutput, secondRule, max);
    if (sourceSequenceIndex === 0) {
      const predictionDistance = 1 - finalResultPosition;
      predictionRow = {
        ...common,
        role: 'prediction',
        secondStage: stageEvidence(
          secondStage,
          secondBallPosition,
          firstOutput,
          secondOutput,
        ),
        resultPeriod: futurePeriod(history[0].period, predictionDistance),
        predictionDistance,
      };
      return;
    }
    const finalResult = history[finalResultPosition - 1];
    const secondActual = finalResult.numbers[secondBallPosition - 1];
    secondRows.push({
      ...common,
      role: 'second-stage-validation',
      secondStage: stageEvidence(
        secondStage,
        secondBallPosition,
        firstOutput,
        secondOutput,
        secondActual,
      ),
      resultPeriod: finalResult.period,
      resultNumbers: finalResult.numbers,
    });
  });
  return [...firstRows, ...secondRows, ...(predictionRow ? [predictionRow] : [])];
}

function twoStageCandidates(
  lottery: MatrixLottery,
  history: NormalizedDraw[],
  periodRange: 50 | 80,
  hitCondition: TiangongHitCondition,
  options: TiangongSearchOptions,
) {
  const length = hitCondition === '準2進3' ? 3 : 4;
  const max = maximum(lottery);
  const count = positionCount(lottery);
  const sequences = (options.sourceSequences
    ?? enumerateEqualSpacingSequences(periodRange, hitCondition))
    .filter((sequence) => sequence.length === length && sequence[sequence.length - 1] <= periodRange);
  const explorePaths = options.explorePaths ?? enumeratePositionPaths(count, length);
  const firstPaths = options.firstStagePaths ?? enumeratePositionPaths(count, length);
  const secondPaths = options.secondStagePaths ?? enumeratePositionPaths(count, length);
  const candidates: TiangongCandidate[] = [];

  for (const sourceSequence of sequences) {
    if (sourceSequence[sourceSequence.length - 1] > history.length) continue;
    const a = sourceSequence[0];
    const interval = sourceSequence[1] - a;
    const firstDistances = options.firstStageDistances
      ?? Array.from({ length: Math.max(0, a - 1) }, (_, index) => index + 1);
    const sourcePositionsOldestToNewest = [...sourceSequence].reverse();
    for (const n1 of firstDistances) {
      if (!Number.isInteger(n1) || n1 < 1 || n1 >= a) continue;
      const firstResultPositions = sourcePositionsOldestToNewest.map((position) => resultPosition(position, n1));
      if (firstResultPositions.some((position) => position < 1 || position > history.length)) continue;
      const secondDistances = options.secondStageDistances
        ?? Array.from(
          { length: Math.max(0, a + interval - Math.max(a, n1 + 1)) },
          (_, index) => Math.max(a, n1 + 1) - n1 + index,
        );
      for (const n2 of secondDistances) {
        const finalDistance = n1 + n2;
        if (!Number.isInteger(n2) || n2 < 1 || finalDistance < a || finalDistance >= a + interval) continue;
        const validationFinalPositions = sourcePositionsOldestToNewest
          .slice(0, -1)
          .map((position) => resultPosition(position, finalDistance));
        if (validationFinalPositions.some((position) => position < 1 || position > history.length)) continue;
        const offsets = referenceOffsets(
          sourcePositionsOldestToNewest,
          finalDistance,
          history.length,
          options.referenceOffsets,
        );
        for (const explorePath of explorePaths) {
          if (explorePath.positionsOldestToNewest.length !== length) continue;
          for (const firstPath of firstPaths) {
            if (firstPath.positionsOldestToNewest.length !== length) continue;
            for (const referenceOffset of offsets) {
              const firstPairs = sourcePositionsOldestToNewest.map((sourcePosition, index) => {
                const reference = history[sourcePosition + referenceOffset - 1];
                const firstResult = history[firstResultPositions[index] - 1];
                return {
                  base: reference.numbers[explorePath.positionsOldestToNewest[index] - 1],
                  target: firstResult.numbers[firstPath.positionsOldestToNewest[index] - 1],
                };
              });
              const firstRules = deriveTiangongRules(firstPairs[0].base, firstPairs[0].target, max)
                .filter((rule) => firstPairs.slice(1).every(({ base, target }) => (
                  applyRule(base, rule, max) === target
                )));
              for (const firstRule of firstRules) {
                const firstOutputs = firstPairs.map(({ base }) => applyRule(base, firstRule, max));
                for (const secondPath of secondPaths) {
                  if (secondPath.positionsOldestToNewest.length !== length) continue;
                  const secondPairs = sourcePositionsOldestToNewest.slice(0, -1).map((_, index) => {
                    const finalResult = history[validationFinalPositions[index] - 1];
                    return {
                      base: firstOutputs[index],
                      target: finalResult.numbers[secondPath.positionsOldestToNewest[index] - 1],
                    };
                  });
                  const secondRules = deriveTiangongRules(secondPairs[0].base, secondPairs[0].target, max)
                    .filter((rule) => secondPairs.slice(1).every(({ base, target }) => (
                      applyRule(base, rule, max) === target
                    )));
                  for (const secondRule of secondRules) {
                    const firstStage: TiangongStage = {
                      startPosition: firstPath.startPosition,
                      direction: firstPath.direction,
                      algorithmType: firstRule.algorithmType,
                      value: firstRule.value,
                      nextN: n1,
                    };
                    const secondStage: TiangongStage = {
                      startPosition: secondPath.startPosition,
                      direction: secondPath.direction,
                      algorithmType: secondRule.algorithmType,
                      value: secondRule.value,
                      nextN: n2,
                    };
                    const rows = twoStageEvidence(
                      history,
                      sourceSequence,
                      referenceOffset,
                      explorePath,
                      firstPath,
                      secondPath,
                      firstStage,
                      secondStage,
                      firstRule,
                      secondRule,
                      max,
                    );
                    candidates.push({
                      lottery,
                      periodRange,
                      sourceSequence,
                      mode: 'two-stage',
                      hitCondition,
                      exploreDirection: explorePath.direction,
                      baseNumber: firstPairs[firstPairs.length - 1].base,
                      firstStage,
                      secondStage,
                      validationRows: rows,
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  return candidates;
}

export function runTiangongCandidates(
  lottery: MatrixLottery,
  matrixHistory: MatrixDraw[],
  options: TiangongSearchOptions = {},
): TiangongCandidate[] {
  const history = normalizeHistory(lottery, matrixHistory);
  const periodRanges = options.periodRanges ?? [80];
  const modes = options.modes ?? ['one-stage', 'two-stage'];
  const hitConditions = options.hitConditions ?? ['準2進3', '準3進4'];
  const candidates: TiangongCandidate[] = [];
  if (modes.includes('one-stage')) {
    for (const periodRange of periodRanges) {
      for (const hitCondition of hitConditions) {
        candidates.push(...oneStageCandidates(lottery, history, periodRange, hitCondition, options));
      }
    }
  }
  if (modes.includes('two-stage')) {
    for (const periodRange of periodRanges) {
      for (const hitCondition of hitConditions) {
        candidates.push(...twoStageCandidates(lottery, history, periodRange, hitCondition, options));
      }
    }
  }
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const signature = candidateSignature(candidate);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}
