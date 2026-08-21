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
    consecutive: '準11進12',
    highestStreak: 11,
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
      itemId: 'tianyan-api-1', rules: [], groupCount: 11,
      minimumIndependentHits: 4, rule1Only: 4, rule2Only: 4, bothHit: 3,
      historicalValidation: [],
    },
  });
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ records: [] }) }) as typeof fetch;
});

test('天衍固定顯示複合版路與二碼命中條件，且不顯示近10期', () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);

  expect(screen.getByText('複合版路')).toBeTruthy();
  expect(screen.getByRole('button', { name: '準5+（鎖定2碼）' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: '準4+（鎖定1碼）' })).toBeNull();
  expect(screen.queryByText('近10期開獎號碼')).toBeNull();
});

test('天衍使用正式 API 資料與核准的預設連準篩選', async () => {
  render(<MatrixExplorePage onNavigate={vi.fn()} title="Matrix 天衍" roadTypes={['複合版路']} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

  expect(await screen.findByText('12.34')).toBeTruthy();
  expect(screen.queryByText('03.09')).toBeNull();
  expect(matrixApi.fetchTianyanList).toHaveBeenCalledWith({
    lottery: '今彩539',
    selectedStreaks: ['準9進10', '準11進12', '準13進14', '準15進16', '準17進18+'],
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
