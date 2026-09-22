// @vitest-environment jsdom
import { render } from '../../test/render-with-dialog';
import { beforeEach, expect, test, vi } from 'vitest';
import {
  ExploreValidationProcess,
  TianhengValidationProcess,
  TianyanValidationProcess,
} from '../features/MatrixValidation';
import { TiangongValidationProcess } from '../features/MatrixTiangongPage';

const lotteryApi = vi.hoisted(() => ({
  fetchLotteryHistoryPeriods: vi.fn(() => new Promise(() => {})),
}));

vi.mock('../lottery-api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lottery-api')>(),
  fetchLotteryHistoryPeriods: lotteryApi.fetchLotteryHistoryPeriods,
}));

const lotteries = ['今彩539', '天天樂', '六合彩', '大樂透'] as const;

beforeEach(() => {
  document.body.innerHTML = '';
  lotteryApi.fetchLotteryHistoryPeriods.mockClear();
});

function numbers(lottery: typeof lotteries[number]) {
  return lottery === '六合彩' || lottery === '大樂透'
    ? ['01', '02', '03', '04', '05', '06', '07']
    : ['01', '02', '03', '04', '05'];
}

function groupFirstPeriods(container: HTMLElement) {
  return [...container.querySelectorAll('.explore-validation-group')].map(
    (group) => group.querySelector('.explore-validation-issue')?.textContent ?? '',
  );
}

function exploreValidation(lottery: typeof lotteries[number]) {
  const values = numbers(lottery);
  const row = (group: string, sourcePeriod: string, predictionPeriod: string) => ({
    group,
    sourcePeriod,
    sourceNumbers: values,
    sourceSortedNumbers: values,
    sourceDrawOrderNumbers: values,
    referencePeriod: sourcePeriod,
    referenceNumbers: values,
    referenceSortedNumbers: values,
    referenceDrawOrderNumbers: values,
    baseNumber: 1,
    predictionPeriod,
    predictionNumbers: values,
    candidateRules: [0],
    matchedRules: [{ value: 0, display: '+0', algorithmType: '拖牌' }],
    hitNumbers: [1],
    success: true,
  });
  return {
    itemId: 'explore-order',
    ruleSets: [{
      rules: [{ value: 0, display: '+0', algorithmType: '拖牌' }],
      predictionNumbers: [1],
      historicalValidation: [
        row('new', '300', '301'),
        row('old', '100', '101'),
      ],
    }],
  };
}

function tianhengValidation(lottery: typeof lotteries[number]) {
  const values = numbers(lottery);
  const row = (group: string, sourcePeriod: string, predictionPeriod: string) => ({
    group,
    sourcePeriod,
    sourceNumbers: values,
    sourceSortedNumbers: values,
    sourceDrawOrderNumbers: values,
    lockedPositions: [1, 2],
    lockedNumbers: [1, 2],
    referencePeriod: sourcePeriod,
    referenceNumbers: values,
    referenceSortedNumbers: values,
    referenceDrawOrderNumbers: values,
    baseNumber: 1,
    predictionPeriod,
    predictionNumbers: values,
    candidateRules: [0],
    matchedRules: [{ value: 0, display: '+0', algorithmType: '拖牌' }],
    hitNumbers: [1],
    success: true,
  });
  return {
    itemId: 'tianheng-order',
    ruleSets: [{
      rules: [{ value: 0, display: '+0', algorithmType: '拖牌' }],
      predictionNumbers: [1],
      historicalValidation: [
        row('new', '300', '301'),
        row('old', '100', '101'),
      ],
    }],
  };
}

function tianyanValidation(lottery: typeof lotteries[number]) {
  const values = numbers(lottery).map(Number);
  const historical = (group: string, sourcePeriod: string, predictionPeriod: string) => ({
    group,
    sourcePeriod,
    sourceNumbers: values,
    lockedPosition: 1,
    lockedNumber: 1,
    predictionPeriod,
    predictionNumbers: values,
    rule1: {
      validationPeriodOffset: -1,
      validationPeriod: sourcePeriod,
      validationPosition: 1,
      baseNumber: 1,
      algorithmType: '加減',
      candidateValues: [1],
      ruleValue: 1,
      calculationResult: 2,
      hit: true,
    },
    rule2: {
      validationPeriodOffset: -2,
      validationPeriod: sourcePeriod,
      validationPosition: 2,
      baseNumber: 2,
      algorithmType: '合值',
      candidateValues: [3],
      ruleValue: 3,
      calculationResult: 1,
      hit: false,
    },
    hitType: 'rule1Only',
    hitNumbers: [2],
    success: true,
  });
  return {
    itemId: 'tianyan-order',
    sourceA: {
      sourcePeriod: '400',
      sourceNumbers: values,
      lockedPosition: 1,
      lockedNumber: 1,
      predictionDistance: 1,
    },
    rules: [
      {
        id: 'r1',
        validationPeriodOffset: -1,
        validationPeriod: '399',
        validationPosition: 1,
        referenceOffset: -1,
        referencePosition: 1,
        algorithmType: '加減',
        value: 1,
        ruleValue: 1,
        currentBaseNumber: 1,
        currentPredictionNumber: 2,
      },
      {
        id: 'r2',
        validationPeriodOffset: -2,
        validationPeriod: '398',
        validationPosition: 2,
        referenceOffset: -2,
        referencePosition: 2,
        algorithmType: '合值',
        value: 3,
        ruleValue: 3,
        currentBaseNumber: 2,
        currentPredictionNumber: 1,
      },
    ],
    groupCount: 2,
    minimumIndependentHits: 1,
    rule1Only: 2,
    rule2Only: 0,
    bothHit: 0,
    mergedSearchPredictionNumbers: ['02'],
    historicalValidation: [
      historical('new', '300', '301'),
      historical('old', '100', '101'),
    ],
  };
}

