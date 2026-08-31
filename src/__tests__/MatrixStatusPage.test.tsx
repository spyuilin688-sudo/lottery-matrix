// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { MatrixStatusPage } from '../FeaturePages';

const statusApi = vi.hoisted(() => ({
  fetchMatrixStatus: vi.fn(), listCustomStatusSettings: vi.fn(), saveCustomStatusSetting: vi.fn(), resetCustomStatusSetting: vi.fn(),
}));
vi.mock('../matrix-status-api', () => statusApi);

beforeEach(() => {
  cleanup();
  statusApi.fetchMatrixStatus.mockReset().mockResolvedValue({
    kind: 'status', lottery: '今彩539', drawPeriod: '114000123', analysisVersion: 'v1:status',
    summary: { status: 'RESONANCE', count: 1, message: '具備強烈共振效應' },
    counts: { ACTIVE: 0, FOCUS: 0, RESONANCE: 1, CRITICAL: 0 },
    cards: [{ id: 'card', status: 'RESONANCE', result: ['08'], sameCodeRoadCount: 1, roads: [{ id: 'road', result: ['08'], algorithmType: '加減', streak: 7, predictionDistance: 1, position: 1, lockedNumber: '05' }] }],
    customTriggers: [], detailLocked: false,
  });
});

test('狀態頁使用 API 結果取代固定組數與版路範例', async () => {
  render(<MatrixStatusPage onNavigate={vi.fn()} />);
  expect(await screen.findByText('順球1')).toBeTruthy();
  expect(screen.getByText('05')).toBeTruthy();
  expect(screen.getByText('08')).toBeTruthy();
  expect(screen.getByText('1 組')).toBeTruthy();
  expect(screen.queryByText('24')).toBeNull();
  expect(statusApi.fetchMatrixStatus).toHaveBeenCalledWith('今彩539');
});

test('切換彩種重新讀取狀態，且可進入自訂觸發條件', async () => {
  const navigate = vi.fn();
  render(<MatrixStatusPage onNavigate={navigate} />);
  fireEvent.click(screen.getByRole('radio', { name: '六合彩' }));
  await waitFor(() => expect(statusApi.fetchMatrixStatus).toHaveBeenCalledWith('六合彩'));
  fireEvent.click(screen.getByRole('button', { name: '自訂觸發條件' }));
  expect(navigate).toHaveBeenCalledWith('status-settings');
});

test('自訂觸發條件入口移至狀態頁右下角並沿用首頁快捷設定樣式', () => {
  const { container } = render(<MatrixStatusPage onNavigate={vi.fn()} />);
  const trigger = screen.getByRole('button', { name: '自訂觸發條件' });

  expect(trigger).toHaveClass('bottom-navigation-quick-settings', 'matrix-status-settings-entry');
  expect(trigger.querySelector('.bottom-navigation-quick-settings-visual')).toBeInTheDocument();
  expect(trigger.querySelector('svg')).toBeInTheDocument();
  expect(screen.queryByRole('img', { name: '自訂觸發條件' })).not.toBeInTheDocument();
  expect(container.querySelector('.matrix-title-banner-actions')).not.toBeInTheDocument();
  expect(screen.getByTestId('lottery-switcher')).toHaveClass('lottery-switcher--home-style');
});
