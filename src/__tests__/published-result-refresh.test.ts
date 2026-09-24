// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';

vi.unmock('../published-result-refresh');

const realtime = vi.hoisted(() => {
  const listeners: Record<string, (event: unknown) => void> = {};
  const state: { status?: (status: string) => void } = {};
  const channel = {
    on: vi.fn((kind: string, _filter: unknown, callback: (event: unknown) => void) => {
      listeners[kind] = callback;
      return channel;
    }),
    subscribe: vi.fn((callback: (state: string) => void) => {
      state.status = callback;
      callback('SUBSCRIBED');
      listeners.system?.({ extension: 'postgres_changes', status: 'ok' });
      return channel;
    }),
  };
  return { listeners, state, client: { channel: vi.fn(() => channel), removeChannel: vi.fn(async () => 'ok') }, channel };
});

vi.mock('../lib/supabase', () => ({ getSupabaseClient: () => realtime.client }));

import { subscribePublishedResultRefresh } from '../published-result-refresh';
import { getMatrixDataRevision } from '../matrix-data-revision';

afterEach(() => { vi.clearAllMocks(); realtime.state.status = undefined; });

test('a published card revision refreshes public data and closes its home subscription', async () => {
  const stop = subscribePublishedResultRefresh();
  const before = getMatrixDataRevision();
  realtime.listeners.postgres_changes?.({ new: { lottery: '今彩539', revision: 2 } });
  expect(getMatrixDataRevision()).toBe(before + 1);
  expect(realtime.channel.on).toHaveBeenCalledWith('postgres_changes', {
    event: 'UPDATE', schema: 'public', table: 'matrix_card_signals',
  }, expect.any(Function));
  stop();
  await Promise.resolve();
  expect(realtime.client.removeChannel).toHaveBeenCalledTimes(1);
});

test('replication readiness before subscribe still repairs data missed on reconnect', () => {
  realtime.channel.subscribe.mockImplementationOnce(callback => {
    realtime.state.status = callback;
    realtime.listeners.system?.({ extension: 'postgres_changes', status: 'ok' });
    callback('SUBSCRIBED');
    return realtime.channel;
  });
  const stop = subscribePublishedResultRefresh();
  const before = getMatrixDataRevision();
  realtime.state.status?.('CHANNEL_ERROR');
  realtime.listeners.system?.({ extension: 'postgres_changes', status: 'ok' });
  realtime.state.status?.('SUBSCRIBED');
  expect(getMatrixDataRevision()).toBe(before + 1);
  stop();
});
