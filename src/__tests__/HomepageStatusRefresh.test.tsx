// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const api = vi.hoisted(() => ({ fetchMatrixStatusSummaries: vi.fn() }));
vi.mock('../matrix-status-api', () => api);
vi.mock('../useLatestLotteryDraw', () => ({ useLatestLotteryDraw: () => ({ data: null }) }));
vi.mock('../lib/supabase', () => ({
  getSupabaseClient: () => ({ auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
  } }),
}));
import Prototype, { type LotteryId } from '../Prototype';
import { MobileDeviceProvider } from '../mobile/Device';
import { KeyboardProvider } from '../mobile/Keyboard';
import { invalidateMatrixData } from '../matrix-data-revision';
import { updateAlgorithmCacheSession } from '../auth/algorithm-cache-scope';
import { AppDialogProvider } from '../dialog/AppDialog';
import { FIRST_VISIT_GUIDE_SEEN_KEY } from '../onboarding/FirstVisitGuide';
import type { MatrixStatusSummaryBatchResponse, MatrixStatusCode } from '../matrix-status-api';

vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
const lotteries: LotteryId[] = ['今彩539', '天天樂', '六合彩', '大樂透'];
const response = (status: MatrixStatusCode = 'ACTIVE'): MatrixStatusSummaryBatchResponse => ({
  kind: 'status-summary-batch',
  items: lotteries.map(lottery => ({
    lottery,
    status: 200,
    body: {
      kind: 'status-summary', lottery, drawPeriod: '115217', analysisVersion: 'v1:status',
      summary: { status, count: status === 'DORMANT' ? 0 : 1, message: '' },
    },
  })),
});
const session = (memberId: string, tokenVersion = 1) => ({
  user: { id: memberId },
  access_token: `header.${btoa(JSON.stringify({ session_id: memberId, version: tokenVersion }))}.signature`,
}) as Session;
const mount = () => render(<AppDialogProvider><MobileDeviceProvider><KeyboardProvider><Prototype /></KeyboardProvider></MobileDeviceProvider></AppDialogProvider>);
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
beforeEach(() => {
  window.localStorage.setItem(FIRST_VISIT_GUIDE_SEEN_KEY, '1');
  updateAlgorithmCacheSession(session('member-a'));
  vi.useFakeTimers();
  api.fetchMatrixStatusSummaries.mockReset().mockResolvedValue(response());
});
afterEach(() => { vi.useRealTimers(); });

test('讀取失敗不可顯示成沉寂；下一次更新可恢復', async () => {
  api.fetchMatrixStatusSummaries.mockRejectedValue(new Error('offline'));
  mount();
  await flush();
  expect(screen.queryByRole('button', { name: '今彩539 沉寂' })).toBeNull();
  expect(screen.getByRole('button', { name: '今彩539 讀取失敗' })).toHaveAttribute('data-load-state', 'error');
  api.fetchMatrixStatusSummaries.mockResolvedValue(response());
  await act(async () => { await vi.advanceTimersByTimeAsync(3_600_000); });
  expect(screen.getByRole('button', { name: '今彩539 啟動' })).toBeInTheDocument();
});

test('開獎資料失效時批次重新讀取四彩種，連續失效通知合併處理', async () => {
  mount(); await flush();
  api.fetchMatrixStatusSummaries.mockClear().mockResolvedValue(response('CRITICAL'));
  act(() => { invalidateMatrixData(); invalidateMatrixData(); });
  await flush();
  expect(api.fetchMatrixStatusSummaries).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: '今彩539 臨界' })).toBeInTheDocument();
});

test('首頁持續開啟時每小時更新狀態，不必重開 PWA', async () => {
  mount(); await flush();
  api.fetchMatrixStatusSummaries.mockClear().mockResolvedValue(response('FOCUS'));
  await act(async () => { await vi.advanceTimersByTimeAsync(3_599_999); });
  expect(api.fetchMatrixStatusSummaries).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(api.fetchMatrixStatusSummaries).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: '今彩539 聚合' })).toBeInTheDocument();
});

test('批次結果中單一彩種失敗不影響其餘彩種', async () => {
  const partial = response();
  partial.items[0] = { lottery: '今彩539', status: 404, body: { error: { code: 'ANALYSIS_NOT_READY' } } };
  api.fetchMatrixStatusSummaries.mockResolvedValue(partial);
  mount(); await flush();
  expect(screen.getByRole('button', { name: '天天樂 啟動' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '今彩539 讀取失敗' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '今彩539 沉寂' })).toBeNull();
});

test('批次請求逾時顯示失敗而非沉寂', async () => {
  api.fetchMatrixStatusSummaries.mockReturnValue(new Promise(() => {}));
  mount(); await flush();
  expect(screen.getByRole('button', { name: '今彩539 讀取中' })).toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(screen.getByRole('button', { name: '今彩539 讀取失敗' })).toBeInTheDocument();
});

