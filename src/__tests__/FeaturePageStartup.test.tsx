// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

vi.mock('../useLatestLotteryDraw', () => ({ useLatestLotteryDraw: () => ({ data: null }) }));
vi.mock('../matrix-status-api', () => ({ fetchMatrixStatus: async () => { throw new Error('offline status'); } }));

import Prototype from '../Prototype';
import { AppDialogProvider } from '../dialog/AppDialog';
import { MobileDeviceProvider } from '../mobile/Device';
import { KeyboardProvider } from '../mobile/Keyboard';
import { FIRST_VISIT_GUIDE_SEEN_KEY } from '../onboarding/FirstVisitGuide';

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  disconnect() {}
  unobserve() {}
});

test('first navigation renders real feature pages immediately without waiting for a page import', () => {
  window.localStorage.setItem(FIRST_VISIT_GUIDE_SEEN_KEY, '1');
  render(<AppDialogProvider><MobileDeviceProvider><KeyboardProvider><Prototype /></KeyboardProvider></MobileDeviceProvider></AppDialogProvider>);

  fireEvent.click(screen.getByRole('button', { name: '我的' }));
  expect(screen.getByRole('heading', { name: '會員相關' })).toBeInTheDocument();
  expect(screen.queryByText('載入中…')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '首頁' }));
  fireEvent.click(screen.getByRole('button', { name: '連碰立柱計算機' }));
  expect(screen.getByRole('heading', { name: '連碰設定' })).toBeInTheDocument();
  expect(screen.queryByText('載入中…')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '立柱計算機' }));
  expect(screen.getByRole('heading', { name: '立柱設定' })).toBeInTheDocument();
});
