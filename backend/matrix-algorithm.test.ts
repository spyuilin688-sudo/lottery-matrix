import { describe, expect, it } from 'vitest';
import { runMatrixAlgorithmWithHistory, type MatrixDraw } from './matrix-algorithm';

function draw(period: string, numbers: number[]): MatrixDraw {
  const values = numbers.map((value) => String(value).padStart(2, '0'));
  return {
    period,
    drawDate: '',
    numbers: values,
    sortedNumbers: values,
    drawOrderNumbers: values,
  };
}

const request = {
  lottery: '今彩539',
  numberOrder: '依號碼由小到大',
  lockedPosition: 1,
  lockedNumber: 10,
  referenceOffset: 0,
  referencePosition: 2,
  predictionDistance: 1,
  ruleCount: 1,
  algorithmType: '加減版路',
} as const;

function ruleSets(result: ReturnType<typeof runMatrixAlgorithmWithHistory>) {
  return result.results ?? result.ruleSets ?? [];
}

describe('Matrix Explore algorithm invariants', () => {
  it('+0 is emitted as drag and never as arithmetic', () => {
    const history = [
      draw('A', [10, 20, 25, 30, 35]),
      draw('P1', [1, 2, 3, 4, 20]),
      draw('S1', [10, 20, 25, 30, 35]),
    ];

    const result = runMatrixAlgorithmWithHistory(request, history);
    const zeroRules = ruleSets(result)
      .flatMap((set) => set.rules)
      .filter((rule) => rule.value === 0);

    expect(zeroRules.map((rule) => rule.algorithmType)).toEqual(['拖牌']);
  });

  it('stops validation at thirteen historical groups', () => {
    const chronological: MatrixDraw[] = [];
    for (let index = 1; index <= 14; index += 1) {
      chronological.push(draw(`S${index}`, [10, 20, 25, 30, 35]));
      chronological.push(draw(`P${index}`, [1, 2, 3, 4, 25]));
    }
    chronological.push(draw('A', [10, 20, 25, 30, 35]));

    const result = runMatrixAlgorithmWithHistory(request, [...chronological].reverse());

    expect(result.highestStreak).toBe(13);
    expect(ruleSets(result)[0]?.historicalValidation).toHaveLength(13);
  });

  it('does not include the current result period in historical validation', () => {
    const history = [
      draw('CURRENT_RESULT', [1, 2, 3, 4, 25]),
      draw('A', [10, 20, 25, 30, 35]),
      draw('P1', [1, 2, 3, 4, 25]),
      draw('S1', [10, 20, 25, 30, 35]),
    ];

    const result = runMatrixAlgorithmWithHistory(request, history);
    const validationPeriods = ruleSets(result)
      .flatMap((set) => set.historicalValidation)
      .map((row) => row.predictionPeriod);

    expect(result.sourceA?.predictionPeriod).toBe('CURRENT_RESULT');
    expect(validationPeriods).not.toContain('CURRENT_RESULT');
  });

  it('keeps the full source, reference and prediction draws in validation', () => {
    const history = [
      draw('A', [10, 20, 25, 30, 35]),
      draw('P1', [1, 2, 3, 4, 25]),
      draw('S1', [10, 20, 25, 30, 35]),
    ];

    const row = ruleSets(runMatrixAlgorithmWithHistory(request, history))[0]
      ?.historicalValidation[0];

    expect(row).toMatchObject({
      sourceSortedNumbers: ['10', '20', '25', '30', '35'],
      referenceSortedNumbers: ['10', '20', '25', '30', '35'],
      predictionNumbers: ['01', '02', '03', '04', '25'],
    });
  });
});
