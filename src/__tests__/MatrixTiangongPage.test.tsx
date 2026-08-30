// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { MatrixTiangongPage } from '../FeaturePages';

const matrixApi = vi.hoisted(() => ({
  fetchExploreList: vi.fn(), fetchExploreValidation: vi.fn(),
  fetchTianyanList: vi.fn(), fetchTianyanValidation: vi.fn(),
  fetchTiangongList: vi.fn(), fetchTiangongValidation: vi.fn(),
}));
vi.mock('../matrix-algorithm-api', () => matrixApi);

const envelope = {
  kind: 'tiangong', lottery: '今彩539', drawPeriod: '114000123',
  analysisVersion: '114000123:v1', status: 'complete', total: 1,
  items: [{
    id: 'tg-api-1', sourceSequence: [1, 3, 5], eligiblePeriodRange: 50,
    interval: 2, predictionDistance: 1, predictedPosition: 3, predictionNumber: '12', roadType: '加減＋合值',
    ruleIdentity: 'rule', mode: 'one-stage', hitCondition: '準2進3',
    exploreDirection: '固定', firstStageDirection: '固定', firstRoadType: '加減',
  }],
} as const;

beforeEach(() => {
  document.body.innerHTML = '';
  matrixApi.fetchTiangongList.mockReset().mockResolvedValue(envelope);
  matrixApi.fetchTiangongValidation.mockReset().mockResolvedValue({
    ...envelope, itemId: 'tg-api-1',
    validation: { itemId: 'tg-api-1', ruleIdentity: 'rule', validationRows: [
      { role: 'first-stage-evidence', group: 'C', sourcePeriod: '114000100', resultPeriod: '114000109' },
      { role: 'second-stage-validation', group: 'C', sourcePeriod: '114000100', resultPeriod: '114000114' },
      { role: 'prediction', group: 'A', sourcePeriod: '114000108', resultPeriod: '114000122' },
    ] },
  });
});

test('天工固定顯示二段式設定，且不再提供模式與命中條件選項', () => {
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);
  const generalCard = screen.getByRole('heading', { name: '探索設定' }).closest('section') as HTMLElement;
  const stageSection = screen.getByRole('heading', { name: '第一段 探索設定' }).closest('section') as HTMLElement;
  const firstStageCard = screen.getByRole('heading', { name: '第一段 探索設定' }).closest('.tiangong-stage-block') as HTMLElement;
  const firstPosition = within(firstStageCard).getByRole('group', { name: '探索球位' });
  const firstRoad = within(firstStageCard).getByRole('group', { name: '版路類型' });
  expect(document.querySelector('.matrix-tiangong-screen')?.classList.contains('matrix-explore-layout')).toBe(true);
  expect(generalCard).not.toBe(stageSection);
  expect(generalCard.contains(firstPosition)).toBe(false);
  expect(generalCard.contains(firstRoad)).toBe(false);
  expect(firstStageCard.contains(firstPosition)).toBe(true);
  expect(firstStageCard.contains(firstRoad)).toBe(true);
  expect(screen.getByRole('heading', { name: '第二段 探索設定' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '進階探索設定' })).toBeNull();
  expect(screen.queryByText('探索模式')).toBeNull();
  expect(screen.queryByText('命中條件')).toBeNull();
  expect(screen.queryByRole('button', { name: '一段式' })).toBeNull();
  expect(screen.queryByRole('button', { name: '準3進4' })).toBeNull();
  expect(screen.queryByText('近10期開獎號碼')).toBeNull();
  expect(screen.queryByText('連準篩選')).toBeNull();
  expect(within(generalCard).getByRole('group', { name: '探索球位' }).classList.contains('tiangong-setting-row')).toBe(true);
  expect(firstPosition.classList.contains('tiangong-setting-row')).toBe(true);
  expect(firstRoad.classList.contains('tiangong-setting-row')).toBe(true);
  expect(document.querySelector('.tiangong-settings fieldset')).toBeNull();
});

test('固定以二段式與準2進3提交完整正式條件', async () => {
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '八十期' }));
  fireEvent.click(screen.getAllByRole('button', { name: '由左至右' })[0]);
  const secondStageTitle = screen.getByRole('heading', { name: '第二段 探索設定' });
  const firstStageCard = screen.getByRole('heading', { name: '第一段 探索設定' }).closest('section');
  expect(firstStageCard?.contains(secondStageTitle)).toBe(true);
  expect(screen.getAllByRole('group', { name: '探索球位' })).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

  expect(await screen.findByText('12')).toBeTruthy();
  expect(matrixApi.fetchTiangongList).toHaveBeenCalledWith(expect.objectContaining({
    lottery: '今彩539', periodRange: 80, mode: 'two-stage', hitCondition: '準2進3',
    exploreDirections: ['固定', '依序遞增'],
    firstStageDirections: ['固定'], firstRoadTypes: ['加減'],
    secondStageDirections: ['固定'], secondRoadTypes: ['加減'],
  }));
});

test('API 結果取代固定範例，展開時才讀取驗證', async () => {
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  expect(await screen.findByText('加減＋合值')).toBeTruthy();
  expect(screen.getByText('2')).toBeTruthy();
  expect(screen.getByText('3')).toBeTruthy();
  expect(screen.queryByText('08.37')).toBeNull();
  expect(matrixApi.fetchTiangongValidation).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /展開版路/ }));
  expect(matrixApi.fetchTiangongValidation).toHaveBeenCalledWith(
    expect.objectContaining({ drawPeriod: '114000123', analysisVersion: '114000123:v1' }),
    'tg-api-1',
  );
  expect(await screen.findByText('第一段成立')).toBeTruthy();
  expect(screen.getByText('第二段驗證')).toBeTruthy();
  expect(screen.getByText('最終預測')).toBeTruthy();
});

test('未完成分析時只顯示狀態，不回退固定資料', async () => {
  matrixApi.fetchTiangongList.mockRejectedValue({ code: 'ANALYSIS_NOT_READY' });
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  expect((await screen.findByRole('alert')).textContent).toBe('分析中，請稍後再試');
  expect(screen.queryByText('08.37')).toBeNull();
});
