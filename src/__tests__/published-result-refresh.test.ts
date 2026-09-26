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
import { writePublishedResultCache } from '../matrix-result-cache';
import { resetReadCacheForTests } from '../read-cache';
const revisions = { '今彩539': 'a', '天天樂': 'b', '六合彩': 'c', '大樂透': 'd' };
const probe = () => vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ revisions }), { headers: { 'content-type': 'application/json' } }));
const settle = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };


afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); localStorage.clear(); resetReadCacheForTests(); realtime.state.status = undefined; });

test('a published card revision refreshes public data and closes its home subscription', async () => {
  probe();
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

test('replication readiness before subscribe still repairs data missed on reconnect', async () => {
  realtime.channel.subscribe.mockImplementationOnce(callback => {
    realtime.state.status = callback;
    realtime.listeners.system?.({ extension: 'postgres_changes', status: 'ok' });
    callback('SUBSCRIBED');
    return realtime.channel;
  });
  probe();
  const stop = subscribePublishedResultRefresh();
  const before = getMatrixDataRevision();
  realtime.state.status?.('CHANNEL_ERROR');
  realtime.listeners.system?.({ extension: 'postgres_changes', status: 'ok' });
  realtime.state.status?.('SUBSCRIBED');
  await settle();
  expect(getMatrixDataRevision()).toBeGreaterThan(before);
  stop();
});


test('first readiness confirms matching revisions without clearing completed caches', async () => {
  writePublishedResultCache(undefined, { drawDate: null, items: [], dueLotteries: [], revisions });
  const fetcher = probe();
  const before = getMatrixDataRevision();
  const stop = subscribePublishedResultRefresh();
  await settle();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(String(fetcher.mock.calls[0][0])).toContain('/api/matrix/result-revisions');
  expect(getMatrixDataRevision()).toBe(before);
  expect(localStorage.getItem('lottery-published-result:latest')).not.toBeNull();
  stop();
});

test('first readiness invalidates a changed revision even for the same completed period', async () => {
  writePublishedResultCache(undefined, { drawDate: null, items: [], dueLotteries: [], revisions: { ...revisions, '今彩539': 'old' } });
  probe();
  const before = getMatrixDataRevision();
  const stop = subscribePublishedResultRefresh();
  await settle();
  expect(getMatrixDataRevision()).toBeGreaterThan(before);
  expect(localStorage.getItem('lottery-published-result:latest')).toBeNull();
  stop();
});

test('disposed readiness probes cannot invalidate caches and concurrent probes share one read', async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const before = getMatrixDataRevision();
  const stop = subscribePublishedResultRefresh();
  const stopOther = subscribePublishedResultRefresh();
  await settle();
  expect(fetcher).toHaveBeenCalledTimes(1);
  stop(); stopOther();
  finish(new Response(JSON.stringify({ revisions }), { headers: { 'content-type': 'application/json' } }));
  await settle();
  expect(getMatrixDataRevision()).toBe(before);
});
