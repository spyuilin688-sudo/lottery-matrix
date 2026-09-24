// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const api = vi.hoisted(() => ({
  fetchLatestLotteryDraw: vi.fn(),
  fetchLatestLotteryResultState: vi.fn(),
  fetchMatrixStatusSummaries: vi.fn(),
}));
vi.mock('../lottery-api', async original => ({
  ...await original<typeof import('../lottery-api')>(),
  fetchLatestLotteryDraw: api.fetchLatestLotteryDraw,
  fetchLatestLotteryResultState: api.fetchLatestLotteryResultState,
}));
vi.mock('../matrix-status-api', () => ({ fetchMatrixStatusSummaries: api.fetchMatrixStatusSummaries }));

import Prototype from '../Prototype';
import { AppDialogProvider } from '../dialog/AppDialog';
import { MobileDeviceProvider } from '../mobile/Device';
import { KeyboardProvider } from '../mobile/Keyboard';
import { FIRST_VISIT_GUIDE_SEEN_KEY } from '../onboarding/FirstVisitGuide';
import { invalidateMatrixData } from '../matrix-data-revision';

vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
const mount = () => render(<AppDialogProvider><MobileDeviceProvider><KeyboardProvider><Prototype /></KeyboardProvider></MobileDeviceProvider></AppDialogProvider>);

beforeEach(() => {
  window.localStorage.setItem(FIRST_VISIT_GUIDE_SEEN_KEY, '1');
  api.fetchLatestLotteryResultState.mockReset().mockResolvedValue({ drawDate: '2026-09-23', dueLotteries: [], items: [] });
  api.fetchMatrixStatusSummaries.mockReset().mockImplementation(async (lotteries: string[]) => ({
    kind: 'status-summary-batch',
    items: lotteries.map(lottery => ({ lottery, status: 200, body: { kind: 'status-summary', summary: { status: 'DORMANT', count: 0, message: '' } } })),
  }));
  api.fetchLatestLotteryDraw.mockReset();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('首頁開獎資料先顯示讀取中，失敗時顯示錯誤且不顯示假的倒數', async () => {
  let rejectDraw: ((reason?: unknown) => void) | undefined;
  api.fetchLatestLotteryDraw.mockImplementationOnce(() => new Promise((_, reject) => { rejectDraw = reject; }));
  mount();
  expect(screen.getByTestId('latest-draw-card')).toHaveTextContent('開獎資料讀取中');
  await act(async () => { rejectDraw?.(new Error('offline')); });
  expect(screen.getByTestId('latest-draw-card')).toHaveTextContent('開獎資料讀取失敗');
  expect(screen.getByTestId('latest-draw-card')).not.toHaveTextContent('00:00:00');
});

test('首頁開獎資料成功回傳空值時明確顯示尚無資料', async () => {
  api.fetchLatestLotteryDraw.mockResolvedValueOnce(null);
  mount();
  await act(async () => {});
  expect(screen.getByTestId('latest-draw-card')).toHaveTextContent('尚無開獎資料');
  expect(screen.getByTestId('latest-draw-card')).not.toHaveTextContent('00:00:00');
});

test('首頁成功取得開獎資料仍呈現球號和下次開獎日期', async () => {
  api.fetchLatestLotteryDraw.mockResolvedValueOnce({
    period: '115000231', drawDate: '2026/09/23', numbers: ['01', '02', '03', '04', '05'],
    nextDrawAt: '2026-09-25T12:00:00Z',
  });
  mount(); await act(async () => {});
  const card = screen.getByTestId('latest-draw-card');
  expect(card).toHaveTextContent('115000231');
  expect(card.querySelectorAll('.number-ball-component')).toHaveLength(5);
  expect(card).not.toHaveTextContent('開獎資料讀取失敗');
});

test('已有開獎資料後刷新失敗時標示更新失敗並保留上次資料', async () => {
  api.fetchLatestLotteryDraw.mockResolvedValueOnce({
    period: '115000231', drawDate: '2026/09/23', numbers: ['01', '02', '03', '04', '05'],
    nextDrawAt: '2026-09-25T12:00:00Z',
  }).mockRejectedValueOnce(new Error('offline'));
  mount(); await act(async () => {});
  act(() => invalidateMatrixData());
  await waitFor(() => expect(api.fetchLatestLotteryDraw).toHaveBeenCalledTimes(2));

  const card = screen.getByTestId('latest-draw-card');
  expect(card).toHaveTextContent('115000231');
  expect(card.querySelectorAll('.number-ball-component')).toHaveLength(5);
  expect(card).toHaveTextContent('更新失敗，顯示上次資料');
  expect(card.querySelector('[data-testid="next-draw-info"]')).toBeNull();
});

test('開獎 API 回傳期數但無球號時顯示無資料，不顯示期數及假倒數', async () => {
  api.fetchLatestLotteryDraw.mockResolvedValueOnce({
    period: '115000231', drawDate: '2026/09/23', numbers: [],
    nextDrawAt: '2026-09-25T12:00:00Z',
  });
  mount(); await act(async () => {});

  const card = screen.getByTestId('latest-draw-card');
  expect(card).toHaveTextContent('尚無開獎資料');
  expect(card).not.toHaveTextContent('115000231');
  expect(card.querySelectorAll('.number-ball-component')).toHaveLength(0);
  expect(card.querySelector('.special-ball-group')).toBeNull();
  expect(card.querySelector('[data-testid="next-draw-info"]')).toBeNull();
});
