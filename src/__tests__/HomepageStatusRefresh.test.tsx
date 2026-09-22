// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const api = vi.hoisted(() => ({
  fetchMatrixStatusSummaries: vi.fn(),
  fetchLatestLotteryResultState: vi.fn(),
  refreshLatestDraw: vi.fn(),
}));
vi.mock('../matrix-status-api', () => ({ fetchMatrixStatusSummaries: api.fetchMatrixStatusSummaries }));
vi.mock('../lottery-api', async (original) => ({
  ...await original<typeof import('../lottery-api')>(),
  fetchLatestLotteryResultState: api.fetchLatestLotteryResultState,
}));
vi.mock('../useLatestLotteryDraw', () => ({
  useLatestLotteryDraw: () => ({ data: null, loading: false, error: null, refresh: api.refreshLatestDraw }),
}));
import Prototype, { type LotteryId } from '../Prototype';
import { MobileDeviceProvider } from '../mobile/Device';
import { KeyboardProvider } from '../mobile/Keyboard';
import { invalidateMatrixData } from '../matrix-data-revision';
import { updateAlgorithmCacheSession } from '../auth/algorithm-cache-scope';
import { AppDialogProvider } from '../dialog/AppDialog';
import { FIRST_VISIT_GUIDE_SEEN_KEY } from '../onboarding/FirstVisitGuide';
import { API_REQUEST_TIMEOUT_MS } from '../lib/api-resilience';

vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
const lotteries: LotteryId[] = ['今彩539', '天天樂', '六合彩', '大樂透'];
const response = (status = 'ACTIVE') => ({ kind: 'status-summary-batch', items: lotteries.map(lottery => ({ lottery, status: 200, body: { kind: 'status-summary', lottery, summary: { status, count: 1, message: '' } } })) });
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
  vi.setSystemTime(new Date('2026-09-23T12:30:00Z'));
  api.fetchMatrixStatusSummaries.mockReset().mockImplementation(async () => response());
  api.fetchLatestLotteryResultState.mockReset().mockResolvedValue({
    drawDate: '2026-09-23',
    dueLotteries: ['今彩539'],
    items: [{ lottery: '今彩539' }],
  });
  api.refreshLatestDraw.mockReset().mockResolvedValue({
    period: '115000231',
    drawDate: '2026/09/23',
    numbers: ['01', '02', '03', '04', '05'],
    resultStatus: 'confirmed',
  });
});
afterEach(() => { vi.useRealTimers(); });

test('讀取失敗不可顯示成沉寂；下一次更新可恢復', async () => {
  api.fetchMatrixStatusSummaries.mockRejectedValue(new Error('offline'));
  mount();
  await flush();
  expect(screen.queryByRole('button', { name: '今彩539 沉寂' })).toBeNull();
  expect(screen.getByRole('button', { name: '今彩539 讀取失敗' })).toHaveAttribute('data-load-state', 'error');
  api.fetchMatrixStatusSummaries.mockImplementation(async () => response());
  await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000); });
  expect(screen.getByRole('button', { name: '今彩539 啟動' })).toBeInTheDocument();
});

test('開獎資料失效時重新讀取四彩種，連續失效通知合併處理', async () => {
  mount(); await flush();
  api.fetchMatrixStatusSummaries.mockClear().mockImplementation(async () => response('CRITICAL'));
  act(() => { invalidateMatrixData(); invalidateMatrixData(); });
  await flush();
  expect(api.fetchMatrixStatusSummaries).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: '今彩539 臨界' })).toBeInTheDocument();
});

test('首頁在開獎時段且本期未完成時以十分鐘 fallback 更新，不必重開 PWA', async () => {
  api.fetchLatestLotteryResultState.mockResolvedValue({
    drawDate: '2026-09-23',
    dueLotteries: ['今彩539'],
    items: [],
  });
  mount(); await flush();
  api.fetchMatrixStatusSummaries.mockClear().mockImplementation(async (requested: LotteryId[]) => ({
    kind: 'status-summary-batch',
    items: requested.map(lottery => ({
      lottery,
      status: 200,
      body: { kind: 'status-summary', lottery, summary: { status: 'FOCUS', count: 1, message: '' } },
    })),
  }));
  await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000); });
  expect(api.fetchMatrixStatusSummaries).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: '今彩539 聚合' })).toBeInTheDocument();
});

