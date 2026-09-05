// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { MatrixExplorePage } from '../FeaturePages';

const matrixApi = vi.hoisted(() => ({
  fetchExploreList: vi.fn(),
  fetchExploreValidation: vi.fn(),
  fetchTianyanList: vi.fn(),
  fetchTianyanValidation: vi.fn(),
}));
vi.mock('../matrix-algorithm-api', () => matrixApi);

const envelope = {
  kind: 'tianyan', lottery: '今彩539', drawPeriod: '114000123', analysisVersion: '114000123:v1', status: 'complete', total: 1,
  duplicateStats: [{ number: '14', count: 3 }, { number: '27', count: 2 }],
  items: [{
    id: 'tianyan-api-1', number: '07', lockedPosition: 1, predictionDistance: 1,
    consecutive: '準11進12', highestStreak: 11, predictionNumbers: ['14', '27'],
    roadType: '複合', roadTypeLabel: '加減合值', hitCondition: '準5+（鎖定2碼）',
    numberOrder: '依號碼由小到大排序', ruleIds: ['r1', 'r2'],
  }],
} as const;

const validation = {
  itemId: 'tianyan-api-1',
  sourceA: { sourcePeriod: '114000130', sourceNumbers: [7, 11, 15, 22, 30], lockedPosition: 1, lockedNumber: 7, predictionDistance: 1 },
  rules: [
    { id: 'r1', validationPeriodOffset: -1, validationPeriod: '114000129', validationPosition: 2, referenceOffset: -1, referencePosition: 2, algorithmType: '加減', value: 3, ruleValue: 3, currentBaseNumber: 11, currentPredictionNumber: 14 },
    { id: 'r2', validationPeriodOffset: -2, validationPeriod: '114000128', validationPosition: 4, referenceOffset: -2, referencePosition: 4, algorithmType: '合值', value: 5, ruleValue: 5, currentBaseNumber: 22, currentPredictionNumber: 27 },
  ],
  groupCount: 11, minimumIndependentHits: 4, rule1Only: 4, rule2Only: 4, bothHit: 3,
  mergedSearchPredictionNumbers: ['14', '27'],
  historicalValidation: [{
    group: '1', sourcePeriod: '114000120', sourceNumbers: [7, 11, 15, 22, 30], lockedPosition: 1, lockedNumber: 7,
    predictionPeriod: '114000123', predictionNumbers: [14, 18, 27, 31, 35],
    rule1: { validationPeriodOffset: -1, validationPeriod: '114000119', validationPosition: 2, baseNumber: 11, algorithmType: '加減', candidateValues: [3], ruleValue: 3, calculationResult: 14, hit: true },
    rule2: { validationPeriodOffset: -2, validationPeriod: '114000118', validationPosition: 4, baseNumber: 22, algorithmType: '合值', candidateValues: [5], ruleValue: 5, calculationResult: 27, hit: true },
    hitType: 'bothHit', hitNumbers: [14, 27], success: true,
  }],
} as const;

beforeEach(() => {
  document.body.innerHTML = '';
  matrixApi.fetchTianyanList.mockReset().mockResolvedValue(envelope);
  matrixApi.fetchTianyanValidation.mockReset().mockResolvedValue({ ...envelope, itemId: 'tianyan-api-1', validation });
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ records: [] }) }) as typeof fetch;
});

test('天衍移除近10期開獎號碼', () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);
  expect(screen.queryByText('近10期開獎號碼')).toBeNull();
});

test('天衍修改彩種但未開始探索時，原結果及補充排版使用的彩種保持不變', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  fireEvent.click(await screen.findByRole('button', { name: /展開版路/ }));
  const region = await screen.findByRole('region', { name: '天衍驗證過程' });
  const before = region.innerHTML;
  fireEvent.change(screen.getByRole('combobox', { name: '彩種' }), { target: { value: '六合彩' } });
  expect(region.innerHTML).toBe(before);
  expect(region.getAttribute('data-lottery')).toBe('今彩539');
  expect(matrixApi.fetchTianyanList).toHaveBeenCalledTimes(1);
});

test('天衍連準篩選固定為指定五項', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  expect(await screen.findByText('14.27')).toBeTruthy();
  expect(matrixApi.fetchTianyanList).toHaveBeenCalledWith({
    lottery: '今彩539', exploreDateOffset: 0,
    selectedStreaks: ['準11進12', '準14進15', '準15進16', '準16進17', '準17進18'],
    sameCode: false,
  });
  fireEvent.click(screen.getByRole('button', { name: /連準篩選/ }));
  for (const label of ['準11進12', '準14進15', '準15進16', '準16進17', '準17進18']) {
    expect(screen.getByRole('button', { name: label })).toBeTruthy();
  }
  expect(screen.queryByRole('button', { name: '準5進6' })).toBeNull();
});

