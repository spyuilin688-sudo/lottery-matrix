// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { render } from '../../test/render-with-dialog';
import { MatrixExplorePage } from '../features/MatrixExplorePage';
import { MatrixPageSwitcher } from '../features/shared';
import { FeaturePageRouter } from '../features/router';
import { invalidateMatrixData } from '../matrix-data-revision';
import type { TianhengListResponse } from '../matrix-algorithm-api';

const matrixApi = vi.hoisted(() => ({
  fetchExploreList: vi.fn(), fetchExploreValidation: vi.fn(),
  fetchTianyanList: vi.fn(), fetchTianyanValidation: vi.fn(),
  fetchTianhengList: vi.fn(), fetchTianhengValidation: vi.fn(),
  fetchTiangongList: vi.fn(), fetchTiangongValidation: vi.fn(),
}));
const uiState = vi.hoisted(() => ({
  permissionSettings: {
    subscriptionPurchaseVisible: true, registeredMemberFreeAccess: false, revision: 1,
  },
  fetchMemberProfile: vi.fn(),
}));
vi.mock('../matrix-algorithm-api', () => matrixApi);
vi.mock('../permission-settings', () => ({ usePermissionSettings: () => uiState.permissionSettings }));
vi.mock('../member-api', () => ({
  bootstrapMember: vi.fn().mockResolvedValue(undefined),
  fetchMemberProfile: uiState.fetchMemberProfile,
}));
vi.mock('../lottery-api', () => ({ fetchLotteryHistory: vi.fn().mockResolvedValue([]) }));

const envelope: TianhengListResponse = {
  kind: 'tianheng', lottery: '今彩539', drawPeriod: '114001',
  analysisVersion: '114001:matrix-python-v13', status: 'complete', total: 1,
  duplicateStats: [{ number: '23', count: 2 }],
  items: [{
    id: 'th-1', firstNumber: '08', firstLockedPosition: 2,
    secondNumber: '17', secondLockedPosition: 4,
    predictionDistance: 3, consecutive: '準5進6', highestStreak: 5,
    predictionNumbers: ['23'], algorithmType: '加減',
    numberOrder: '依號碼由小到大排序', explorePeriods: 3, exploreDateOffset: 0, ruleCount: 1,
  }],
};

const tianhengItem = {
  id: 'th-1', firstNumber: '05', firstLockedPosition: 1,
  secondNumber: '18', secondLockedPosition: 4,
  predictionDistance: 5, consecutive: '準5進6', highestStreak: 5,
  predictionNumbers: ['19'], algorithmType: '拖牌',
  numberOrder: '依號碼由小到大排序', explorePeriods: 3,
  exploreDateOffset: 0, ruleCount: 2, referenceOffset: 0, referencePosition: 1,
} as const;

const tianhengValidation = {
  itemId: 'th-1',
  sourceA: {
    sourcePeriod: '114001', sourceNumbers: ['05', '10', '15', '18', '20'],
    sourceSortedNumbers: ['05', '10', '15', '18', '20'],
    sourceDrawOrderNumbers: ['05', '10', '15', '18', '20'],
    lockedPositions: [1, 4], lockedNumbers: [5, 18], baseNumber: 5,
    referencePeriod: '114001', referenceNumbers: ['05', '10', '15', '18', '20'],
    referenceSortedNumbers: ['05', '10', '15', '18', '20'],
    referenceDrawOrderNumbers: ['05', '10', '15', '18', '20'],
    predictionPeriod: null, predictionCompleted: false,
  },
  ruleSets: [{
    rules: [
      { value: 14, display: '+14', algorithmType: '拖牌' },
      { value: 24, display: '+24', algorithmType: '拖牌' },
    ],
    predictionNumbers: [19],
    historicalValidation: [{
      group: 'B', sourcePeriod: '113990',
      sourceNumbers: ['05', '10', '15', '18', '20'],
      sourceSortedNumbers: ['05', '10', '15', '18', '20'],
      sourceDrawOrderNumbers: ['05', '10', '15', '18', '20'],
      lockedPositions: [1, 4], lockedNumbers: [5, 18],
      referencePeriod: '113990', referenceNumbers: ['05', '10', '15', '18', '20'],
      referenceSortedNumbers: ['05', '10', '15', '18', '20'],
      referenceDrawOrderNumbers: ['05', '10', '15', '18', '20'],
      baseNumber: 5, predictionPeriod: '113985',
      predictionNumbers: ['01', '09', '19', '23', '30'],
      candidateRules: [14, 24], matchedRules: [
        { value: 14, display: '+14', algorithmType: '拖牌' },
        { value: 24, display: '+24', algorithmType: '拖牌' },
      ],
      hitNumbers: [19], success: true,
    }],
  }],
};

