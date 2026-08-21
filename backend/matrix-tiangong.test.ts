import { describe, expect, it } from 'vitest';
import {
  enumerateEqualSpacingSequences,
  evaluateTiangongCandidate,
  type TiangongCandidate,
} from './matrix-tiangong';

function candidate(overrides: Partial<TiangongCandidate> = {}): TiangongCandidate {
  return {
    lottery: '今彩539',
    periodRange: 50,
    sourceSequence: [1, 3, 5],
    mode: 'one-stage',
    hitCondition: '準2進3',
    exploreDirection: '固定',
    baseNumber: 10,
    firstStage: {
      startPosition: 1,
      direction: '固定',
      algorithmType: '加減',
      value: 5,
      nextN: 2,
    },
    validationRows: [],
    ...overrides,
  };
}

describe('enumerateEqualSpacingSequences', () => {
  it('enumerates complete three-source sequences for 準2進3', () => {
    const fifty = enumerateEqualSpacingSequences(50, '準2進3');
    expect(fifty).toContainEqual([1, 25, 49]);
    expect(fifty).not.toContainEqual([1, 26, 51]);
    expect(enumerateEqualSpacingSequences(80, '準2進3').every(([a, b, c]) => b - a === c - b && c <= 80)).toBe(true);
  });

  it('enumerates complete four-source sequences for 準3進4', () => {
    const fifty = enumerateEqualSpacingSequences(50, '準3進4');
    expect(fifty).toContainEqual([1, 8, 15, 22]);
    expect(fifty).not.toContainEqual([1, 18, 35, 52]);
  });

  it('rejects exploration ranges other than fifty or eighty periods', () => {
    expect(() => enumerateEqualSpacingSequences(49 as 50, '準2進3')).toThrow('INVALID_PERIOD_RANGE');
  });
});

describe('evaluateTiangongCandidate', () => {
  it('rejects a caller-supplied non-equal-spacing source sequence', () => {
    expect(evaluateTiangongCandidate(candidate({ sourceSequence: [1, 3, 6] })).reason).toBe('INVALID_SOURCE_SEQUENCE');
  });

  it('requires a source count matching the hit condition', () => {
    expect(evaluateTiangongCandidate(candidate({ hitCondition: '準3進4' })).reason).toBe('INVALID_SOURCE_SEQUENCE');
  });

  it('derives one-stage prediction distance independently from source spacing', () => {
    const result = evaluateTiangongCandidate(candidate({
      sourceSequence: [5, 12, 19],
      firstStage: { startPosition: 1, direction: '固定', algorithmType: '加減', value: 2, nextN: 5 },
    }));
    expect(result).toMatchObject({ valid: true, interval: 7, predictionDistance: 1 });
  });

  it('derives two-stage prediction distance without equating the stage sum to source spacing', () => {
    const result = evaluateTiangongCandidate(candidate({
      sourceSequence: [14, 18, 22],
      mode: 'two-stage',
      firstStage: { startPosition: 1, direction: '固定', algorithmType: '加減', value: 2, nextN: 9 },
      secondStage: { startPosition: 1, direction: '固定', algorithmType: '加減', value: 3, nextN: 5 },
    }));
    expect(result).toMatchObject({ valid: true, interval: 4, predictionDistance: 1 });
  });

  it('classifies arithmetic +0 as drag instead of add/subtract', () => {
    const result = evaluateTiangongCandidate(candidate({
      firstStage: { startPosition: 1, direction: '固定', algorithmType: '加減', value: 0, nextN: 1 },
    }));
    expect(result).toMatchObject({ valid: true, roadType: '拖牌版路', predictionNumber: '10' });
  });

  it.each([
    ['加減', 49, true], ['加減', -49, true], ['加減', 50, false], ['加減', -50, false],
    ['合值', 1, true], ['合值', 98, true], ['合值', 0, false], ['合值', 99, false],
  ] as const)('enforces the %s rule boundary %s', (algorithmType, value, valid) => {
    expect(evaluateTiangongCandidate(candidate({
      firstStage: { startPosition: 1, direction: '固定', algorithmType, value, nextN: 1 },
    })).valid).toBe(valid);
  });

  it('normalizes predictions to each lottery number range', () => {
    expect(evaluateTiangongCandidate(candidate({ lottery: '今彩539', baseNumber: 39 })).predictionNumber).toBe('05');
    expect(evaluateTiangongCandidate(candidate({ lottery: '六合彩', baseNumber: 49 })).predictionNumber).toBe('05');
  });

  it.each([
    ['固定', 2, 2],
    ['依序遞增', 1, 3],
    ['依序遞減', 5, 3],
  ] as const)('preserves %s position direction for 2→3', (direction, startPosition, predictedPosition) => {
    const result = evaluateTiangongCandidate(candidate({
      firstStage: { startPosition, direction, algorithmType: '加減', value: 1, nextN: 1 },
    }));
    expect(result.predictedPosition).toBe(predictedPosition);
  });

  it('uses the fourth position for 3→4 validation', () => {
    const result = evaluateTiangongCandidate(candidate({
      hitCondition: '準3進4',
      sourceSequence: [1, 3, 5, 7],
      firstStage: { startPosition: 1, direction: '依序遞增', algorithmType: '加減', value: 1, nextN: 1 },
    }));
    expect(result.predictedPosition).toBe(4);
  });

  it('applies two stages in order and exposes the combined road identity', () => {
    const result = evaluateTiangongCandidate(candidate({
      mode: 'two-stage',
      firstStage: { startPosition: 1, direction: '固定', algorithmType: '加減', value: 5, nextN: 1 },
      secondStage: { startPosition: 2, direction: '固定', algorithmType: '合值', value: 30, nextN: 1 },
    }));
    expect(result).toMatchObject({
      valid: true,
      predictionNumber: '15',
      predictedPosition: 2,
      roadType: '加減＋合值',
      stageCount: 2,
    });
  });

  it('omits second-stage output in one-stage mode', () => {
    expect(evaluateTiangongCandidate(candidate())).not.toHaveProperty('secondStage');
  });

  it('rejects a candidate whose result is not in a future period', () => {
    expect(evaluateTiangongCandidate(candidate({
      sourceSequence: [5, 12, 19],
      firstStage: { startPosition: 1, direction: '固定', algorithmType: '加減', value: 1, nextN: 4 },
    })).reason).toBe('PREDICTION_NOT_FUTURE');
  });
});
