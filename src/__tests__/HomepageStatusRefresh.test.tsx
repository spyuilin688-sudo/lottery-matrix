// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const api = vi.hoisted(() => ({ fetchMatrixStatusSummaries: vi.fn() }));
vi.mock('../matrix-status-api', () => api);
vi.mock('../useLatestLotteryDraw', () => ({ useLatestLotteryDraw: () => ({ data: null }) }));
import Prototype, { type LotteryId } from '../Prototype';
import { MobileDeviceProvider } from '../mobile/Device';
import { KeyboardProvider } from '../mobile/Keyboard';
import { invalidateMatrixData } from '../matrix-data-revision';
import { AppDialogProvider } from '../dialog/AppDialog';
import { FIRST_VISIT_GUIDE_SEEN_KEY } from '../onboarding/FirstVisitGuide';
import { API_REQUEST_TIMEOUT_MS } from '../lib/api-resilience';

vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
const lotteries: LotteryId[] = ['今彩539', '天天樂', '六合彩', '大樂透'];
const response = (status = 'ACTIVE') => ({ kind: 'status-summary-batch', items: lotteries.map(lottery => ({ lottery, status: 200, body: { kind: 'status-summary', lottery, summary: { status, count: 1, message: '' } } })) });
const mount = () => render(<AppDialogProvider><MobileDeviceProvider><KeyboardProvider><Prototype /></KeyboardProvider></MobileDeviceProvider></AppDialogProvider>);
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
beforeEach(() => { window.localStorage.setItem(FIRST_VISIT_GUIDE_SEEN_KEY, '1'); vi.useFakeTimers(); api.fetchMatrixStatusSummaries.mockReset().mockImplementation(async () => response()); });
afterEach(() => { vi.useRealTimers(); });

test('讀取失敗不可顯示成沉寂；下一次更新可恢復', async () => {
  api.fetchMatrixStatusSummaries.mockRejectedValue(new Error('offline'));
  mount();
  await flush();
  expect(screen.queryByRole('button', { name: '今彩539 沉寂' })).toBeNull();
  expect(screen.getByRole('button', { name: '今彩539 讀取失敗' })).toHaveAttribute('data-load-state', 'error');
  api.fetchMatrixStatusSummaries.mockImplementation(async () => response());
  await act(async () => { await vi.advanceTimersByTimeAsync(3_600_000); });
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

test('首頁持續開啟時更新狀態，不必重開 PWA', async () => {
  mount(); await flush();
  api.fetchMatrixStatusSummaries.mockClear().mockImplementation(async () => response('FOCUS'));
  await act(async () => { await vi.advanceTimersByTimeAsync(3_600_000); });
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
  await act(async () => { await vi.advanceTimersByTimeAsync(3_600_000); });
  expect(api.fetchMatrixStatusSummaries).not.toHaveBeenCalled();
});
