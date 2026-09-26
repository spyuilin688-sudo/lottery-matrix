// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

const api = vi.hoisted(() => ({
  fetchMatrixCardManifest: vi.fn(),
  matrixCardUrl: (path: string) => `https://matrix.example.test${path}`,
}));
const realtime = vi.hoisted(() => {
  const state: {
    onMessage: ((message: { new: { lottery: string; generation: string | null; orders: string[] } }) => void) | null;
    onSystem: ((message: { extension: string; status: string }) => void) | null;
    onStatus: ((status: string) => void) | null;
  } = { onMessage: null, onSystem: null, onStatus: null };
  const channel = {
    on: vi.fn((type: string, _filter: unknown, callback: typeof state.onMessage) => {
      if (type === 'system') state.onSystem = callback as typeof state.onSystem;
      else state.onMessage = callback;
      return channel;
    }),
    subscribe: vi.fn((callback: (status: string) => void) => {
      state.onStatus = callback;
      callback('SUBSCRIBED');
      state.onSystem?.({ extension: 'postgres_changes', status: 'ok' });
      return channel;
    }),
    unsubscribe: vi.fn(async () => 'ok'),
  };
  const client = { channel: vi.fn(() => channel), removeChannel: vi.fn(async () => 'ok') };
  return { state, channel, client };
});

vi.mock('../lottery-api', async importOriginal => ({
  ...(await importOriginal<typeof import('../lottery-api')>()),
  ...api,
}));
vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => realtime.client }));

import { MatrixCardPage } from '../features/MatrixCardPage';
import { AppDialogProvider } from '../dialog/AppDialog';
import { invalidateMatrixData } from '../matrix-data-revision';

const sortedOnly = {
  lottery: '今彩539', period: '115209', generation: 'a'.repeat(64),
  cards: { sorted: { url: '/115209/sorted.png' } },
};
const withDraw = {
  lottery: '今彩539', period: '115209', generation: 'a'.repeat(64),
  cards: { sorted: { url: '/115209/sorted.png' }, draw: { url: '/115209/draw.png' } },
};

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.useRealTimers();
  vi.clearAllMocks();
  api.fetchMatrixCardManifest.mockReset();
  realtime.state.onMessage = null;
  realtime.state.onSystem = null;
  realtime.state.onStatus = null;
});

