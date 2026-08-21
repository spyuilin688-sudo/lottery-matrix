import { describe, expect, it } from 'vitest';
import type { MatrixDraw } from './matrix-algorithm';
import { evaluateTiangongCandidate } from './matrix-tiangong';
import {
  deriveTiangongRules,
  enumeratePositionPaths,
  enumerateReferencePositions,
  resultPosition,
  runTiangongCandidates,
  type PositionPath,
} from './matrix-tiangong-generator';

function draw(period: number, numbers: number[]): MatrixDraw {
  return {
    period: String(period),
    drawDate: '',
    numbers: numbers.map((value) => String(value).padStart(2, '0')),
  };
}

function oneStageHistory() {
  const history = Array.from({ length: 20 }, (_, index) => (
    draw(114233 - index, [30, 31, 32, 33, 34])
  ));
  const replace = (position: number, numbers: number[]) => {
    history[position - 1] = draw(114234 - position, numbers);
  };
  replace(19, [10, 21, 22, 23, 24]); // 114215 source C
  replace(14, [20, 15, 22, 23, 24]); // 114220 C result
  replace(12, [11, 21, 22, 23, 24]); // 114222 source B
  replace(7, [20, 16, 22, 23, 24]); // 114227 B result
  replace(5, [12, 21, 22, 23, 24]); // 114229 source A
  return history;
}

function twoStageHistory() {
  const history = Array.from({ length: 30 }, (_, index) => (
    draw(114233 - index, [1, 2, 3, 4, 5])
  ));
  const replace = (position: number, numbers: number[]) => {
    history[position - 1] = draw(114234 - position, numbers);
  };
  replace(22, [1, 24, 3, 4, 5]); // 114212 source C
  replace(18, [1, 2, 29, 4, 5]); // 114216 source B
  replace(14, [1, 2, 3, 28, 5]); // 114220 source A
  replace(13, [1, 2, 26, 4, 5]); // 114221 first-stage C
  replace(9, [1, 2, 3, 21, 5]); // 114225 first-stage B
  replace(5, [1, 2, 3, 4, 22]); // 114229 first-stage A
  replace(8, [1, 2, 3, 4, 38]); // 114226 second-stage C
  replace(4, [1, 2, 3, 4, 33]); // 114230 second-stage B
  return history;
}

function fourSourceTwoStageHistory() {
  const history = Array.from({ length: 24 }, (_, index) => (
    draw(114233 - index, [1, 2, 3, 4, 5])
  ));
  const replacePosition = (position: number, ballPosition: number, value: number) => {
    const current = history[position - 1].numbers.map(Number);
    current[ballPosition - 1] = value;
    history[position - 1] = draw(114234 - position, current);
  };
  [[18, 10], [14, 11], [10, 12], [6, 13]].forEach(([position, value]) => (
    replacePosition(position, 1, value)
  ));
  [[15, 15], [11, 16], [7, 17], [3, 18]].forEach(([position, value]) => (
    replacePosition(position, 2, value)
  ));
  [[11, 22], [7, 23], [3, 24]].forEach(([position, value]) => (
    replacePosition(position, 3, value)
  ));
  return history;
}

const fixed = (position: number, length: 3 | 4): PositionPath => ({
  startPosition: position,
  direction: '固定',
  positionsOldestToNewest: Array.from({ length }, () => position),
});

describe('Tiangong generator primitives', () => {
  it('maps d=7 sources to independent n1=5 result positions', () => {
    expect([19, 12, 5].map((position) => resultPosition(position, 5)))
      .toEqual([14, 7, 0]);
  });

  it('enumerates only position paths that stay inside the lottery', () => {
    expect(enumeratePositionPaths(5, 3)).toContainEqual({
      startPosition: 3,
      direction: '依序遞增',
      positionsOldestToNewest: [3, 4, 5],
    });
    expect(enumeratePositionPaths(5, 4)).not.toContainEqual(expect.objectContaining({
      positionsOldestToNewest: [3, 4, 5, 6],
    }));
  });

  it('reverse-derives only cyclic rules that produce the known target', () => {
    expect(deriveTiangongRules(24, 26, 39)).toEqual([
      { algorithmType: '加減', value: -37 },
      { algorithmType: '加減', value: 2 },
      { algorithmType: '加減', value: 41 },
      { algorithmType: '合值', value: 11 },
      { algorithmType: '合值', value: 50 },
      { algorithmType: '合值', value: 89 },
    ]);
  });

  it('keeps upper 1-14, same, and lower positions before the result', () => {
    expect(enumerateReferencePositions(5, 5, 20)).toEqual([
      6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
      5,
      4, 3, 2, 1,
    ]);
  });
});

