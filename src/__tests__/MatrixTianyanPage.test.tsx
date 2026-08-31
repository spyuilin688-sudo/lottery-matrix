// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
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
  kind: 'tianyan',
  lottery: '今彩539',
  drawPeriod: '114000123',
  analysisVersion: '114000123:v1',
  status: 'complete',
  total: 1,
  items: [{
    id: 'tianyan-api-1',
    number: '07',
    lockedPosition: 1,
    predictionDistance: 1,
    consecutive: '準7進8',
    highestStreak: 7,
    predictionNumbers: ['12', '34'],
    roadType: '複合',
    hitCondition: '準5+（鎖定2碼）',
    ruleIds: ['r1', 'r2'],
  }],
} as const;

beforeEach(() => {
  document.body.innerHTML = '';
  matrixApi.fetchTianyanList.mockReset().mockResolvedValue(envelope);
  matrixApi.fetchTianyanValidation.mockReset().mockResolvedValue({
    ...envelope,
    itemId: 'tianyan-api-1',
    validation: {
      itemId: 'tianyan-api-1', rules: [], groupCount: 7,
      minimumIndependentHits: 3, rule1Only: 3, rule2Only: 3, bothHit: 1,
      historicalValidation: [],
    },
  });
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ records: [] }) }) as typeof fetch;
});

test('天衍固定顯示複合版路與二碼命中條件，且近10期可收合再展開', () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);

  expect(screen.getByText('複合版路')).toBeTruthy();
  expect(screen.getByRole('button', { name: '準5+（鎖定2碼）' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '準4+（鎖定1碼）' })).toBeNull();
  expect(screen.getByText('近10期開獎號碼')).toBeTruthy();

  const historyTable = document.querySelector<HTMLElement>('.history-table');
  expect(historyTable?.hidden).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: '收合近10期開獎號碼' }));
  expect(historyTable?.hidden).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '展開近10期開獎號碼' }));
  expect(historyTable?.hidden).toBe(false);
});

test('天衍使用正式 API 資料與核准的預設連準篩選', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

  expect(await screen.findByText('12.34')).toBeTruthy();
  expect(screen.queryByText('03.09')).toBeNull();
  expect(matrixApi.fetchTianyanList).toHaveBeenCalledWith({
    lottery: '今彩539',
    exploreDateOffset: 0,
    selectedStreaks: ['準5進6', '準6進7', '準7進8'],
  });
});

test('天衍只有展開結果時才讀取驗證資料', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  expect(await screen.findByText('12.34')).toBeTruthy();
  expect(matrixApi.fetchTianyanValidation).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: /展開版路/ }));
  expect(matrixApi.fetchTianyanValidation).toHaveBeenCalledWith(
    expect.objectContaining({ analysisVersion: '114000123:v1', drawPeriod: '114000123' }),
    'tianyan-api-1',
  );
});

test('未登入時顯示登入要求，而非泛用 API 錯誤', async () => {
  matrixApi.fetchTianyanList.mockRejectedValue({ code: 'AUTH_REQUIRED' });
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);

  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

  expect((await screen.findByRole('alert')).textContent).toBe('請先登入後再使用 Matrix 天衍');
});