test('批次中的單一彩種失敗不影響其他彩種', async () => {
  const batch = response();
  batch.items[0].status = 504;
  api.fetchMatrixStatusSummaries.mockResolvedValue(batch);
  mount(); await flush();
  expect(screen.getByRole('button', { name: '天天樂 啟動' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '今彩539 讀取失敗' })).toBeInTheDocument();
});

test('批次請求逾時顯示失敗，不誤報沉寂', async () => {
  api.fetchMatrixStatusSummaries.mockImplementation(() => new Promise(() => {}));
  mount(); await flush();
  expect(screen.getByRole('button', { name: '今彩539 讀取中' })).toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS); });
  for (const lottery of lotteries) {
    expect(screen.getByRole('button', { name: `${lottery} 讀取失敗` })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `${lottery} 沉寂` })).toBeNull();
  }
});

test('舊請求晚回應不可覆蓋新一期狀態，卸載後停止刷新', async () => {
  let resolveOld!: (value: ReturnType<typeof response>) => void;
  api.fetchMatrixStatusSummaries.mockImplementation(() => new Promise((resolve) => { resolveOld = resolve; }));
  const view = mount(); await flush();
  api.fetchMatrixStatusSummaries.mockImplementation(async () => response('CRITICAL'));
  act(() => { invalidateMatrixData(); }); await flush();
  await act(async () => { resolveOld(response('DORMANT')); });
  expect(screen.getByRole('button', { name: '今彩539 臨界' })).toBeInTheDocument();
  view.unmount(); api.fetchMatrixStatusSummaries.mockClear();
  act(() => { invalidateMatrixData(); window.dispatchEvent(new Event('online')); });
  await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000); });
  expect(api.fetchMatrixStatusSummaries).not.toHaveBeenCalled();
});

test('切換帳號會取消先前首頁請求並忽略晚回應', async () => {
  let resolveOld!: (value: ReturnType<typeof response>) => void;
  api.fetchMatrixStatusSummaries.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  mount(); await flush();
  const oldSignal = api.fetchMatrixStatusSummaries.mock.calls[0][1] as AbortSignal;
  api.fetchMatrixStatusSummaries.mockImplementation(async () => response('FOCUS'));

  act(() => { updateAlgorithmCacheSession(session('member-b')); });
  await flush();

  expect(oldSignal.aborted).toBe(true);
  expect(screen.getByRole('button', { name: '今彩539 聚合' })).toBeInTheDocument();
  await act(async () => { resolveOld(response('CRITICAL')); });
  expect(screen.queryByRole('button', { name: '今彩539 臨界' })).toBeNull();
  expect(screen.getByRole('button', { name: '今彩539 聚合' })).toBeInTheDocument();
});

test.each([
  ['登出', null],
  ['切換帳號', session('member-b')],
] as const)('離開首頁後%s，回首頁等待新回應時不顯示先前會員狀態', async (_action, nextSession) => {
  api.fetchMatrixStatusSummaries.mockImplementation(async () => response('CRITICAL'));
  mount(); await flush();
  expect(screen.getByRole('button', { name: '今彩539 臨界' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '我的' }));
  await flush();
  api.fetchMatrixStatusSummaries.mockClear();
  act(() => { updateAlgorithmCacheSession(nextSession); });

  let resolveCurrent!: (value: ReturnType<typeof response>) => void;
  api.fetchMatrixStatusSummaries.mockImplementationOnce(() => new Promise((resolve) => { resolveCurrent = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: '首頁' }));
  await flush();

  expect(api.fetchMatrixStatusSummaries).toHaveBeenCalledTimes(1);
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
