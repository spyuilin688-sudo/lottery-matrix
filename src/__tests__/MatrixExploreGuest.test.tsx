// @vitest-environment jsdom
import { render } from '../../test/render-with-dialog';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { MatrixExplorePage } from '../features/MatrixExplorePage';
import { fetchExploreList, fetchExploreValidation, fetchTianyanList, fetchTiangongList } from '../matrix-algorithm-api';
import { resetReadCacheForTests } from '../read-cache';
import { updateAlgorithmCacheSession } from '../auth/algorithm-cache-scope';

const sdk = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn(), profile: vi.fn() }));
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => ({ rpc: sdk.rpc, auth: { getSession: sdk.getSession } }) }));
vi.mock('../member-api', () => ({ bootstrapMember: async () => {}, fetchMemberProfile: sdk.profile }));
vi.mock('../permission-settings', () => ({
  refreshPermissionSettings: vi.fn().mockResolvedValue({
    subscriptionPurchaseVisible: false,
    registeredMemberFreeAccess: false,
    revision: 1,
    updatedAt: '2026-09-10T00:00:00.000Z',
  } satisfies import('../permission-settings').PermissionSettings),
  usePermissionSettings: () => null,
}));
vi.mock('../features/shared', () => ({
  FeatureShell: ({ children }: any) => <main>{children}</main>,
  SectionTitle: ({ children }: any) => <h2>{children}</h2>,
  SettingLabelIcon: () => null, MatrixPageSwitcher: () => null, LotteryTabs: () => null, HistoryList: () => null,
  LOTTERIES: ['今彩539', '天天樂', '六合彩', '大樂透'],
}));
vi.mock('../features/MatrixValidation', () => ({ ExploreValidationProcess: () => null, TianyanValidationProcess: () => null, RoadValidationProcess: () => null }));

const response = { kind: 'explore', lottery: '今彩539', drawPeriod: '115000210', analysisVersion: '115000210:matrix-python-v13', status: 'complete', total: 1, duplicateStats: [], items: [{ id: 'guest-row', lockedPosition: 1, number: '03', predictionDistance: 2, consecutive: '準7進8', predictionNumbers: ['22', '26'], algorithmType: '加減', numberOrder: '依號碼由小到大排序' }] };

beforeEach(() => {
  resetReadCacheForTests();
  updateAlgorithmCacheSession(null);
  sdk.getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
  sdk.rpc.mockReset().mockResolvedValue({ data: response, error: null });
  sdk.profile.mockReset().mockResolvedValue(null);
});
afterEach(cleanup);

async function start() {
  await act(async () => { render(<MatrixExplorePage onNavigate={vi.fn()} />); });
  fireEvent.click(screen.getByText('二期'));
  fireEvent.click(screen.getByRole('button', { name: '準5+ (鎖定2碼)' }));
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
  await expect(fetchExploreValidation({ lottery: '今彩539', drawPeriod: '115000210', analysisVersion: '115000210:matrix-python-v13' }, 'guest-row', { explorePeriods: 2, exploreRange: '標準範圍' })).resolves.toMatchObject({ itemId: 'guest-row' });
});

test('登入提示使用探索名稱且不顯示空結果', async () => {
  sdk.getSession.mockResolvedValue({ data: { session: null }, error: new Error('session unavailable') });
  await start();
  expect((await screen.findByRole('dialog', { name: '請先登入' })).textContent).toContain('請先登入後再使用 Matrix 探索');
  fireEvent.click(screen.getByRole('button', { name: '知道了' }));
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
  expect((await screen.findByRole('dialog', { name: '無法使用 Matrix 探索' })).textContent).toContain('目前會員權限無法使用此設定');
  fireEvent.click(screen.getByRole('button', { name: '知道了' }));
  expect((await screen.findByRole('alert')).textContent).toBe('目前會員權限無法使用此設定');
  expect(screen.queryByText('無符合設定條件')).toBeNull();
  expect(document.querySelector('.result-count')).toBeNull();
});

