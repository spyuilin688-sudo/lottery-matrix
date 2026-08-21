// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
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

test('一段式不顯示第二段，且天工沒有近10期與連準篩選', () => {
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);
  expect(screen.queryByText('第二段球位')).toBeNull();
  expect(screen.queryByText('第二段版路類型')).toBeNull();
  expect(screen.queryByText('近10期開獎號碼')).toBeNull();
  expect(screen.queryByText('連準篩選')).toBeNull();
});

test('二段式顯示第二段設定並提交完整正式條件', async () => {
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '二段式' }));
  fireEvent.click(screen.getByRole('button', { name: '八十期' }));
  fireEvent.click(screen.getByRole('button', { name: '準3進4' }));
  fireEvent.click(screen.getAllByRole('button', { name: '依序遞增' })[0]);
  expect(screen.getByText('第二段球位')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

  expect(await screen.findByText('12')).toBeTruthy();
  expect(matrixApi.fetchTiangongList).toHaveBeenCalledWith(expect.objectContaining({
    lottery: '今彩539', periodRange: 80, mode: 'two-stage', hitCondition: '準3進4',
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
