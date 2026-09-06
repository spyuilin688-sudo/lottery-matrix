// @vitest-environment jsdom
import { invalidateMatrixData } from "../matrix-data-revision";
import type { Session } from '@supabase/supabase-js';
import { updateAlgorithmCacheSession } from '../auth/algorithm-cache-scope';

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { MatrixTiangongPage } from '../FeaturePages';
import { TiangongValidationProcess } from '../features/MatrixTiangongPage';

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
    id: 'tg-api-1', eligiblePeriodRange: 50, interval: 2,
    predictedPosition: 3, predictionNumber: '12', roadType: '加減＋合值',
    exploreDirection: '固定', firstStageDirection: '固定', firstRoadType: '加減',
    secondStageDirection: '固定', secondRoadType: '合值',
  }],
} as const;

beforeEach(() => {
  document.body.innerHTML = '';
  matrixApi.fetchTiangongList.mockReset().mockResolvedValue(envelope);
  matrixApi.fetchTiangongValidation.mockReset().mockResolvedValue({
    ...envelope, itemId: 'tg-api-1',
    validation: { itemId: 'tg-api-1', evidence: {
      rows: [{
        group: 'C', role: 'validation',
        source: { period: '114000100', position: 2, number: '08' },
        stage1: { period: '114000109', position: 3, calculated_number: '12', actual_number: '12', matched: true },
        stage2: { period: '114000114', position: 4, calculated_number: '16', actual_number: '16', matched: true },
      }],
      d_exclusion: {
        status: 'breaks_at_stage2',
        source: { period: '114000091', position: 1, number: '05' },
        stage1: { period: '114000096', position: 2, calculated_number: '10', actual_number: '10', matched: true },
        stage2: { period: '114000101', position: 3, calculated_number: '14', actual_number: '15', matched: false },
      },
    } },
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

test('依附件演算法支援的篩選條件提交請求', async () => {
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
    lottery: '今彩539', periodRange: 80,
    mode: 'two-stage', hitCondition: '準2進3',
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
  expect(await screen.findByText(/來源 114000100 第2位：08/)).toBeTruthy();
  expect(screen.getByText(/第一段 114000109 第3位：12／12/)).toBeTruthy();
  expect(screen.getByText(/第二段 114000114 第4位：16／16/)).toBeTruthy();
  expect(screen.getByText(/D 來源 114000091 第1位：05/)).toBeTruthy();
  expect(screen.getByText(/第二段 114000101 第3位：14／15/)).toBeTruthy();
});

test('未完成分析時只顯示狀態，不回退固定資料', async () => {
  matrixApi.fetchTiangongList.mockRejectedValue({ code: 'ANALYSIS_NOT_READY' });
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  expect((await screen.findByRole('alert')).textContent).toBe('分析中，請稍後再試');
  expect(screen.queryByText('08.37')).toBeNull();
});

test('未登入時顯示登入要求，而非泛用 API 錯誤', async () => {
  matrixApi.fetchTiangongList.mockRejectedValue({ code: 'AUTH_REQUIRED' });
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

  expect((await screen.findByRole('alert')).textContent).toBe('請先登入後再使用 Matrix 天工');
});


test('切換帳號清除已顯示的分析快取並忽略先前未完成請求', async () => {
  updateAlgorithmCacheSession({ access_token: 'account-a', user: { id: 'a' } } as Session);
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  expect(await screen.findByRole('button', { name: /展開版路/ })).toBeTruthy();
  act(() => updateAlgorithmCacheSession(null));
  expect(screen.queryByRole('button', { name: /展開版路/ })).toBeNull();
  act(() => updateAlgorithmCacheSession({ access_token: 'account-b', user: { id: 'b' } } as Session));
  let resolve!: (value: typeof envelope) => void;
  matrixApi.fetchTiangongList.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  act(() => updateAlgorithmCacheSession(null));
  await act(async () => { resolve(envelope); });
  expect(screen.queryByRole('button', { name: /展開版路/ })).toBeNull();
});


test('開獎資料更正清除畫面分析快取並忽略晚到的舊分析', async () => {
  render(<MatrixTiangongPage onNavigate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  expect(await screen.findByRole('button', { name: /展開版路/ })).toBeTruthy();
  act(() => invalidateMatrixData());
  expect(screen.queryByRole('button', { name: /展開版路/ })).toBeNull();
  let resolve!: (value: typeof envelope) => void;
  matrixApi.fetchTiangongList.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  act(() => invalidateMatrixData());
  await act(async () => { resolve(envelope); });
  expect(screen.queryByRole('button', { name: /展開版路/ })).toBeNull();
});

test.each([
  ['breaks_at_stage1', 'D 組第一段計算與開獎號碼不符，此版路可保留。'],
  ['breaks_at_stage2', 'D 組第二段計算與開獎號碼不符，此版路可保留。'],
  ['path_not_extendable', '球位無法延伸至 D 組，此版路可保留。'],
  ['extends_to_near_3_to_4', 'D 組兩段皆符合，已延伸為準3進4，不符合本次準2進3條件。'],
  ['unverifiable', '較早期的開獎資料不足，無法確認 D 組是否符合。'],
  ['future_status', '目前無法解讀 D 組檢查結果，請重新探索。'],
])('D 組檢查 %s 顯示中文原因，不洩漏內部代碼', (status, explanation) => {
  render(<TiangongValidationProcess loading={false} validation={{
    itemId: 'status-copy',
    evidence: { rows: [], d_exclusion: { status } },
  }} />);
  const region = screen.getByRole('region', { name: '天工驗證過程' });
  expect(within(region).getByText('D 組檢查：' + explanation)).toBeTruthy();
  expect(region.textContent).not.toContain(status);
});