test('天衍與天工仍要求登入', async () => {
  await expect(fetchTianyanList({ lottery: '今彩539', selectedStreaks: ['準5進6'], sameCode: false })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  await expect(fetchTiangongList({ lottery: '今彩539', periodRange: 50, mode: 'two-stage', hitCondition: '準2進3', exploreDirections: ['固定'], firstStageDirections: ['固定'], firstRoadTypes: ['加減'] })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  expect(sdk.rpc).not.toHaveBeenCalled();
});

test('訪客選擇七期時須登入，且不送出探索請求', async () => {
  await expect(fetchExploreList({ lottery: '今彩539', numberOrder: '依號碼由小到大排序', explorePeriods: 7, exploreDateOffset: 0, exploreRange: '標準範圍', ruleCount: 1, roadTypes: ['加減'], selectedStreaks: ['準5進6'], sameCode: false })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  expect(sdk.rpc).not.toHaveBeenCalled();
});

test('Matrix 探索進頁選取會員實際最高期數及範圍', async () => {
  sdk.profile.mockResolvedValue({ lineUserId: 'line-member', planName: null, isLifetime: false, exploreEntitlements: { canUseSeven: true, canUseThirteen: false, canUseFullRange: true } });
  await act(async () => { render(<MatrixExplorePage title="Matrix 探索" onNavigate={vi.fn()} />); });
  expect(screen.getByText('七期').getAttribute('data-selected')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: '進階探索設定' }));
  expect(screen.getByText('完整範圍').closest('button')?.getAttribute('data-selected')).toBe('true');
});

test('Matrix 天衍只顯示全寬十三期與完整範圍', async () => {
  sdk.profile.mockResolvedValue({ lineUserId: 'line-member', planName: null, isLifetime: false, exploreEntitlements: { canUseSeven: true, canUseThirteen: false, canUseFullRange: false } });
  await act(async () => { render(<MatrixExplorePage title="Matrix 天衍" onNavigate={vi.fn()} />); });
  const thirteen = screen.getByText('十三期').closest('button');
  expect(thirteen?.getAttribute('data-selected')).toBe('true');
  expect(thirteen?.parentElement?.classList.contains('one')).toBe(true);
  expect(screen.queryByText('二期')).toBeNull();
  expect(screen.queryByText('七期')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '進階天衍設定' }));
  const fullRange = screen.getByText('完整範圍').closest('button');
  expect(fullRange?.getAttribute('data-selected')).toBe('true');
  expect(fullRange?.parentElement?.classList.contains('one')).toBe(true);
  expect(screen.queryByText('標準範圍')).toBeNull();
});

test.each(['加減版路', '合值版路', '拖牌版路'])('二期鎖定1碼的%s預設勾選準4進5', async (road) => {
  await act(async () => { render(<MatrixExplorePage onNavigate={vi.fn()} />); });
  fireEvent.click(screen.getByText(road));
  fireEvent.click(screen.getByRole('button', { name: '開始探索' }));
  await screen.findByText('22.26');
  fireEvent.click(screen.getByRole('button', { name: '連準篩選' }));
  expect(screen.getByRole('button', { name: '準4進5' }).getAttribute('aria-pressed')).toBe('true');
  expect(sdk.rpc).toHaveBeenCalledWith('matrix_explore_list', { p_request: expect.objectContaining({ explorePeriods: 2, ruleCount: 1, selectedStreaks: ['準4進5', '準5進6', '準6進7', '準7進8'] }) });
});

test('天衍固定將十三期與完整範圍送至實際 RPC', async () => {
  sdk.profile.mockResolvedValue({ exploreEntitlements: { canUseSeven: true, canUseThirteen: true, canUseFullRange: true } });
  const session = { user: { id: 'member' }, access_token: 'test-session' };
  updateAlgorithmCacheSession(session as any);
  sdk.getSession.mockResolvedValue({ data: { session }, error: null });
  sdk.rpc.mockResolvedValue({ data: { ...response, kind: 'tianyan', items: [], total: 0 }, error: null });
  await act(async () => { render(<MatrixExplorePage title="Matrix 天衍" onNavigate={vi.fn()} />); });
  fireEvent.click(screen.getByRole('button', { name: '開始天衍' }));
  await waitFor(() => expect(sdk.rpc).toHaveBeenLastCalledWith('matrix_tianyan_list', { p_request: expect.objectContaining({ explorePeriods: 13, exploreRange: '完整範圍' }) }));
});
