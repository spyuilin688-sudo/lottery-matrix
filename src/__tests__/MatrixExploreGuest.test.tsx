// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MatrixExplorePage } from '../features/MatrixExplorePage';
import { fetchExploreValidation, fetchTianyanList, fetchTiangongList } from '../matrix-algorithm-api';
import { resetReadCacheForTests } from '../read-cache';
import { updateAlgorithmCacheSession } from '../auth/algorithm-cache-scope';

const sdk = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn() }));
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ rpc: sdk.rpc, auth: { getSession: sdk.getSession } }) }));
vi.mock('../member-api', () => ({ bootstrapMember: async () => {}, fetchMemberProfile: async () => null }));
vi.mock('../features/shared', () => ({
  FeatureShell: ({ children }: any) => <main>{children}</main>,
  SectionTitle: ({ children }: any) => <h2>{children}</h2>,
  SettingLabelIcon: () => null, MatrixPageSwitcher: () => null, HistoryList: () => null,
  LOTTERIES: ['今彩539', '天天樂', '六合彩', '大樂透'],
}));
vi.mock('../features/MatrixValidation', () => ({ ExploreValidationProcess: () => null, TianyanValidationProcess: () => null, RoadValidationProcess: () => null }));

const response = { kind: 'explore', lottery: '今彩539', drawPeriod: '115000210', analysisVersion: 'v12', status: 'complete', total: 1, duplicateStats: [], items: [{ id: 'guest-row', lockedPosition: 1, number: '03', predictionDistance: 2, consecutive: '準7進8', predictionNumbers: ['22', '26'], algorithmType: '加減', numberOrder: '依號碼由小到大排序' }] };

beforeEach(() => {
  resetReadCacheForTests();
  updateAlgorithmCacheSession(null);
  sdk.getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
  sdk.rpc.mockReset().mockResolvedValue({ data: response, error: null });
});
afterEach(cleanup);

async function start() {
  await act(async () => { render(<MatrixExplorePage onNavigate={vi.fn()} />); });
  fireEvent.click(screen.getByText('二期'));
  fireEvent.click(screen.getByRole('button', { name: '準5+（鎖定2碼）' }));
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
}

test('未登入二期探索可以顯示 RPC 結果', async () => {
  await start();
  expect(await screen.findByText('22.26')).toBeTruthy();
  expect(sdk.rpc).toHaveBeenCalledWith('matrix_explore_list', { p_request: expect.objectContaining({ explorePeriods: 2, exploreRange: '標準範圍', ruleCount: 2 }) });
  expect(screen.queryByRole('alert')).toBeNull();
});

test('訪客可以讀取二期探索驗證過程', async () => {
  sdk.rpc.mockResolvedValue({ data: { ...response, itemId: 'guest-row', validation: { ruleSets: [] } }, error: null });
  await expect(fetchExploreValidation({ lottery: '今彩539', drawPeriod: '115000210', analysisVersion: 'v12' }, 'guest-row', { explorePeriods: 2, exploreRange: '標準範圍' })).resolves.toMatchObject({ itemId: 'guest-row' });
});

test('登入提示使用探索名稱且不顯示空結果', async () => {
  sdk.getSession.mockResolvedValue({ data: { session: null }, error: new Error('session unavailable') });
  await start();
  expect((await screen.findByRole('alert')).textContent).toBe('請先登入後再使用 Matrix 探索');
  expect(screen.queryByText('無符合設定條件')).toBeNull();
  expect(document.querySelector('.result-count')).toBeNull();
});

test('載入中不顯示零筆或空結果，成功空回應才顯示', async () => {
  let finish!: (value: unknown) => void;
  sdk.rpc.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await start();
  await waitFor(() => expect(sdk.rpc).toHaveBeenCalled());
  expect(screen.getByRole('status').textContent).toBe('分析結果載入中');
  expect(document.querySelector('.result-count')).toBeNull();
  expect(screen.queryByText('無符合設定條件')).toBeNull();
  finish({ data: { ...response, total: 0, items: [] }, error: null });
  expect(await screen.findByText('無符合設定條件')).toBeTruthy();
  expect(document.querySelector('.result-count')?.textContent).toContain('0');
});

test('訪客讀取仍遵守 RPC 的會員權限拒絕', async () => {
  sdk.rpc.mockResolvedValue({ data: null, error: { message: 'FORBIDDEN' } });
  await start();
  expect((await screen.findByRole('alert')).textContent).toBe('目前會員權限無法使用此設定');
  expect(screen.queryByText('無符合設定條件')).toBeNull();
  expect(document.querySelector('.result-count')).toBeNull();
});

test('天衍與天工仍要求登入', async () => {
  await expect(fetchTianyanList({ lottery: '今彩539', selectedStreaks: ['準5進6'], sameCode: false })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  await expect(fetchTiangongList({ lottery: '今彩539', periodRange: 50, mode: 'two-stage', hitCondition: '準2進3', exploreDirections: ['固定'], firstStageDirections: ['固定'], firstRoadTypes: ['加減'] })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  expect(sdk.rpc).not.toHaveBeenCalled();
});