test('a newly published card updates the open page without an hourly API check', async () => {
  vi.useFakeTimers();
  let published = sortedOnly;
  api.fetchMatrixCardManifest.mockImplementation(async () => published);
  render(<AppDialogProvider><MatrixCardPage onNavigate={vi.fn()} /></AppDialogProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(screen.getByRole('img', { name: '今彩539順球牌單，第 115209 期' })).toBeTruthy();
  const initialReads = api.fetchMatrixCardManifest.mock.calls.length;
  await act(async () => {
    invalidateMatrixData();
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(api.fetchMatrixCardManifest).toHaveBeenCalledTimes(initialReads);
  await act(async () => { await vi.advanceTimersByTimeAsync(3_600_001); });
  expect(api.fetchMatrixCardManifest).toHaveBeenCalledTimes(initialReads);
  expect(realtime.channel.on).toHaveBeenCalledWith('postgres_changes', {
    event: 'UPDATE', schema: 'public', table: 'matrix_card_signals', filter: 'lottery=eq.今彩539',
  }, expect.any(Function));

  published = withDraw;
  await act(async () => {
    realtime.state.onMessage?.({ new: {
      lottery: '今彩539', generation: withDraw.generation, orders: ['draw', 'sorted'],
    } });
    await vi.advanceTimersByTimeAsync(1);
  });
  expect((screen.getByRole('tab', { name: '落球' }) as HTMLButtonElement).disabled).toBe(false);
  expect(api.fetchMatrixCardManifest).toHaveBeenCalledTimes(initialReads + 1);

  await act(async () => {
    realtime.state.onMessage?.({ new: {
      lottery: '今彩539', generation: withDraw.generation, orders: ['draw', 'sorted'],
    } });
    realtime.state.onMessage?.({ new: {
      lottery: '大樂透', generation: 'b'.repeat(64), orders: ['sorted'],
    } });
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(api.fetchMatrixCardManifest).toHaveBeenCalledTimes(initialReads + 1);
});

test('a missing publication clears the old card, and a failed channel retains hourly recovery', async () => {
  vi.useFakeTimers();
  api.fetchMatrixCardManifest.mockResolvedValueOnce(sortedOnly).mockResolvedValueOnce(sortedOnly)
    .mockResolvedValue({ lottery: '今彩539', period: null, cards: {} });
  render(<AppDialogProvider><MatrixCardPage onNavigate={vi.fn()} /></AppDialogProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(screen.getByRole('img', { name: '今彩539順球牌單，第 115209 期' })).toBeTruthy();

  await act(async () => {
    realtime.state.onMessage?.({ new: { lottery: '今彩539', generation: null, orders: [] } });
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.queryByRole('img', { name: '今彩539順球牌單，第 115209 期' })).toBeNull();
  const readsAfterEvent = api.fetchMatrixCardManifest.mock.calls.length;
  realtime.state.onStatus?.('CHANNEL_ERROR');
  await act(async () => { await vi.advanceTimersByTimeAsync(3_600_001); });
  expect(api.fetchMatrixCardManifest).toHaveBeenCalledTimes(readsAfterEvent + 1);
});

test('leaving the ticket page removes its subscription and ignores queued old events', async () => {
  vi.useFakeTimers();
  api.fetchMatrixCardManifest.mockResolvedValue(sortedOnly);
  const page = render(<AppDialogProvider><MatrixCardPage onNavigate={vi.fn()} /></AppDialogProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  const reads = api.fetchMatrixCardManifest.mock.calls.length;
  const listener = realtime.state.onMessage;

  page.unmount();
  expect(realtime.client.removeChannel).toHaveBeenCalledTimes(1);
  await act(async () => {
    listener?.({ new: { lottery: '今彩539', generation: 'b'.repeat(64), orders: ['sorted'] } });
    await vi.advanceTimersByTimeAsync(3_600_001);
  });
  expect(api.fetchMatrixCardManifest).toHaveBeenCalledTimes(reads);
});

test('rechecks after replication becomes ready when a card was published in the join gap', async () => {
  vi.useFakeTimers();
  let published = sortedOnly;
  api.fetchMatrixCardManifest.mockImplementation(async () => published);
  realtime.channel.subscribe.mockImplementationOnce((callback: (status: string) => void) => {
    realtime.state.onStatus = callback;
    callback('SUBSCRIBED');
    return realtime.channel;
  });
  render(<AppDialogProvider><MatrixCardPage onNavigate={vi.fn()} /></AppDialogProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(api.fetchMatrixCardManifest).toHaveBeenCalledTimes(1);

  published = withDraw;
  await act(async () => {
    realtime.state.onSystem?.({ extension: 'postgres_changes', status: 'ok' });
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(api.fetchMatrixCardManifest).toHaveBeenCalledTimes(2);
  expect((screen.getByRole('tab', { name: '落球' }) as HTMLButtonElement).disabled).toBe(false);
});

test('a temporarily stale card response retries the publication without continuous polling', async () => {
  vi.useFakeTimers();
  api.fetchMatrixCardManifest.mockResolvedValueOnce(sortedOnly).mockResolvedValueOnce(sortedOnly)
    .mockResolvedValueOnce(sortedOnly).mockResolvedValue(withDraw);
  render(<AppDialogProvider><MatrixCardPage onNavigate={vi.fn()} /></AppDialogProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  const initialReads = api.fetchMatrixCardManifest.mock.calls.length;

  await act(async () => {
    realtime.state.onMessage?.({ new: {
      lottery: '今彩539', generation: withDraw.generation, orders: ['sorted', 'draw'],
    } });
    await vi.advanceTimersByTimeAsync(1);
  });
  expect((screen.getByRole('tab', { name: '落球' }) as HTMLButtonElement).disabled).toBe(true);
  expect(api.fetchMatrixCardManifest).toHaveBeenCalledTimes(initialReads + 1);
  await act(async () => { await vi.advanceTimersByTimeAsync(2_001); });
  expect(api.fetchMatrixCardManifest).toHaveBeenCalledTimes(initialReads + 2);
  expect((screen.getByRole('tab', { name: '落球' }) as HTMLButtonElement).disabled).toBe(false);
});

test('a prolonged API failure uses hourly recovery only until the signaled card loads', async () => {
  vi.useFakeTimers();
  api.fetchMatrixCardManifest.mockResolvedValueOnce(sortedOnly).mockResolvedValueOnce(sortedOnly)
    .mockRejectedValueOnce(new Error('temporary'))
    .mockRejectedValueOnce(new Error('temporary'))
    .mockRejectedValueOnce(new Error('temporary'))
    .mockRejectedValueOnce(new Error('temporary'))
    .mockResolvedValue(withDraw);
  render(<AppDialogProvider><MatrixCardPage onNavigate={vi.fn()} /></AppDialogProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  const initialReads = api.fetchMatrixCardManifest.mock.calls.length;
  await act(async () => {
    realtime.state.onMessage?.({ new: {
      lottery: '今彩539', generation: withDraw.generation, orders: ['sorted', 'draw'],
    } });
    await vi.advanceTimersByTimeAsync(42_010);
  });
  expect(api.fetchMatrixCardManifest).toHaveBeenCalledTimes(initialReads + 4);
  await act(async () => { await vi.advanceTimersByTimeAsync(3_600_001); });
  expect(api.fetchMatrixCardManifest).toHaveBeenCalledTimes(initialReads + 5);
  expect((screen.getByRole('tab', { name: '落球' }) as HTMLButtonElement).disabled).toBe(false);
  await act(async () => { await vi.advanceTimersByTimeAsync(3_600_001); });
  expect(api.fetchMatrixCardManifest).toHaveBeenCalledTimes(initialReads + 5);
});


test('a failed same-lottery refresh preserves the last card and switching lottery clears it', async () => {
  vi.useFakeTimers();
  api.fetchMatrixCardManifest.mockResolvedValue(sortedOnly);
  render(<AppDialogProvider><MatrixCardPage onNavigate={vi.fn()} /></AppDialogProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  api.fetchMatrixCardManifest.mockRejectedValue(new Error('offline'));
  await act(async () => {
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.getByRole('img', { name: '今彩539順球牌單，第 115209 期' })).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toBe('更新失敗，目前顯示上次資料');
  await act(async () => { fireEvent.click(screen.getByRole('tab', { name: '大樂透' })); });
  expect(screen.queryByRole('img')).toBeNull();
});

test('overlapping recovery reads share a request and a newer signal is fetched after it settles', async () => {
  vi.useFakeTimers();
  let resolveFirst!: (value: typeof sortedOnly) => void;
  api.fetchMatrixCardManifest.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
    .mockResolvedValue(withDraw);
  render(<AppDialogProvider><MatrixCardPage onNavigate={vi.fn()} /></AppDialogProvider>);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(1);
    realtime.state.onMessage?.({ new: { lottery: '今彩539', generation: withDraw.generation, orders: ['sorted', 'draw'] } });
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(api.fetchMatrixCardManifest).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolveFirst(sortedOnly);
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(api.fetchMatrixCardManifest).toHaveBeenCalledTimes(2);
  expect((screen.getByRole('tab', { name: '落球' }) as HTMLButtonElement).disabled).toBe(false);
});

test('replication readiness waits for an initial read and then closes its publication gap', async () => {
  vi.useFakeTimers();
  let resolveInitial!: (value: typeof sortedOnly) => void;
  api.fetchMatrixCardManifest.mockImplementationOnce(() => new Promise(resolve => { resolveInitial = resolve; }))
    .mockResolvedValue(withDraw);
  realtime.channel.subscribe.mockImplementationOnce((callback: (status: string) => void) => {
    realtime.state.onStatus = callback;
    callback('SUBSCRIBED');
    return realtime.channel;
  });
  render(<AppDialogProvider><MatrixCardPage onNavigate={vi.fn()} /></AppDialogProvider>);
  await act(async () => {
    realtime.state.onSystem?.({ extension: 'postgres_changes', status: 'ok' });
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(api.fetchMatrixCardManifest).toHaveBeenCalledTimes(1);
  await act(async () => { resolveInitial(sortedOnly); await vi.advanceTimersByTimeAsync(1); });
  expect(api.fetchMatrixCardManifest).toHaveBeenCalledTimes(2);
  expect((screen.getByRole('tab', { name: '落球' }) as HTMLButtonElement).disabled).toBe(false);
});
