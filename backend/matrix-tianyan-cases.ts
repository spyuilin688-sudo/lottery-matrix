import type { TianyanAlgorithmType } from './matrix-tianyan';
import { calculateTianyanPrediction } from './matrix-tianyan';

export const TIANYAN_APPENDIX_EXPECTED = [
  ['案例1', ['03', '15']],
  ['案例2', ['03', '34']],
  ['案例3', ['03', '20']],
  ['案例4', ['07', '30']],
  ['案例5', ['19', '36']],
] as const;

type AppendixRule = {
  referenceOffset: -1 | 0;
  referencePosition: number;
  algorithmType: TianyanAlgorithmType;
  value: number;
  currentBaseNumber: number;
};

type AppendixHistory = {
  previous: number[];
  locked: number[];
  result: number[];
};

type AppendixCase = {
  name: string;
  rules: [AppendixRule, AppendixRule];
  history: AppendixHistory[];
};

// Appendix A is retained as executable source data. Its historical rows confirm
// the rule formulas and legal rule-pair shapes; contribution validation is tested
// independently because the appendix predates the row-level bothHit annotation.
export const TIANYAN_APPENDIX_CASES: AppendixCase[] = [
  {
    name: '案例1',
    rules: [
      { referenceOffset: -1, referencePosition: 1, algorithmType: '加減', value: 0, currentBaseNumber: 3 },
      { referenceOffset: -1, referencePosition: 2, algorithmType: '加減', value: 5, currentBaseNumber: 10 },
    ],
    history: [
      [[15,17,19,21,30],[7,13,25,26,29],[4,14,15,22,23]],
      [[3,7,14,21,22],[7,9,17,23,34],[3,5,8,12,30]],
      [[2,6,8,27,32],[7,15,18,23,33],[2,9,11,32,35]],
      [[6,23,24,25,31],[7,13,16,25,33],[6,8,13,28,38]],
      [[5,14,19,20,28],[7,12,22,26,30],[5,10,11,19,23]],
      [[2,8,24,29,36],[7,21,26,27,31],[2,13,16,26,34]],
    ].map(([previous, locked, result]) => ({ previous, locked, result })),
  },
  {
    name: '案例2',
    rules: [
      { referenceOffset: -1, referencePosition: 1, algorithmType: '加減', value: 0, currentBaseNumber: 3 },
      { referenceOffset: -1, referencePosition: 3, algorithmType: '合值', value: 62, currentBaseNumber: 28 },
    ],
    history: [
      [[15,17,18,21,30],[7,13,25,26,29],[4,14,15,22,23]],
      [[3,7,14,21,22],[7,9,17,23,34],[4,5,9,12,30]],
      [[2,6,8,27,32],[7,15,18,23,33],[1,9,15,32,35]],
      [[6,23,24,25,31],[7,13,16,25,33],[5,8,13,28,38]],
      [[5,14,19,20,28],[7,12,22,26,30],[5,10,11,19,23]],
      [[2,8,24,29,36],[7,21,26,27,31],[2,13,16,26,34]],
    ].map(([previous, locked, result]) => ({ previous, locked, result })),
  },
  {
    name: '案例3',
    rules: [
      { referenceOffset: -1, referencePosition: 1, algorithmType: '加減', value: 0, currentBaseNumber: 3 },
      { referenceOffset: 0, referencePosition: 2, algorithmType: '加減', value: 9, currentBaseNumber: 11 },
    ],
    history: [
      [[15,17,19,21,30],[7,13,25,26,29],[4,14,17,22,23]],
      [[3,7,14,21,22],[7,8,17,23,34],[3,5,8,18,30]],
      [[2,6,8,27,32],[7,15,18,23,33],[2,9,11,32,35]],
      [[6,23,24,25,31],[7,13,16,25,33],[6,8,13,28,38]],
      [[5,14,19,20,28],[7,12,22,26,30],[5,10,11,19,23]],
      [[2,8,24,29,36],[7,21,26,27,31],[8,13,16,30,34]],
    ].map(([previous, locked, result]) => ({ previous, locked, result })),
  },
  {
    name: '案例4',
    rules: [
      { referenceOffset: -1, referencePosition: 1, algorithmType: '合值', value: 33, currentBaseNumber: 3 },
      { referenceOffset: 0, referencePosition: 1, algorithmType: '加減', value: 0, currentBaseNumber: 7 },
    ],
    history: [
      [[15,17,19,21,30],[7,13,25,26,29],[4,14,18,22,23]],
      [[4,7,14,21,22],[7,9,17,23,34],[3,7,8,12,30]],
      [[2,6,8,27,32],[7,15,18,23,33],[7,9,11,32,35]],
      [[6,23,24,25,31],[7,13,16,25,33],[7,8,13,28,38]],
      [[5,14,19,20,28],[7,12,22,26,30],[7,10,11,19,23]],
      [[2,8,24,29,36],[7,21,26,27,31],[2,13,16,26,31]],
    ].map(([previous, locked, result]) => ({ previous, locked, result })),
  },
  {
    name: '案例5',
    rules: [
      { referenceOffset: -1, referencePosition: 4, algorithmType: '加減', value: 0, currentBaseNumber: 19 },
      { referenceOffset: -1, referencePosition: 4, algorithmType: '合值', value: 55, currentBaseNumber: 19 },
    ],
    history: [
      [[15,17,19,21,30],[7,13,25,26,29],[4,14,18,21,34]],
      [[4,7,14,21,22],[7,9,17,23,34],[3,7,8,21,30]],
      [[2,6,8,27,32],[7,15,18,23,33],[7,9,11,27,35]],
      [[6,23,24,25,31],[7,13,16,25,33],[7,8,13,25,38]],
      [[5,14,19,20,28],[7,12,22,26,30],[7,10,11,20,23]],
      [[2,8,24,29,36],[7,21,26,27,31],[2,13,16,26,31]],
    ].map(([previous, locked, result]) => ({ previous, locked, result })),
  },
];

function display(number: number) {
  return String(number).padStart(2, '0');
}

export function runTianyanAppendixCases() {
  return TIANYAN_APPENDIX_CASES.map((fixture, index) => {
    const actual = fixture.rules
      .map((rule) => calculateTianyanPrediction(rule.algorithmType, rule.currentBaseNumber, rule.value, 39))
      .filter((number, position, numbers) => numbers.indexOf(number) === position)
      .sort((left, right) => left - right)
      .map(display);
    const expected = [...TIANYAN_APPENDIX_EXPECTED[index][1]];
    return { name: fixture.name, expected, actual, pass: JSON.stringify(actual) === JSON.stringify(expected) };
  });
}