async function renderTianhengResult(overrides = {}, validation = tianhengValidation) {
  matrixApi.fetchTianhengList.mockResolvedValue({
    kind: 'tianheng', lottery: '今彩539', drawPeriod: '114001',
    analysisVersion: '114001:matrix-python-v13', status: 'complete',
    items: [{ ...tianhengItem, ...overrides }], duplicateStats: [], total: 1,
  });
  matrixApi.fetchTianhengValidation.mockResolvedValue({
    kind: 'tianheng', lottery: '今彩539', drawPeriod: '114001',
    analysisVersion: '114001:matrix-python-v13', status: 'complete',
    itemId: 'th-1', validation,
  });
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衡" />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  return screen.findByRole('button', { name: /展開版路 th-1/ });
}

beforeEach(() => {
  vi.clearAllMocks();
  uiState.permissionSettings = {
    subscriptionPurchaseVisible: true, registeredMemberFreeAccess: false, revision: 1,
  };
  uiState.fetchMemberProfile.mockReset().mockResolvedValue({
    exploreEntitlements: { canUseSeven: false, canUseThirteen: false, canUseFullRange: false },
  });
  matrixApi.fetchTianhengList.mockReset().mockResolvedValue(envelope);
  matrixApi.fetchTianhengValidation.mockReset().mockResolvedValue({
    ...envelope, itemId: 'th-1', validation: tianhengValidation,
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

async function openPage() {
  const view = render(<MatrixExplorePage title="Matrix 天衡" onNavigate={vi.fn()} />);
  await act(async () => {});
  return view;
}

async function search() {
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  return screen.findByRole('button', { name: '展開版路 th-1' });
}

it('routes Tianheng into the canonical Explore layout with its exact artwork and 3/13 controls', async () => {
  render(<FeaturePageRouter screen="tianheng" onNavigate={vi.fn()} />);
  await act(async () => {});
  expect(screen.getByAltText('Matrix 天衡')).toHaveAttribute('src', '/assets/lottery/functions/天衡標題K.png');
  expect(screen.getByRole('button', { name: '三期' })).toHaveAttribute('data-selected', 'true');
  expect(screen.getByRole('button', { name: /十三期/ })).toBeEnabled();
  expect(screen.queryByRole('button', { name: '二期' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '七期' })).not.toBeInTheDocument();
  expect(document.querySelector('.matrix-tianheng-screen')).toHaveClass('matrix-explore-layout', 'matrix-explore-main-screen');
  expect(screen.getByRole('button', { name: '開始探索' })).toBeVisible();
});

it.each([
  ['explore', ['Matrix 天衡', 'Matrix 天衍', 'Matrix 天工']],
  ['tianheng', ['Matrix 探索', 'Matrix 天衍', 'Matrix 天工']],
  ['tianyan', ['Matrix 探索', 'Matrix 天衡', 'Matrix 天工']],
  ['tiangong', ['Matrix 探索', 'Matrix 天衡', 'Matrix 天衍']],
] as const)('switcher %s shows only the other three pages in established order', (current, labels) => {
  const onNavigate = vi.fn();
  render(<MatrixPageSwitcher current={current} onNavigate={onNavigate} />);
  const buttons = screen.getAllByRole('button');
  expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual(labels);
  if (current !== 'tianheng') {
    const button = screen.getByRole('button', { name: 'Matrix 天衡' });
    expect(button.querySelector('img')).toHaveAttribute('src', '/assets/lottery/functions/天衡.png');
    fireEvent.click(button);
    expect(onNavigate).toHaveBeenCalledWith('tianheng');
  }
});

it.each([true, false])('always defaults to free three periods with server thirteen entitlement %s', async canUseThirteen => {
  uiState.fetchMemberProfile.mockResolvedValue({
    exploreEntitlements: { canUseSeven: true, canUseThirteen, canUseFullRange: true },
  });
  await openPage();
  expect(screen.getByRole('button', { name: '三期' })).toHaveAttribute('data-selected', 'true');
  await search();
  expect(matrixApi.fetchTianhengList).toHaveBeenCalledWith({
    lottery: '今彩539', explorePeriods: 3, exploreRange: '標準範圍',
    numberOrder: '依號碼由小到大排序', exploreDateOffset: 0, ruleCount: 1,
    roadTypes: ['加減'], selectedStreaks: ['準5進6', '準6進7', '準7進8', '準9進10'], sameCode: false,
  });
  expect(matrixApi.fetchExploreList).not.toHaveBeenCalled();
});

it('shows the Matrix Pro cue on full range without full-range access', async () => {
  await openPage();
  fireEvent.click(screen.getByRole('button', { name: '進階探索設定' }));
  const fullRange = screen.getByRole('button', { name: '完整範圍' });
  expect(within(fullRange).getByText('Matrix Pro')).toBeVisible();
});

it.each([
  ['準5+（鎖定1碼）', ['準5進6', '準6進7', '準7進8', '準9進10'], 1],
  ['準7+（鎖定2碼）', ['準6進7', '準7進8', '準9進10', '準11進12'], 2],
] as const)('uses the exact %s filters and submits rule count', async (hit, options, ruleCount) => {
  await openPage();
  fireEvent.click(screen.getByRole('button', { name: hit }));
  await search();
  fireEvent.click(screen.getByRole('button', { name: '連準篩選' }));
  const group = screen.getByRole('group', { name: `${hit}連準篩選` });
  expect(within(group).getAllByRole('button').map(button => button.textContent)).toEqual(options);
  expect(matrixApi.fetchTianhengList).toHaveBeenLastCalledWith(expect.objectContaining({ ruleCount, selectedStreaks: options }));
  fireEvent.click(within(group).getByRole('button', { name: options[0] }));
  await act(async () => {});
  expect(matrixApi.fetchTianhengList).toHaveBeenLastCalledWith(expect.objectContaining({ selectedStreaks: options.slice(1) }));
});

it('submits advanced settings and keeps history collapse/navigation identical to Explore', async () => {
  const onNavigate = vi.fn();
  render(<MatrixExplorePage title="Matrix 天衡" onNavigate={onNavigate} />);
  await act(async () => {});
  expect(screen.getByRole('button', { name: '收合近10期開獎號碼' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /查看更多紀錄/ }));
  expect(onNavigate).toHaveBeenCalledWith('history');
  fireEvent.click(screen.getByRole('button', { name: /十三期/ }));
  fireEvent.click(screen.getByRole('button', { name: '拖牌版路' }));
  fireEvent.click(screen.getByRole('button', { name: '進階探索設定' }));
  fireEvent.change(screen.getByRole('combobox', { name: '彩種' }), { target: { value: '六合彩' } });
  fireEvent.change(screen.getByRole('combobox', { name: '號碼順序' }), { target: { value: '依實際開獎順序排序' } });
  fireEvent.click(screen.getByRole('button', { name: '前日 (上2期)' }));
  fireEvent.click(screen.getByRole('button', { name: /完整範圍/ }));
  await search();
  expect(screen.getByRole('button', { name: '展開近10期開獎號碼' })).toBeVisible();
  expect(matrixApi.fetchTianhengList).toHaveBeenLastCalledWith(expect.objectContaining({
    lottery: '六合彩', explorePeriods: 13, exploreRange: '完整範圍',
    roadTypes: ['拖牌'], numberOrder: '依實際開獎順序排序', exploreDateOffset: 2,
  }));
});

it.each([true, false])('result copy follows purchase visibility %s independently of free access', async visible => {
  uiState.permissionSettings.subscriptionPurchaseVisible = visible;
  const view = await openPage();
  await search();
  expect(screen.getByRole('heading', { name: '天衡結果區' })).toBeVisible();
  expect(screen.getByText(visible ? '預測期' : '查詢期')).toBeVisible();
  expect(screen.getByText(visible ? '預測' : '結果')).toBeVisible();
  uiState.permissionSettings.registeredMemberFreeAccess = true;
  view.rerender(<MatrixExplorePage title="Matrix 天衡" onNavigate={vi.fn()} />);
  expect(screen.getByText(visible ? '預測期' : '查詢期')).toBeVisible();
  expect(screen.getByText(visible ? '預測' : '結果')).toBeVisible();
});

it.each([
  ['依號碼由小到大排序', 4, ['順球2', '順球4']],
  ['依實際開獎順序排序', 7, ['落球2', '特別號']],
] as const)('stacks both lock values for %s without changing the other four columns', async (numberOrder, secondLockedPosition, positions) => {
  matrixApi.fetchTianhengList.mockResolvedValue({
    ...envelope, items: [{ ...envelope.items[0], numberOrder, secondLockedPosition }],
  });
  await openPage();
  const row = await search();
  expect(row.children).toHaveLength(6);
  expect(row.children[0]).toHaveClass('tag', 'tianheng-lock-positions');
  expect(Array.from(row.children[0].children).map(node => node.textContent)).toEqual(positions);
  expect(row.children[1]).toHaveClass('result-number', 'numeric-text', 'tianheng-lock-numbers');
  expect(Array.from(row.children[1].children).map(node => node.textContent)).toEqual(['08', '17']);
  expect(Array.from(row.children).slice(2).map(node => node.textContent)).toEqual(['下3期', '準5進6', '23', '加減版路']);
});

it('forwards duplicate-number and same-code filters to Tianheng', async () => {
  await openPage();
  await search();
  fireEvent.click(screen.getByRole('button', { name: '篩選預測號碼 23，2次' }));
  await act(async () => {});
  expect(matrixApi.fetchTianhengList).toHaveBeenLastCalledWith(expect.objectContaining({ predictionNumber: '23', sameCode: false }));
  fireEvent.click(screen.getByRole('button', { name: '同碼' }));
  await act(async () => {});
  expect(matrixApi.fetchTianhengList).toHaveBeenLastCalledWith(expect.objectContaining({ predictionNumber: '23', sameCode: true }));
});

it('loads validation only on expansion using the submitted access settings, not unsent edits', async () => {
  await openPage();
  await search();
  expect(matrixApi.fetchTianhengValidation).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /十三期/ }));
  fireEvent.click(screen.getByRole('button', { name: '進階探索設定' }));
  fireEvent.click(screen.getByRole('button', { name: /完整範圍/ }));
  fireEvent.click(screen.getByRole('button', { name: '展開版路 th-1' }));
  await act(async () => {});
  expect(matrixApi.fetchTianhengValidation).toHaveBeenCalledWith({
    lottery: '今彩539', drawPeriod: '114001', analysisVersion: '114001:matrix-python-v13',
  }, 'th-1', { explorePeriods: 3, exploreRange: '標準範圍' });
  expect(matrixApi.fetchExploreValidation).not.toHaveBeenCalled();
  expect(matrixApi.fetchTianyanValidation).not.toHaveBeenCalled();
  expect(await screen.findByRole('region', { name: '天衡驗證過程' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '收合版路 th-1' }));
  fireEvent.click(screen.getByRole('button', { name: '展開版路 th-1' }));
  expect(matrixApi.fetchTianhengValidation).toHaveBeenCalledTimes(1);
});

it('orders the drag summary in exactly two rows', async () => {
  const resultButton = await renderTianhengResult({
    firstNumber: '05', firstLockedPosition: 1,
    secondNumber: '18', secondLockedPosition: 4,
    predictionDistance: 5, algorithmType: '拖牌',
  });
  fireEvent.click(resultButton);
  const rows = await screen.findAllByTestId('tianheng-summary-row');
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent('開 05 第 1 顆｜同期｜第 1 顆');
  expect(rows[1]).toHaveTextContent('開 18 第 4 顆｜+14.24｜下 5 期開');
});

it('highlights both locked numbers in every source group', async () => {
  const resultButton = await renderTianhengResult();
  fireEvent.click(resultButton);
  const sourceRow = await screen.findByTestId('tianheng-source-row-B');
  expect(within(sourceRow).getByText('05')).toHaveClass('explore-validation-number--hit');
  expect(within(sourceRow).getByText('18')).toHaveClass('explore-validation-number--hit');
});

it('marks the reference base in historical and current source rows for same-period non-drag roads', async () => {
  const addRule = { value: 9, display: '+9', algorithmType: '加減' };
  const validation = {
    ...tianhengValidation,
    sourceA: { ...tianhengValidation.sourceA, baseNumber: 10 },
    ruleSets: [{
      ...tianhengValidation.ruleSets[0],
      rules: [addRule],
      historicalValidation: [{
        ...tianhengValidation.ruleSets[0].historicalValidation[0],
        baseNumber: 10,
        matchedRules: [addRule],
      }],
    }],
  };
  const resultButton = await renderTianhengResult({
    algorithmType: '加減', referenceOffset: 0, referencePosition: 1,
  }, validation);
  fireEvent.click(resultButton);
  for (const group of ['B', 'A']) {
    const sourceRow = await screen.findByTestId(`tianheng-source-row-${group}`);
    expect(within(sourceRow).getByText('10')).toHaveClass('explore-validation-number--source');
  }
});

it('reverses drag formulas before rendering historical and current source groups', async () => {
  const resultButton = await renderTianhengResult();
  fireEvent.click(resultButton);
  for (const group of ['B', 'A']) {
    const sourceRow = await screen.findByTestId(`tianheng-source-row-${group}`);
    const validationGroup = sourceRow.closest('.explore-validation-group') as HTMLElement;
    const formulas = Array.from(validationGroup.querySelectorAll('.explore-validation-formula-row'));
    expect(formulas[0]).toHaveTextContent('+24');
    expect(formulas[1]).toHaveTextContent('+14');
  }
});

it('labels sum summaries while preserving API rule display numbers', async () => {
  const sumRules = [
    { value: 14, display: '14', algorithmType: '合值' },
    { value: 24, display: '24', algorithmType: '合值' },
  ];
  const validation = {
    ...tianhengValidation,
    ruleSets: [{
      ...tianhengValidation.ruleSets[0],
      rules: sumRules,
      historicalValidation: [{
        ...tianhengValidation.ruleSets[0].historicalValidation[0],
        matchedRules: sumRules,
      }],
    }],
  };
  const resultButton = await renderTianhengResult({ algorithmType: '合值' }, validation);
  fireEvent.click(resultButton);
  const rows = await screen.findAllByTestId('tianheng-summary-row');
  expect(rows[1].querySelector('.validation-summary-formula-label')).toHaveTextContent('合值');
  expect(rows[1].querySelector('.validation-summary-formula')).toHaveTextContent('14.24');
});

it('lets the server decide thirteen-period entitlement and shows the canonical denial dialog', async () => {
  matrixApi.fetchTianhengList.mockRejectedValue({ code: 'FORBIDDEN' });
  await openPage();
  fireEvent.click(screen.getByRole('button', { name: /十三期/ }));
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  const dialog = await screen.findByRole('dialog', { name: '無法使用 Matrix 天衡' });
  expect(dialog).toHaveTextContent('目前會員權限無法使用此設定');
  expect(matrixApi.fetchTianhengList).toHaveBeenCalledWith(expect.objectContaining({ explorePeriods: 13 }));
});

it('shows loading, completed empty, and retryable analysis errors without sample results', async () => {
  let finish!: (response: TianhengListResponse) => void;
  matrixApi.fetchTianhengList.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await openPage();
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  expect(screen.getByRole('status')).toHaveTextContent('分析結果載入中');
  expect(document.querySelector('.result-count')).toBeNull();
  await act(async () => finish({ ...envelope, items: [], duplicateStats: [], total: 0 }));
  expect(screen.getByText('無符合設定條件')).toBeVisible();
  matrixApi.fetchTianhengList.mockRejectedValueOnce({ code: 'ANALYSIS_NOT_READY' });
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('分析中，請稍後再試');
  expect(document.querySelector('.result-count')).toBeNull();
  await search();
});

it.each(['success', 'error'])('ignores an older query %s after a newer submitted query', async outcome => {
  let finish!: (response: TianhengListResponse) => void;
  let fail!: (error: unknown) => void;
  matrixApi.fetchTianhengList.mockReturnValueOnce(new Promise((resolve, reject) => { finish = resolve; fail = reject; }));
  await openPage();
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  await search();
  await act(async () => {
    if (outcome === 'success') finish({ ...envelope, items: [], total: 0 });
    else fail({ code: 'FORBIDDEN' });
  });
  expect(screen.getByRole('button', { name: '展開版路 th-1' })).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('clears results and validation caches on data revision and ignores stale validation failure', async () => {
  let fail!: (error: unknown) => void;
  matrixApi.fetchTianhengValidation.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
  await openPage();
  const row = await search();
  fireEvent.click(row);
  act(() => invalidateMatrixData());
  expect(screen.queryByRole('heading', { name: '天衡結果區' })).not.toBeInTheDocument();
  await act(async () => fail(new Error('old validation')));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  const fresh = await search();
  fireEvent.click(fresh);
  await act(async () => {});
  expect(matrixApi.fetchTianhengValidation).toHaveBeenCalledTimes(2);
});
