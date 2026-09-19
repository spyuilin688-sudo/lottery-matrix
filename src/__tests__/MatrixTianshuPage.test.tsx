// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { render } from '../../test/render-with-dialog';
import { MatrixExplorePage } from '../features/MatrixExplorePage';
import { FeaturePageRouter } from '../features/router';
import { invalidateMatrixData } from '../matrix-data-revision';
import type { TianshuApiRow, TianshuListResponse, TianshuValidation } from '../matrix-algorithm-api';

const matrixApi = vi.hoisted(() => ({
  fetchExploreList: vi.fn(), fetchExploreValidation: vi.fn(),
  fetchTianyanList: vi.fn(), fetchTianyanValidation: vi.fn(),
  fetchTianhengList: vi.fn(), fetchTianhengValidation: vi.fn(),
  fetchTianshuList: vi.fn(), fetchTianshuValidation: vi.fn(),
  fetchTiangongList: vi.fn(), fetchTiangongValidation: vi.fn(),
}));
const uiState = vi.hoisted(() => ({
  fetchMemberProfile: vi.fn(),
}));
vi.mock('../matrix-algorithm-api', () => matrixApi);
vi.mock('../permission-settings', () => ({
  usePermissionSettings: () => ({
    subscriptionPurchaseVisible: true, registeredMemberFreeAccess: false, revision: 1,
  }),
}));
vi.mock('../member-api', () => ({
  bootstrapMember: vi.fn().mockResolvedValue(undefined),
  fetchMemberProfile: uiState.fetchMemberProfile,
}));
vi.mock('../lottery-api', () => ({ fetchLotteryHistory: vi.fn().mockResolvedValue([]) }));

const item: TianshuApiRow = {
  id: 'ts-1', firstNumber: '05', firstLockedPosition: 1,
  secondNumber: '18', secondLockedPosition: 3,
  thirdNumber: '31', thirdLockedPosition: 5,
  predictionDistance: 5, consecutive: '準5進6', highestStreak: 5,
  predictionNumbers: ['19'], algorithmType: '拖牌',
  numberOrder: '依號碼由小到大排序', explorePeriods: 3,
  exploreDateOffset: 0, ruleCount: 2, referenceOffset: 0, referencePosition: 1,
};

