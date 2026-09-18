import { describe, expect, it } from 'vitest';
import { evaluateTianyanCandidate, type TianyanCandidate } from './matrix-tianyan';

function candidate(hitPairs: Array<[boolean, boolean]>): TianyanCandidate {
  return {
    lottery: '今彩539',
    rules: [
      { id: 'r1', referenceOffset: -1, referencePosition: 1, algorithmType: '加減', value: 0, currentBaseNumber: 3 },
      { id: 'r2', referenceOffset: -1, referencePosition: 2, algorithmType: '加減', value: 5, currentBaseNumber: 10 },
    ],
    groups: hitPairs.map(([rule1Hit, rule2Hit], index) => ({
      id: `g${index + 1}`,
      sourcePeriod: String(100 + index),
      predictionPeriod: String(101 + index),
      predictionNumbers: [],
      rule1: { baseNumber: 1, predictionNumber: 1, hit: rule1Hit },
      rule2: { baseNumber: 2, predictionNumber: 2, hit: rule2Hit },
    })),
  };
}

describe('evaluateTianyanCandidate', () => {
  it('does not count bothHit as independent contribution', () => {
    expect(evaluateTianyanCandidate(candidate(Array(6).fill([true, true]))).valid).toBe(false);
  });

  it('requires ceil of thirty percent for each rule', () => {
    const input = candidate([
      [true, false], [true, false],
      [false, true], [false, true],
      ...Array(6).fill([true, true]),
    ]);
    const result = evaluateTianyanCandidate(input);
    expect(result.minimumIndependentHits).toBe(3);
    expect(result.valid).toBe(false);
  });

  it('rejects a group missed by both rules', () => {
    expect(evaluateTianyanCandidate(candidate([
      [true, false], [true, false], [true, false],
      [false, true], [false, true], [false, true],
      [false, false],
    ])).valid).toBe(false);
  });

  it('rejects the same validation position and algorithm', () => {
    const input = candidate([[true, false], [false, true], [true, false], [false, true]]);
    input.rules[1] = { ...input.rules[1], referencePosition: 1 };
    expect(evaluateTianyanCandidate(input).reason).toBe('SAME_POSITION_AND_ALGORITHM');
  });

  it('retains two rule identities when both predict the same number', () => {
    const input = candidate([[true, false], [false, true], [true, false], [false, true]]);
    input.rules[1] = { ...input.rules[1], algorithmType: '合值', value: 13, currentBaseNumber: 10 };
    const result = evaluateTianyanCandidate(input);
    expect(result.valid).toBe(true);
    expect(result.predictionNumbers).toEqual(['03']);
    expect(result.rules).toHaveLength(2);
  });

  it('rejects more than two merged predictions', () => {
    const input = candidate([[true, false], [false, true], [true, false], [false, true]]);
    input.rules[0] = { ...input.rules[0], currentPredictionNumbers: [3, 4] };
    input.rules[1] = { ...input.rules[1], currentPredictionNumbers: [15] };
    expect(evaluateTianyanCandidate(input).reason).toBe('TOO_MANY_PREDICTIONS');
  });

  it('validates at most thirty completed groups', () => {
    const hits = Array.from({ length: 31 }, (_, index) => index % 2 === 0
      ? [true, false] as [boolean, boolean]
      : [false, true] as [boolean, boolean]);
    expect(evaluateTianyanCandidate(candidate(hits)).groupCount).toBe(30);
  });
});
