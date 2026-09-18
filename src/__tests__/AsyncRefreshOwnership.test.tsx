// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FeaturePageRouter } from '../FeaturePagesPatched';
import { useLatestLotteryDraw } from '../useLatestLotteryDraw';
import { fetchLatestLotteryDraw, fetchLotteryHistory, type LotteryDrawRecord } from '../lottery-api';
import { useLotteryHistory } from '../features/shared';

const refreshListeners = vi.hoisted(() => new Set<() => void>());
vi.mock('../lottery-data-refresh', () => ({
  subscribeLotteryRefresh: (_lottery: string, listener: () => void) => {
    refreshListeners.add(listener);
    return () => refreshListeners.delete(listener);
  },
}));
vi.mock('../lottery-api', async (original) => ({
  ...await original<typeof import('../lottery-api')>(),
  fetchLatestLotteryDraw: vi.fn(),
  fetchLotteryHistory: vi.fn(),
  fetchLotteryHistoryYears: vi.fn().mockResolvedValue(['2026']),
}));

const draw = (period: string): LotteryDrawRecord => ({ period, drawDate: '2026/09/14', numbers: ['01', '02', '03', '04', '05'] });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => { sessionStorage.clear(); vi.clearAllMocks(); });
afterEach(() => { cleanup(); refreshListeners.clear(); });

it.each(['success', 'failure'] as const)('latest draw ignores an older same-lottery refresh %s', async (outcome) => {
  const old = deferred<LotteryDrawRecord>();
  vi.mocked(fetchLatestLotteryDraw).mockReturnValueOnce(old.promise).mockResolvedValue(draw('current'));
  const { result } = renderHook(() => useLatestLotteryDraw('今彩539'));
  await act(async () => { refreshListeners.forEach(listener => listener()); });
  expect(result.current.data?.period).toBe('current');
  await act(async () => {
    if (outcome === 'success') old.resolve(draw('obsolete'));
    else old.reject(new Error('obsolete failure'));
  });
  expect(result.current.data?.period).toBe('current');
  expect(result.current.error).toBeNull();
});

it.each(['success', 'failure'] as const)('active history ignores an older same-lottery refresh %s', async (outcome) => {
  const old = deferred<LotteryDrawRecord[]>();
  let historyRequests = 0;
  vi.mocked(fetchLotteryHistory).mockImplementation((_lottery, limit) => {
    if (limit === 1000 && historyRequests++ === 0) return old.promise;
    return Promise.resolve([draw('current')]);
  });
  render(<FeaturePageRouter screen="history" onNavigate={vi.fn()} />);
  await act(async () => { refreshListeners.forEach(listener => listener()); });
  expect(screen.getByText('current')).toBeVisible();
  await act(async () => {
    if (outcome === 'success') old.resolve([draw('obsolete')]);
    else old.reject(new Error('obsolete failure'));
  });
  expect(screen.getByText('current')).toBeVisible();
  expect(screen.queryByText('obsolete')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
});

it.each(['success', 'failure'] as const)('shared history ignores an older same-lottery refresh %s', async (outcome) => {
  const old = deferred<LotteryDrawRecord[]>();
  vi.mocked(fetchLotteryHistory).mockReturnValueOnce(old.promise).mockResolvedValue([draw('current')]);
  const { result } = renderHook(() => useLotteryHistory('今彩539', 10));
  await act(async () => { refreshListeners.forEach(listener => listener()); });
  expect(result.current[0]?.period).toBe('current');
  await act(async () => {
    if (outcome === 'success') old.resolve([draw('obsolete')]);
    else old.reject(new Error('obsolete failure'));
  });
  expect(result.current[0]?.period).toBe('current');
});