const validation: TianshuValidation = {
  itemId: 'ts-1',
  sourceA: {
    sourcePeriod: '114001', sourceNumbers: ['05', '10', '18', '24', '31'],
    sourceSortedNumbers: ['05', '10', '18', '24', '31'],
    sourceDrawOrderNumbers: ['24', '05', '31', '10', '18'],
    lockedPositions: [1, 3, 5], lockedNumbers: [5, 18, 31], baseNumber: 5,
    referencePeriod: '114001', referenceNumbers: ['05', '10', '18', '24', '31'],
    referenceSortedNumbers: ['05', '10', '18', '24', '31'],
    referenceDrawOrderNumbers: ['24', '05', '31', '10', '18'],
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
      sourceNumbers: ['05', '10', '18', '24', '31'],
      sourceSortedNumbers: ['05', '10', '18', '24', '31'],
      sourceDrawOrderNumbers: ['24', '05', '31', '10', '18'],
      lockedPositions: [1, 3, 5], lockedNumbers: [5, 18, 31],
      referencePeriod: '113990', referenceNumbers: ['05', '10', '18', '24', '31'],
      referenceSortedNumbers: ['05', '10', '18', '24', '31'],
      referenceDrawOrderNumbers: ['24', '05', '31', '10', '18'],
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

const response: TianshuListResponse = {
  kind: 'tianshu', lottery: '今彩539', drawPeriod: '114001',
  analysisVersion: '114001:matrix-python-v13', status: 'complete',
  items: [item], duplicateStats: [{ number: '19', count: 1 }], total: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  uiState.fetchMemberProfile.mockResolvedValue({
    exploreEntitlements: { canUseSeven: false, canUseThirteen: false, canUseFullRange: false },
  });
  matrixApi.fetchTianshuList.mockResolvedValue(response);
  matrixApi.fetchTianshuValidation.mockResolvedValue({
    ...response, items: undefined, duplicateStats: undefined, total: undefined,
    itemId: 'ts-1', validation,
  });
});

async function openPage() {
  render(<MatrixExplorePage title="Matrix 天樞" onNavigate={vi.fn()} />);
  await act(async () => {});
}

async function search() {
  fireEvent.click(screen.getByRole('button', { name: '開始天樞' }));
  return screen.findByRole('button', { name: '展開版路 ts-1' });
}

it('routes Tianshu through the Tianheng visual contract with the same settings', async () => {
  render(<FeaturePageRouter screen="tianshu" onNavigate={vi.fn()} />);
  await act(async () => {});

  const header = screen.getByRole('heading', { level: 1, name: 'MATRIX 天樞' }).closest('header');
  expect(header).toHaveAttribute('data-header-style', 'flow');
  expect(header?.querySelector('.product-header__mark')).toHaveAttribute('src', '/assets/lottery/matrixYY.png');
  expect(header).toHaveTextContent('TIANSHU');
  expect(document.querySelector('.matrix-tianshu-screen')).toHaveClass('matrix-tianheng-screen', 'matrix-explore-layout');
  expect(screen.getByRole('button', { name: '三期' })).toHaveAttribute('data-selected', 'true');
  expect(screen.getByRole('button', { name: /十三期/ })).toBeEnabled();
  expect(screen.queryByRole('button', { name: '二期' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '七期' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '拖牌版路' })).toHaveTextContent('推薦');
  expect(screen.getByRole('group', { name: '天樞條件' })).toBeVisible();
  expect(screen.getByRole('button', { name: '準5+ (鎖定1碼)' })).toBeVisible();
  expect(screen.getByRole('button', { name: '準6+ (鎖定2碼)' })).toBeVisible();
  expect(screen.getByRole('button', { name: '開始天樞' })).toBeVisible();

  const switcher = screen.getByRole('navigation', { name: 'Matrix Core 功能切換' });
  expect(within(switcher).getAllByRole('button').map(button => button.textContent)).toEqual([
    '探索', '天衡', '天樞', '天衍', '天工',
  ]);
  expect(screen.getByRole('button', { name: 'Matrix 天樞' })).toHaveAttribute('aria-current', 'page');
});

it('submits the unchanged Tianheng option contract to the independent Tianshu list API', async () => {
  await openPage();
  fireEvent.click(screen.getByRole('button', { name: '準6+ (鎖定2碼)' }));
  fireEvent.click(screen.getByRole('button', { name: '開始天樞' }));

  await waitFor(() => expect(matrixApi.fetchTianshuList).toHaveBeenCalledWith({
    lottery: '今彩539', explorePeriods: 3, exploreRange: '標準範圍',
    numberOrder: '依號碼由小到大排序', exploreDateOffset: 0, ruleCount: 2,
    roadTypes: ['加減'], selectedStreaks: ['準7進8', '準9進10', '準11進12'], sameCode: false,
  }));
  expect(matrixApi.fetchTianhengList).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', { name: '天樞結果區' })).toBeVisible();
});

it('renders three source locks and expands validation through the independent Tianshu API', async () => {
  await openPage();
  const row = await search();

  const positions = row.querySelector('.tianheng-lock-positions')!;
  const numbers = row.querySelector('.tianheng-lock-numbers')!;
  expect([...positions.children].map(node => node.textContent)).toEqual(['順球1', '順球3', '順球5']);
  expect([...numbers.children].map(node => node.textContent)).toEqual(['05', '18', '31']);

  fireEvent.click(row);
  await screen.findByRole('region', { name: '天樞驗證過程' });
  expect(matrixApi.fetchTianshuValidation).toHaveBeenCalledWith({
    lottery: '今彩539', drawPeriod: '114001', analysisVersion: '114001:matrix-python-v13',
  }, 'ts-1', { explorePeriods: 3, exploreRange: '標準範圍' });
  expect(matrixApi.fetchTianhengValidation).not.toHaveBeenCalled();

  const rows = screen.getAllByTestId('tianshu-summary-row');
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent('開05 第 1 顆、同期 18 第 3 顆、跟 31 第 5 顆');
  expect(rows[1]).toHaveTextContent('同期｜第 1 顆｜+14.24｜下 5 期開');
  expect(screen.getByText('版路結果').parentElement).toHaveTextContent('19');

  const sourceRow = screen.getByTestId('tianshu-source-row-B');
  expect([...sourceRow.querySelectorAll('.explore-validation-number--hit')].map(node => node.textContent)).toEqual(['05', '18', '31']);
});

it('discards stale Tianshu results and validation when matrix data changes', async () => {
  let resolveList!: (value: TianshuListResponse) => void;
  matrixApi.fetchTianshuList.mockReturnValueOnce(new Promise(resolve => { resolveList = resolve; }));
  await openPage();
  fireEvent.click(screen.getByRole('button', { name: '開始天樞' }));
  act(() => invalidateMatrixData());
  await act(async () => resolveList(response));
  expect(screen.queryByRole('heading', { name: '天樞結果區' })).not.toBeInTheDocument();

  const fresh = await search();
  fireEvent.click(fresh);
  await act(async () => {});
  expect(screen.getByRole('region', { name: '天樞驗證過程' })).toBeVisible();
});
