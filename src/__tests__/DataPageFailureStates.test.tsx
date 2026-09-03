// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const lotteryApi = vi.hoisted(() => ({
  fetchLotteryHistory: vi.fn(),
  fetchTongXing: vi.fn(),
  fetchNumberReference: vi.fn(),
}));
const memberApi = vi.hoisted(() => ({
  fetchMemberPaymentHistory: vi.fn(),
}));

vi.mock('../lottery-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lottery-api')>()),
  fetchLotteryHistory: lotteryApi.fetchLotteryHistory,
  fetchTongXing: lotteryApi.fetchTongXing,
  fetchNumberReference: lotteryApi.fetchNumberReference,
}));

vi.mock('../member-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../member-api')>()),
  fetchMemberPaymentHistory: memberApi.fetchMemberPaymentHistory,
}));

import { FeaturePageRouter } from '../FeaturePagesPatched';

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  lotteryApi.fetchLotteryHistory.mockResolvedValue([]);
  lotteryApi.fetchTongXing.mockResolvedValue({ groups: [] });
  lotteryApi.fetchNumberReference.mockResolvedValue({ items: [] });
  memberApi.fetchMemberPaymentHistory.mockResolvedValue([]);
  window.requestAnimationFrame = (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  };
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

describe('data page request failures are not normal empty data', () => {
  test('歷史開獎號碼 API 失敗時顯示 error + retry', async () => {
    lotteryApi.fetchLotteryHistory.mockRejectedValue(new Error('history offline'));
    render(<FeaturePageRouter screen="history" onNavigate={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('歷史開獎號碼載入失敗');
    expect(screen.getByRole('button', { name: '重新載入歷史開獎號碼' })).toBeEnabled();
  });

  test('Matrix 同星 API 失敗時顯示 error + retry', async () => {
    lotteryApi.fetchTongXing.mockRejectedValueOnce(new Error('tongxing offline'));
    render(<FeaturePageRouter screen="tongxing" onNavigate={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Matrix 同星資料載入失敗');
    expect(screen.getByRole('button', { name: '重新載入 Matrix 同星資料' })).toBeEnabled();
  });

  test('號碼對照單 API 失敗時顯示 error + retry', async () => {
    lotteryApi.fetchNumberReference.mockRejectedValueOnce(new Error('reference offline'));
    render(<FeaturePageRouter screen="reference" onNavigate={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '開始探索' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('號碼對照資料載入失敗');
    expect(screen.getByRole('button', { name: '重新載入號碼對照資料' })).toBeEnabled();
  });

  test('付款紀錄 API 失敗時顯示 error + retry，而不是正常空資料', async () => {
    memberApi.fetchMemberPaymentHistory.mockRejectedValueOnce(new Error('payment offline'));
    render(<FeaturePageRouter screen="payment-history" onNavigate={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('付款紀錄載入失敗');
    expect(screen.getByRole('button', { name: '重新載入付款紀錄' })).toBeEnabled();
    expect(screen.queryByText('目前沒有付款紀錄。')).not.toBeInTheDocument();
  });
});
