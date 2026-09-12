// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { subscribeLotteryRefresh } from '../lottery-data-refresh';
import { invalidateMatrixData } from '../matrix-data-revision';
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

test('shares one timer for mounted readers, coalesces revisions and stops after the last unmount', async () => {
  vi.useFakeTimers();
  const first = vi.fn(), second = vi.fn();
  const stopFirst = subscribeLotteryRefresh('今彩539', first);
  const stopSecond = subscribeLotteryRefresh('今彩539', second);
  expect(vi.getTimerCount()).toBe(1);
  invalidateMatrixData(); invalidateMatrixData();
  await vi.advanceTimersByTimeAsync(0);
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(first).toHaveBeenCalledTimes(2);
  stopFirst();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(first).toHaveBeenCalledTimes(2);
  expect(second).toHaveBeenCalledTimes(3);
  stopSecond();
  expect(vi.getTimerCount()).toBe(0);
  invalidateMatrixData();
  expect(vi.getTimerCount()).toBe(0);
});

test('suspends hidden-page polling and refreshes when visible again', async () => {
  vi.useFakeTimers();
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  const refresh = vi.fn();
  const stop = subscribeLotteryRefresh('六合彩', refresh);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(refresh).not.toHaveBeenCalled();
  visibility.mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(0);
  expect(refresh).toHaveBeenCalledTimes(1);
  stop();
});