test('舊請求晚回應不可覆蓋新一期狀態，卸載後停止刷新', async () => {
  let resolveOld!: (value: MatrixStatusSummaryBatchResponse) => void;
  api.fetchMatrixStatusSummaries.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
  const view = mount(); await flush();
  api.fetchMatrixStatusSummaries.mockResolvedValue(response('CRITICAL'));
  act(() => { invalidateMatrixData(); }); await flush();
  await act(async () => { resolveOld(response('DORMANT')); });
  expect(screen.getByRole('button', { name: '今彩539 臨界' })).toBeInTheDocument();
  view.unmount(); api.fetchMatrixStatusSummaries.mockClear();
  act(() => { invalidateMatrixData(); updateAlgorithmCacheSession(null); window.dispatchEvent(new Event('online')); });
  await act(async () => { await vi.advanceTimersByTimeAsync(3_600_000); });
  expect(api.fetchMatrixStatusSummaries).not.toHaveBeenCalled();
});

test('切換帳號會取消先前首頁請求並忽略晚回應', async () => {
  let resolveOld!: (value: MatrixStatusSummaryBatchResponse) => void;
  api.fetchMatrixStatusSummaries.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
  mount(); await flush();
  const oldSignal = api.fetchMatrixStatusSummaries.mock.calls[0][1] as AbortSignal;
  api.fetchMatrixStatusSummaries.mockResolvedValue(response('FOCUS'));
  act(() => { updateAlgorithmCacheSession(session('member-b')); });
  await flush();
  expect(oldSignal.aborted).toBe(true);
  expect(screen.getByRole('button', { name: '今彩539 聚合' })).toBeInTheDocument();
  await act(async () => { resolveOld(response('CRITICAL')); });
  expect(screen.queryByRole('button', { name: '今彩539 臨界' })).toBeNull();
  expect(screen.getByRole('button', { name: '今彩539 聚合' })).toBeInTheDocument();
});

test('登出立即清除會員首頁狀態並重新讀取訪客結果', async () => {
  api.fetchMatrixStatusSummaries.mockResolvedValue(response('CRITICAL'));
  mount(); await flush();
  expect(screen.getByRole('button', { name: '今彩539 臨界' })).toBeInTheDocument();
  let resolveGuest!: (value: MatrixStatusSummaryBatchResponse) => void;
  api.fetchMatrixStatusSummaries.mockReturnValueOnce(new Promise(resolve => { resolveGuest = resolve; }));
  act(() => { updateAlgorithmCacheSession(null); });
  expect(screen.queryByRole('button', { name: '今彩539 臨界' })).toBeNull();
  expect(screen.getByRole('button', { name: '今彩539 讀取中' })).toBeInTheDocument();
  await flush();
  await act(async () => { resolveGuest(response('DORMANT')); });
  expect(screen.getByRole('button', { name: '今彩539 沉寂' })).toBeInTheDocument();
});

test.each([
  ['登出', null],
  ['切換帳號', session('member-b')],
] as const)('離開首頁後%s，回首頁等待新回應時不顯示先前會員狀態', async (_action, nextSession) => {
  api.fetchMatrixStatusSummaries.mockResolvedValue(response('CRITICAL'));
  mount(); await flush();
  expect(screen.getByRole('button', { name: '今彩539 臨界' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '我的' }));
  await flush();
  expect(document.querySelector('.profile-screen')).not.toBeNull();
  expect(screen.queryByRole('button', { name: '今彩539 臨界' })).toBeNull();
  api.fetchMatrixStatusSummaries.mockClear();
  act(() => { updateAlgorithmCacheSession(nextSession); });
  await act(async () => { await vi.advanceTimersByTimeAsync(3_600_000); });
  expect(api.fetchMatrixStatusSummaries).not.toHaveBeenCalled();

  let resolveCurrent!: (value: MatrixStatusSummaryBatchResponse) => void;
  api.fetchMatrixStatusSummaries.mockReturnValueOnce(new Promise(resolve => { resolveCurrent = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: '首頁' }));
  await flush();
  expect(api.fetchMatrixStatusSummaries).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: '今彩539 臨界' })).toBeNull();
  expect(screen.getByRole('button', { name: '今彩539 讀取中' })).toBeInTheDocument();

  await act(async () => { resolveCurrent(response('FOCUS')); });
  expect(screen.getByRole('button', { name: '今彩539 聚合' })).toBeInTheDocument();
});

test('相同登入工作階段更新 token 不重新讀取首頁狀態', async () => {
  mount(); await flush();
  api.fetchMatrixStatusSummaries.mockClear();
  act(() => { updateAlgorithmCacheSession(session('member-a', 2)); });
  await flush();
  expect(api.fetchMatrixStatusSummaries).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: '今彩539 啟動' })).toBeInTheDocument();
});