test('天衍重複號碼統計比照 Matrix 探索，可點號碼進行版路篩選', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

  const stat = await screen.findByRole('button', { name: '篩選預測號碼 14，3次' });
  fireEvent.click(stat);

  await waitFor(() => expect(matrixApi.fetchTianyanList).toHaveBeenLastCalledWith({
    lottery: '今彩539', exploreDateOffset: 0,
    selectedStreaks: ['準11進12', '準14進15', '準15進16', '準16進17', '準17進18'],
    sameCode: false,
    predictionNumber: '14',
  }));
  expect(screen.getByRole('button', { name: '篩選預測號碼 14，3次' }).getAttribute('aria-pressed')).toBe('true');
});

test('天衍同碼篩選比照 Matrix 探索送出相同篩選規則', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  await screen.findByText('14.27');

  fireEvent.click(screen.getByRole('button', { name: '同碼' }));

  await waitFor(() => expect(matrixApi.fetchTianyanList).toHaveBeenLastCalledWith({
    lottery: '今彩539', exploreDateOffset: 0,
    selectedStreaks: ['準11進12', '準14進15', '準15進16', '準16進17', '準17進18'],
    sameCode: true,
  }));
});

test('天衍結果依兩條規則分類並保留 Matrix 探索欄位呈現', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  expect(await screen.findByText('加減合值')).toBeTruthy();
  expect(screen.getByText('順球')).toBeTruthy();
});

test('天衍驗證右欄第一列與第二列分別顯示兩條公式', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  fireEvent.click(await screen.findByRole('button', { name: /展開版路/ }));
  const region = await screen.findByRole('region', { name: '天衍驗證過程' });
  const group = region.querySelector('.explore-validation-group');
  expect(group).toBeTruthy();
  const formulas = group?.querySelectorAll('.explore-validation-formula-row') ?? [];
  expect(formulas.length).toBe(3);
  expect(formulas[0]?.textContent?.replace(/\s/g, '')).toContain('第2顆11+3=14');
  expect(formulas[1]?.textContent?.replace(/\s/g, '')).toContain('第4顆22合值5=27');
  expect(formulas[2]?.textContent?.replace(/\s/g, '')).toContain('14、27');
  expect(group?.querySelector('.explore-validation-issue')?.textContent).toBe('114120');
});

test('天衍版路摘要以兩列呈現鎖定條件與兩條規則', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  fireEvent.click(await screen.findByRole('button', { name: /展開版路/ }));

  const region = await screen.findByRole('region', { name: '天衍驗證過程' });
  const summaryRows = [...region.querySelectorAll('.tianyan-validation-summary-row')]
    .map((row) => row.textContent?.replace(/\s/g, ''));

  expect(summaryRows).toEqual([
    '開07第1顆｜下1期開｜準11進12',
    '上1期第2顆+3｜上2期第4顆合值5',
  ]);
});

test('天衍兩組共同值的版路摘要可呈現四列', async () => {
  matrixApi.fetchTianyanValidation.mockResolvedValue({
    ...envelope,
    itemId: 'tianyan-api-1',
    validation: {
      ...validation,
      rules: [
        ...validation.rules,
        { ...validation.rules[0], id: 'r3', referenceOffset: 3, referencePosition: 1, ruleValue: 7, value: 7 },
        { ...validation.rules[1], id: 'r4', referenceOffset: 0, referencePosition: 5, algorithmType: '拖牌', ruleValue: 9, value: 9 },
      ],
    },
  });
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  fireEvent.click(await screen.findByRole('button', { name: /展開版路/ }));

  const region = await screen.findByRole('region', { name: '天衍驗證過程' });
  const summaryRows = [...region.querySelectorAll('.tianyan-validation-summary-row')]
    .map((row) => row.textContent?.replace(/\s/g, ''));

  expect(summaryRows).toHaveLength(4);
  expect(summaryRows[2]).toBe('開07第1顆｜下1期開｜準11進12');
  expect(summaryRows[3]).toBe('下3期第1顆+7｜同期第5顆拖牌9');
});

test('未登入時維持既有登入提示', async () => {
  matrixApi.fetchTianyanList.mockRejectedValue({ code: 'AUTH_REQUIRED' });
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  expect((await screen.findByRole('alert')).textContent).toBe('請先登入後再使用 Matrix 天衍');
});


test('天衍維持複合版路與準5+鎖定2碼，沒有準4+入口', () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);
  expect(screen.getByText('複合版路')).toBeTruthy();
  expect(screen.getByRole('button', { name: '準5+（鎖定2碼）' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '準4+（鎖定1碼）' })).toBeNull();
});

test('天衍只有展開結果時才讀取驗證資料', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  expect(await screen.findByText('14.27')).toBeTruthy();
  expect(matrixApi.fetchTianyanValidation).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /展開版路/ }));
  expect(matrixApi.fetchTianyanValidation).toHaveBeenCalledWith(
    expect.objectContaining({ analysisVersion: '114000123:v1', drawPeriod: '114000123' }),
    'tianyan-api-1',
  );
});