function tiangongValidation(lottery: typeof lotteries[number]) {
  const values = numbers(lottery).map(Number);
  const stage = (period: string, position = 1) => ({
    period,
    position,
    number: String(values[position - 1] ?? 1).padStart(2, '0'),
    numbers: values,
    calculated_number: String(values[position - 1] ?? 1).padStart(2, '0'),
    actual_number: String(values[position - 1] ?? 1).padStart(2, '0'),
    matched: true,
  });
  const group = (name: 'A' | 'B' | 'C', prefix: string) => ({
    group: name,
    role: name === 'A' ? 'prediction' : 'validation',
    source: stage(prefix + '1', 1),
    stage1: stage(prefix + '2', 2),
    stage2: stage(prefix + '3', 3),
  });
  return {
    itemId: 'tiangong-order',
    evidence: {
      rows: [
        group('A', '300'),
        group('C', '100'),
        group('B', '200'),
      ],
      d_exclusion: { status: 'breaks_at_stage1' },
    },
  };
}

test.each(lotteries)('Matrix 探索 %s 驗證歷史組固定舊期在上、新期在下', (lottery) => {
  const view = render(
    <ExploreValidationProcess
      item={{
        number: '01',
        position: 1,
        predictionPeriod: 1,
        consecutive: '準5進6',
        algorithmType: '拖牌',
      }}
      lottery={lottery}
      validation={exploreValidation(lottery) as any}
      loading={false}
    />,
  );
  expect(groupFirstPeriods(view.container)).toEqual(['100', '300']);
});

test.each(lotteries)('Matrix 天衡 %s 驗證歷史組固定舊期在上、新期在下', (lottery) => {
  const item = {
    firstNumber: '01',
    firstLockedPosition: 1,
    secondNumber: '02',
    secondLockedPosition: 2,
    predictionDistance: 1,
    consecutive: '準5進6',
    predictionNumbers: ['01'],
    algorithmType: '拖牌',
    numberOrder: '依號碼由小到大排序',
    explorePeriods: 3,
    exploreDateOffset: 0,
    ruleCount: 1,
  };
  const view = render(
    <TianhengValidationProcess
      item={item as any}
      lottery={lottery}
      validation={tianhengValidation(lottery) as any}
      loading={false}
      algorithmName="天衡"
    />,
  );
  expect(groupFirstPeriods(view.container)).toEqual(['100', '300']);
});

test.each(lotteries)('Matrix 天樞 %s 驗證歷史組固定舊期在上、新期在下', (lottery) => {
  const item = {
    firstNumber: '01',
    firstLockedPosition: 1,
    secondNumber: '02',
    secondLockedPosition: 2,
    thirdNumber: '03',
    thirdLockedPosition: 3,
    predictionDistance: 1,
    consecutive: '準5進6',
    predictionNumbers: ['01'],
    algorithmType: '拖牌',
    numberOrder: '依號碼由小到大排序',
    explorePeriods: 3,
    exploreDateOffset: 0,
    ruleCount: 1,
  };
  const view = render(
    <TianhengValidationProcess
      item={item as any}
      lottery={lottery}
      validation={tianhengValidation(lottery) as any}
      loading={false}
      algorithmName="天樞"
    />,
  );
  expect(groupFirstPeriods(view.container)).toEqual(['100', '300']);
});

test.each(lotteries)('Matrix 天衍 %s 驗證歷史組固定舊期在上、新期在下', (lottery) => {
  const view = render(
    <TianyanValidationProcess
      item={{
        number: '01',
        position: 1,
        predictionPeriod: 1,
        numberOrder: '依號碼由小到大排序',
      }}
      lottery={lottery}
      validation={tianyanValidation(lottery) as any}
      loading={false}
    />,
  );
  expect(groupFirstPeriods(view.container).slice(0, 2)).toEqual(['100', '300']);
});

test.each(lotteries)('Matrix 天工 %s 驗證歷史組固定 C、B、A，也就是舊期在上、新期在下', (lottery) => {
  const view = render(
    <TiangongValidationProcess
      lottery={lottery}
      validation={tiangongValidation(lottery) as any}
      loading={false}
    />,
  );
  expect(groupFirstPeriods(view.container)).toEqual(['1001', '2001', '3001']);
});
