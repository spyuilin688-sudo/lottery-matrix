import {
  deduplicateTiangongResults,
  evaluateTiangongCandidate,
  type TiangongCandidate,
} from './matrix-tiangong';

function base(overrides: Partial<TiangongCandidate> = {}): TiangongCandidate {
  return {
    lottery: '今彩539', periodRange: 50, sourceSequence: [1, 25, 49],
    mode: 'one-stage', hitCondition: '準2進3', exploreDirection: '固定',
    baseNumber: 1,
    firstStage: { startPosition: 2, direction: '固定', algorithmType: '加減', value: 49, nextN: 1 },
    validationRows: [], ...overrides,
  };
}

function summary(candidate: TiangongCandidate) {
  const result = evaluateTiangongCandidate(candidate);
  return {
    valid: result.valid,
    interval: result.interval,
    position: result.predictedPosition,
    prediction: result.predictionNumber,
    road: result.roadType,
  };
}

export function runTiangongAcceptanceCases() {
  const oneStage = base();
  const twoStage = base({
    periodRange: 80,
    sourceSequence: [1, 21, 41, 61],
    mode: 'two-stage',
    hitCondition: '準3進4',
    baseNumber: 10,
    firstStage: { startPosition: 1, direction: '依序遞增', algorithmType: '加減', value: 5, nextN: 1 },
    secondStage: { startPosition: 2, direction: '依序遞增', algorithmType: '合值', value: 30, nextN: 1 },
  });
  const drag = base({
    sourceSequence: [1, 2, 3], baseNumber: 39,
    firstStage: { startPosition: 5, direction: '依序遞減', algorithmType: '加減', value: 0, nextN: 1 },
  });
  const normalized = (lottery: TiangongCandidate['lottery'], baseNumber: number) =>
    evaluateTiangongCandidate(base({
      lottery, baseNumber,
      firstStage: { startPosition: 1, direction: '固定', algorithmType: '加減', value: 1, nextN: 1 },
    })).predictionNumber;
  const outOfRange = evaluateTiangongCandidate(base({
    sourceSequence: [5, 12, 19],
    firstStage: { startPosition: 1, direction: '固定', algorithmType: '加減', value: 1, nextN: 4 },
  }));
  const first = evaluateTiangongCandidate(base({ baseNumber: 10,
    firstStage: { startPosition: 1, direction: '固定', algorithmType: '加減', value: 5, nextN: 1 },
  }));
  const exactCopy = evaluateTiangongCandidate(base({ baseNumber: 10,
    firstStage: { startPosition: 1, direction: '固定', algorithmType: '加減', value: 5, nextN: 1 },
  }));
  const samePredictionDifferentIdentity = evaluateTiangongCandidate(base({ baseNumber: 10,
    firstStage: { startPosition: 1, direction: '固定', algorithmType: '合值', value: 25, nextN: 1 },
  }));

  const rows = [
    ['五十期一段式固定加減上界', summary(oneStage), { valid: true, interval: 24, position: 2, prediction: '11', road: '加減版路' }],
    ['八十期二段式遞增加減合值', summary(twoStage), { valid: true, interval: 20, position: 5, prediction: '15', road: '加減＋合值' }],
    ['遞減球位加零歸拖牌', summary(drag), { valid: true, interval: 1, position: 3, prediction: '39', road: '拖牌版路' }],
    ['今彩539標準化', normalized('今彩539', 39), '01'],
    ['天天樂標準化', normalized('天天樂', 39), '01'],
    ['六合彩標準化', normalized('六合彩', 49), '01'],
    ['大樂透標準化', normalized('大樂透', 49), '01'],
    ['預測結果未落在未來期', outOfRange.reason, 'PREDICTION_NOT_FUTURE'],
    ['完全相同結果去重', deduplicateTiangongResults([first, exactCopy]).length, 1],
    ['相同預測不同版路身分保留', deduplicateTiangongResults([first, samePredictionDifferentIdentity]).length, 2],
  ] as const;
  return rows.map(([name, actual, expected]) => ({
    name,
    actual,
    pass: JSON.stringify(actual) === JSON.stringify(expected),
  }));
}
