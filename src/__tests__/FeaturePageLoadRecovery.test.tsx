// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

const loader = vi.hoisted(() => {
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((_resolve, fail) => { reject = fail; });
  return { promise, reject };
});

vi.mock('../FeaturePagesPatched', async () => {
  const { createElement, lazy } = await import('react');
  const Page = lazy(() => loader.promise.then(() => ({ default: () => null })));
  return { FeaturePageRouter: () => createElement(Page) };
});
vi.mock('../useLatestLotteryDraw', () => ({ useLatestLotteryDraw: () => ({ data: null }) }));
vi.mock('../matrix-status-api', () => ({ fetchMatrixStatus: async () => { throw new Error('unused offline status'); } }));

import Prototype from '../Prototype';
import { MobileDeviceProvider } from '../mobile/Device';
import { KeyboardProvider } from '../mobile/Keyboard';
import { AppDialogProvider } from '../dialog/AppDialog';
import { FIRST_VISIT_GUIDE_SEEN_KEY } from '../onboarding/FirstVisitGuide';

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  disconnect() {}
  unobserve() {}
});

function openProfile() {
  window.localStorage.setItem(FIRST_VISIT_GUIDE_SEEN_KEY, '1');
  render(<AppDialogProvider><MobileDeviceProvider><KeyboardProvider><Prototype /></KeyboardProvider></MobileDeviceProvider></AppDialogProvider>);
  fireEvent.click(screen.getByRole('button', { name: '我的' }));
}

afterEach(() => vi.restoreAllMocks());

test('pending and rejected feature imports retain recovery and allow returning to the home screen', async () => {
  openProfile();
  expect(await screen.findByRole('status')).toHaveTextContent('載入中');
  fireEvent.click(screen.getByRole('button', { name: '返回首頁' }));
  expect(screen.getByRole('navigation', { name: '底部導覽' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Matrix Core' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '我的' }));
  await screen.findByRole('status');
  const expectedError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await act(async () => {
    loader.reject(new TypeError('Failed to fetch dynamically imported module'));
  });
  expect(await screen.findByRole('alert')).toHaveTextContent('頁面載入失敗');
  expect(screen.getByRole('button', { name: '重新載入' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: '返回首頁' }));
  expect(screen.getByRole('button', { name: 'Matrix Core' })).toBeInTheDocument();
  expectedError.mockRestore();
});
