// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { FeaturePageRouter } from '../FeaturePagesPatched';
import { useLotteryHistory, useTimedState } from '../features/shared';
import * as lotteryApi from '../lottery-api';

vi.mock('../lottery-api', async (original) => ({
  ...await original<typeof import('../lottery-api')>(),
  fetchLotteryHistory: vi.fn().mockResolvedValue([]),
  fetchLotteryHistoryYears: vi.fn().mockResolvedValue(['2027', '2023', '2007']),
}));
beforeEach(() => {
  sessionStorage.clear(); vi.clearAllMocks();
  vi.mocked(lotteryApi.fetchLotteryHistory).mockResolvedValue([]);
  vi.mocked(lotteryApi.fetchLotteryHistoryYears).mockResolvedValue(['2027', '2023', '2007']);
});
afterEach(() => vi.restoreAllMocks());

test('storage quota failure preserves editable state and later writes can recover', () => {
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
  const { result } = renderHook(() => useTimedState('reliability', 'initial'));
  act(() => result.current[1]('edited'));
  expect(result.current[0]).toBe('edited');
  write.mockRestore();
  act(() => result.current[1]('recovered'));
  expect(JSON.parse(sessionStorage.getItem('matrix-quick:reliability')!).value).toBe('recovered');
});

test('shared history requests exactly the selected number of draws', async () => {
  renderHook(() => useLotteryHistory('今彩539', 1000));
  await waitFor(() => expect(lotteryApi.fetchLotteryHistory).toHaveBeenCalledWith('今彩539', 1000));
});

test('active history page uses actual years outside the loaded range and exact limits', async () => {
  vi.mocked(lotteryApi.fetchLotteryHistory).mockResolvedValue([{ period: '116001', drawDate: '2027/01/02', numbers: ['01','02','03','04','05'] }]);
  render(<FeaturePageRouter screen="history" onNavigate={vi.fn()} />);
  await waitFor(() => expect(Array.from((screen.getByRole('combobox', { name: '年份' }) as HTMLSelectElement).options).map(o => o.value)).toEqual(['2027', '2023', '2007']));
  expect(lotteryApi.fetchLotteryHistory).toHaveBeenCalledWith('今彩539', 1);
  expect(lotteryApi.fetchLotteryHistory).toHaveBeenCalledWith('今彩539', 1000);
  fireEvent.change(screen.getByRole('combobox', { name: '年份' }), { target: { value: '2007' } });
  expect((screen.getByRole('combobox', { name: '年份' }) as HTMLSelectElement).value).toBe('2007');
});


test('a late year response from the previous lottery cannot replace the selected lottery', async () => {
  let finishOld!: (years: string[]) => void;
  vi.mocked(lotteryApi.fetchLotteryHistoryYears).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; })).mockResolvedValue(['2026', '1990']);
  render(<FeaturePageRouter screen="history" onNavigate={vi.fn()} />);
  fireEvent.change(screen.getByRole('combobox', { name: '彩種' }), { target: { value: '六合彩' } });
  await screen.findByRole('option', { name: '1990' });
  await act(async () => finishOld(['2027', '2007']));
  expect(screen.queryByRole('option', { name: '2007' })).toBeNull();
  expect(screen.getByRole('option', { name: '1990' })).not.toBeNull();
});

test('blocked browser storage does not crash the active history page and year failures can retry', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
  vi.mocked(lotteryApi.fetchLotteryHistoryYears).mockRejectedValueOnce(new Error('offline'));
  render(<FeaturePageRouter screen="history" onNavigate={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: '重試年份' }));
  await screen.findByRole('option', { name: '2007' });
  expect(screen.getByRole('combobox', { name: '年份' })).not.toBeNull();
});