describe('one-stage Tiangong production search', () => {
  it('validates two historical groups and applies the same rule to A', () => {
    const candidates = runTiangongCandidates('今彩539', oneStageHistory(), {
      periodRanges: [50],
      modes: ['one-stage'],
      hitConditions: ['準2進3'],
      sourceSequences: [[5, 12, 19]],
      referenceOffsets: [0],
      explorePaths: [fixed(1, 3)],
      firstStagePaths: [fixed(2, 3)],
      firstStageDistances: [5],
    });

    const candidate = candidates.find((item) => (
      item.firstStage.algorithmType === '加減' && item.firstStage.value === 5
    ));
    expect(candidate).toBeDefined();
    expect(evaluateTiangongCandidate(candidate!)).toMatchObject({
      valid: true,
      interval: 7,
      predictionDistance: 1,
      predictedPosition: 2,
      predictionNumber: '17',
    });
    expect(candidate!.validationRows.map((row) => [row.group, row.role, row.resultPeriod]))
      .toEqual([
        ['C', 'first-stage-evidence', '114220'],
        ['B', 'first-stage-evidence', '114227'],
        ['A', 'prediction', '114234'],
      ]);
  });

  it('does not retain a rule when a later validation group misses', () => {
    const history = oneStageHistory();
    history[6] = draw(114227, [20, 18, 22, 23, 24]);
    const candidates = runTiangongCandidates('今彩539', history, {
      periodRanges: [50],
      modes: ['one-stage'],
      hitConditions: ['準2進3'],
      sourceSequences: [[5, 12, 19]],
      referenceOffsets: [0],
      explorePaths: [fixed(1, 3)],
      firstStagePaths: [fixed(2, 3)],
      firstStageDistances: [5],
    });
    expect(candidates).toEqual([]);
  });
});

describe('two-stage Tiangong production search', () => {
  it('keeps d=4, n1=9, and n2=5 as independent dimensions', () => {
    const candidates = runTiangongCandidates('今彩539', twoStageHistory(), {
      periodRanges: [50],
      modes: ['two-stage'],
      hitConditions: ['準2進3'],
      sourceSequences: [[14, 18, 22]],
      referenceOffsets: [0],
      explorePaths: [{
        startPosition: 2,
        direction: '依序遞增',
        positionsOldestToNewest: [2, 3, 4],
      }],
      firstStagePaths: [{
        startPosition: 3,
        direction: '依序遞增',
        positionsOldestToNewest: [3, 4, 5],
      }],
      secondStagePaths: [fixed(5, 3)],
      firstStageDistances: [9],
      secondStageDistances: [5],
    });
    const candidate = candidates.find((item) => (
      item.firstStage.algorithmType === '合值'
      && item.firstStage.value === 50
      && item.secondStage?.algorithmType === '加減'
      && item.secondStage.value === 12
    ));

    expect(candidate).toBeDefined();
    expect(evaluateTiangongCandidate(candidate!)).toMatchObject({
      valid: true,
      interval: 4,
      predictionDistance: 1,
      predictedPosition: 5,
      predictionNumber: '34',
    });
    expect(candidate!.validationRows.filter((row) => row.role === 'first-stage-evidence')).toHaveLength(3);
    expect(candidate!.validationRows.filter((row) => row.role === 'second-stage-validation')).toHaveLength(2);
    expect(candidate!.validationRows.filter((row) => row.role === 'prediction')).toHaveLength(1);
    expect(candidate!.validationRows.filter((row) => row.role === 'prediction')[0].resultPeriod).toBe('114234');
  });

  it('uses four first-stage groups, three second-stage validations, and A for 準3進4 prediction', () => {
    const options = {
      periodRanges: [50] as Array<50 | 80>,
      modes: ['two-stage'] as const,
      hitConditions: ['準3進4'] as const,
      sourceSequences: [[6, 10, 14, 18]] as [[number, number, number, number]],
      referenceOffsets: [0],
      explorePaths: [fixed(1, 4)],
      firstStagePaths: [fixed(2, 4)],
      secondStagePaths: [fixed(3, 4)],
      firstStageDistances: [3],
      secondStageDistances: [4],
    };
    const candidates = runTiangongCandidates('今彩539', fourSourceTwoStageHistory(), options);
    const candidate = candidates.find((item) => (
      item.firstStage.algorithmType === '加減'
      && item.firstStage.value === 5
      && item.secondStage?.algorithmType === '加減'
      && item.secondStage.value === 7
    ));
    expect(candidate).toBeDefined();
    expect(candidate!.validationRows.filter((row) => row.role === 'first-stage-evidence')).toHaveLength(4);
    expect(candidate!.validationRows.filter((row) => row.role === 'second-stage-validation')).toHaveLength(3);
    expect(candidate!.validationRows.filter((row) => row.role === 'prediction')).toHaveLength(1);

    const changed = fourSourceTwoStageHistory();
    const numbers = changed[2].numbers.map(Number);
    numbers[1] = 19;
    changed[2] = draw(114231, numbers);
    expect(runTiangongCandidates('今彩539', changed, options)).toEqual([]);
  });
});
