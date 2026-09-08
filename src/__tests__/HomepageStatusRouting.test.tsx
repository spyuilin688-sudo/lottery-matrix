// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

const statusApi = vi.hoisted(() => ({ fetchMatrixStatus: vi.fn() }));

vi.mock('../matrix-status-api', () => statusApi);
vi.mock('../useLatestLotteryDraw', () => ({ useLatestLotteryDraw: () => ({ data: null }) }));

import Prototype, { type LotteryId } from '../Prototype';
import { MobileDeviceProvider } from '../mobile/Device';
import { KeyboardProvider } from '../mobile/Keyboard';
import { AppDialogProvider } from '../dialog/AppDialog';
import { FIRST_VISIT_GUIDE_SEEN_KEY } from '../onboarding/FirstVisitGuide';

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  disconnect() {}
  unobserve() {}
});

const statusByLottery: Record<LotteryId, 'ACTIVE' | 'FOCUS' | 'RESONANCE' | 'CRITICAL' | 'DORMANT'> = {
  今彩539: 'ACTIVE',
  天天樂: 'FOCUS',
  六合彩: 'DORMANT',
  大樂透: 'CRITICAL',
};

beforeEach(() => {
  window.localStorage.setItem(FIRST_VISIT_GUIDE_SEEN_KEY, '1');
  statusApi.fetchMatrixStatus.mockReset().mockImplementation(async (lottery: LotteryId) => ({
    kind: 'status',
    lottery,
    drawPeriod: '114000123',
    analysisVersion: 'v1:status',
    summary: { status: statusByLottery[lottery], count: 0, message: '本期尚無符合條件的狀態。' },
    counts: { ACTIVE: 0, FOCUS: 0, RESONANCE: 0, CRITICAL: 0 },
    cards: [],
    customTriggers: [],
    detailLocked: false,
  }));
});

test('首頁四個固定彩種各自讀取狀態，且點擊後開啟相同彩種資訊', async () => {
  render(
    <AppDialogProvider><MobileDeviceProvider>
      <KeyboardProvider>
        <Prototype />
      </KeyboardProvider>
    </MobileDeviceProvider></AppDialogProvider>,
  );

  await waitFor(() => {
    expect(statusApi.fetchMatrixStatus).toHaveBeenCalledWith('今彩539');
    expect(statusApi.fetchMatrixStatus).toHaveBeenCalledWith('天天樂');
    expect(statusApi.fetchMatrixStatus).toHaveBeenCalledWith('六合彩');
    expect(statusApi.fetchMatrixStatus).toHaveBeenCalledWith('大樂透');
  });

  const dormantCard = screen.getByRole('button', { name: '六合彩 沉寂' });
  expect(dormantCard.querySelector('.matrix-status-artwork')).toHaveAttribute('src', '/assets/lottery/status/沉寂.png');

  fireEvent.click(dormantCard);

  await waitFor(() => expect(screen.getByTestId('lottery-switcher')).toHaveAttribute('data-selected-lottery', '六合彩'));
});
