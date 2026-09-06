// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const api = vi.hoisted(() => ({ fetchMatrixStatus: vi.fn() }));
vi.mock('../matrix-status-api', () => api);
vi.mock('../useLatestLotteryDraw', () => ({ useLatestLotteryDraw: () => ({ data: null }) }));
import Prototype, { type LotteryId } from '../Prototype';
import { MobileDeviceProvider } from '../mobile/Device';
import { KeyboardProvider } from '../mobile/Keyboard';
import { invalidateMatrixData } from '../matrix-data-revision';

vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
const response = (lottery: LotteryId, status = 'ACTIVE') => ({ lottery, summary: { status, count: 1, message: '' } });
const mount = () => render(<MobileDeviceProvider><KeyboardProvider><Prototype /></KeyboardProvider></MobileDeviceProvider>);
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
beforeEach(() => { vi.useFakeTimers(); api.fetchMatrixStatus.mockReset().mockImplementation(async (lottery: LotteryId) => response(lottery)); });
afterEach(() => { vi.useRealTimers(); });

test('讀取失敗不可顯示成沉寂；下一次更新可恢復', async () => {
  api.fetchMatrixStatus.mockRejectedValue(new Error('offline'));
  mount();
  await flush();
  expect(screen.queryByRole('button', { name: '今彩539 沉寂' })).toBeNull();
  expect(screen.getByRole('button', { name: '今彩539 讀取失敗' })).toHaveAttribute('data-load-state', 'error');
  api.fetchMatrixStatus.mockImplementation(async (lottery: LotteryId) => response(lottery));
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(screen.getByRole('button', { name: '今彩539 啟動' })).toBeInTheDocument();
});

test('開獎資料失效時重新讀取四彩種，連續失效通知合併處理', async () => {
  mount(); await flush();
  api.fetchMatrixStatus.mockClear().mockImplementation(async (lottery: LotteryId) => response(lottery, 'CRITICAL'));
  act(() => { invalidateMatrixData(); invalidateMatrixData(); });
  await flush();
  expect(api.fetchMatrixStatus).toHaveBeenCalledTimes(4);
  expect(screen.getByRole('button', { name: '今彩539 臨界' })).toBeInTheDocument();
});

test('首頁持續開啟時更新狀態，不必重開 PWA', async () => {
  mount(); await flush();
  api.fetchMatrixStatus.mockClear().mockImplementation(async (lottery: LotteryId) => response(lottery, 'FOCUS'));
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(api.fetchMatrixStatus).toHaveBeenCalledTimes(4);
  expect(screen.getByRole('button', { name: '今彩539 聚合' })).toBeInTheDocument();
});

test('一個彩種沒有回應不阻擋其他彩種，逾時顯示失敗', async () => {
  api.fetchMatrixStatus.mockImplementation((lottery: LotteryId) => lottery === '今彩539' ? new Promise(() => {}) : Promise.resolve(response(lottery)));
  mount(); await flush();
  expect(screen.getByRole('button', { name: '天天樂 啟動' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '今彩539 讀取中' })).toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(8_000); });
  expect(screen.getByRole('button', { name: '今彩539 讀取失敗' })).toBeInTheDocument();
});

test('舊請求晚回應不可覆蓋新一期狀態，卸載後停止刷新', async () => {
  let resolveOld!: (value: ReturnType<typeof response>) => void;
  api.fetchMatrixStatus.mockImplementation((lottery: LotteryId) => lottery === '今彩539'
    ? new Promise((resolve) => { resolveOld = resolve; })
    : Promise.resolve(response(lottery)));
  const view = mount(); await flush();
  api.fetchMatrixStatus.mockImplementation(async (lottery: LotteryId) => response(lottery, 'CRITICAL'));
  act(() => { invalidateMatrixData(); }); await flush();
  await act(async () => { resolveOld(response('今彩539', 'DORMANT')); });
  expect(screen.getByRole('button', { name: '今彩539 臨界' })).toBeInTheDocument();
  view.unmount(); api.fetchMatrixStatus.mockClear();
  act(() => { invalidateMatrixData(); window.dispatchEvent(new Event('online')); });
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(api.fetchMatrixStatus).not.toHaveBeenCalled();
});
