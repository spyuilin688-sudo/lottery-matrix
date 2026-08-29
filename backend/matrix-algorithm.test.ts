import { describe, expect, it } from 'vitest';
import {
  runMatrixAlgorithmWithHistory,
  runMatrixAutomaticExploreWithHistory,
  type MatrixDraw,
  type MatrixLottery,
} from './matrix-algorithm';

function draw(period: string, numbers: number[], lottery?: MatrixLottery): MatrixDraw {
  const values = numbers.map((value) => String(value).padStart(2, '0'));
  return {
    lottery,
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
  it('does not mix another lottery into source, reference, or prediction history', () => {
    const result = runMatrixAlgorithmWithHistory(request, [
      draw('A', [10, 20, 25, 30, 35], '今彩539'),
      draw('P1', [1, 2, 3, 4, 25], '今彩539'),
      draw('649', [1, 2, 3, 4, 5, 6, 7], '大樂透'),
      draw('S1', [10, 20, 25, 30, 35], '今彩539'),
    ]);

    expect(ruleSets(result)[0]?.historicalValidation[0]?.predictionPeriod).toBe('P1');
  });

  it('normalizes the automatic hit condition rule count', () => {
    const common = {
      lottery: '今彩539', numberOrder: '依號碼由小到大', explorePeriods: 2,
      algorithmType: '拖牌', exploreDateOffset: 0, exploreRange: '標準範圍',
      minPredictionDistance: 1, maxPredictionDistance: 1,
    } as const;

    expect(runMatrixAutomaticExploreWithHistory({
      ...common, hitCondition: '準4+（鎖定1碼）', ruleCount: 2,
    }, []).searchCondition.ruleCount).toBe(1);
    expect(runMatrixAutomaticExploreWithHistory({
      ...common, hitCondition: '準5+（鎖定2碼）', ruleCount: 1,
    }, []).searchCondition.ruleCount).toBe(2);
  });

  it('excludes the selected date itself from automatic lock sources', () => {
    const result = runMatrixAutomaticExploreWithHistory({
      lottery: '今彩539', numberOrder: '依號碼由小到大', explorePeriods: 2,
      algorithmType: '拖牌', hitCondition: '準4+（鎖定1碼）', ruleCount: 1,
      exploreDateOffset: 0, exploreRange: '標準範圍',
      minPredictionDistance: 1, maxPredictionDistance: 1,
    }, [
      draw('CURRENT', [15, 19, 21, 22, 23], '今彩539'),
      draw('A', [10, 24, 28, 35, 38], '今彩539'),
      draw('P4', [15, 14, 16, 17, 18], '今彩539'),
      draw('S4', [10, 23, 29, 33, 39], '今彩539'),
      draw('P3', [15, 9, 11, 12, 13], '今彩539'),
      draw('S3', [10, 22, 32, 34, 37], '今彩539'),
      draw('P2', [15, 5, 6, 7, 8], '今彩539'),
      draw('S2', [10, 21, 31, 36, 38], '今彩539'),
      draw('P1', [15, 1, 2, 3, 4], '今彩539'),
      draw('S1', [10, 20, 30, 35, 39], '今彩539'),
    ]);
    const lockedPeriods = result.results.map((item) => (
      item.searchCondition as { lockedSourcePeriod?: string }
    ).lockedSourcePeriod);

    expect(lockedPeriods).toContain('A');
    expect(lockedPeriods).not.toContain('CURRENT');
  });

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
      matchedRules: [{ algorithmType: '加減', value: 20, display: '+20' }],
    });
  });

  it('keeps the current source and reference draws for the final prediction block', () => {
    const history = [
      draw('A', [10, 20, 25, 30, 35]),
      draw('P1', [1, 2, 3, 4, 25]),
      draw('S1', [10, 20, 25, 30, 35]),
    ];

    const result = runMatrixAlgorithmWithHistory(request, history);

    expect(result.sourceA).toMatchObject({
      sourcePeriod: 'A',
      sourceSortedNumbers: ['10', '20', '25', '30', '35'],
      referencePeriod: 'A',
      referenceSortedNumbers: ['10', '20', '25', '30', '35'],
    });
  });

  it('does not use drag rules to rescue an invalid two-code add-subtract road', () => {
    const history = [
      draw('A', [10, 23, 32, 33, 34]),
      draw('P3', [1, 2, 3, 11, 12]),
      draw('S3', [10, 22, 32, 33, 34]),
      draw('P2', [4, 5, 6, 11, 12]),
      draw('S2', [10, 21, 32, 33, 34]),
      draw('P1', [7, 8, 9, 11, 12]),
      draw('S1', [10, 20, 32, 33, 34]),
    ];

    const result = runMatrixAlgorithmWithHistory({
      ...request,
      ruleCount: 2,
    }, history);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('規則上限為2條；若必須使用3條（含3條）以上才能覆蓋全部歷史驗證組，整筆版路無效，不得輸出');
    expect(result.highestStreak).toBe(3);
    expect(result.conflictingRules).toEqual([28, 29, 30]);
    expect(ruleSets(result)).toHaveLength(0);
  });

  it('keeps the full sum as the combine-road rule value', () => {
    const result = runMatrixAlgorithmWithHistory({
      ...request,
      algorithmType: '合值版路',
    }, [
      draw('A', [10, 35, 36, 37, 38]),
      draw('P1', [1, 2, 3, 4, 29]),
      draw('S1', [10, 30, 31, 32, 33]),
    ]);

    const combined59 = ruleSets(result).find((set) => set.rules[0]?.value === 59);

    expect(combined59?.rules).toEqual([{ algorithmType: '合值', value: 59, display: '59' }]);
    expect(combined59?.predictionNumbers).toEqual([24]);
  });
});
