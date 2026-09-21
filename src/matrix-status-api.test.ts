import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const invoke = vi.fn();
const getSession = vi.fn();
const access = vi.fn();
const statusRead = vi.fn();
vi.mock('./lib/supabase', () => ({ getSupabaseClient: () => ({ rpc, functions: { invoke }, auth: { getSession } }) }));

import {
  fetchMatrixStatus,
  fetchMatrixStatusSummaries,
  fetchMatrixStatusValidation,
} from './matrix-status-api';

import { resetReadCacheForTests } from './read-cache';
import { invalidateMatrixData } from './matrix-data-revision';

const resultData = (data: Record<string, unknown>, canUseSeven = true) => ({ data: { ...data, cacheIdentity: { drawPeriod: '115000210', analysisVersion: 'v1', entitlements: { canUseSeven } } }, error: null });

beforeEach(() => {
  resetReadCacheForTests();
  getSession.mockReset().mockResolvedValue({ data: { session: { user: { id: 'member' } } }, error: null });
  rpc.mockReset().mockResolvedValue({ data: {}, error: null });
  access.mockReset().mockResolvedValue({ data: { kind: 'status-identity', drawPeriod: '115000210', analysisVersion: 'v1', entitlements: { canUseSeven: true } }, error: null });
  statusRead.mockReset().mockResolvedValue(resultData({}));
  invoke.mockReset().mockImplementation((_name, options) => options.body.action === 'identity' ? access(options) : statusRead(options));
});

describe('Matrix status Edge Function', () => {
  it('loads the selected lottery status artifact', async () => {
    await fetchMatrixStatus('六合彩');
    expect(invoke).toHaveBeenCalledWith('matrix-status', { body: { lottery: '六合彩' } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('loads all homepage lottery status summaries in one Edge Function invocation', async () => {
    const lotteries = ['今彩539', '天天樂', '六合彩', '大樂透'] as const;
    const signal = new AbortController().signal;
    const payload = { kind: 'status-summary-batch', items: [] };
    invoke.mockResolvedValueOnce({ data: payload, error: null });

    await expect(fetchMatrixStatusSummaries([...lotteries], signal)).resolves.toEqual(payload);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('matrix-status', {
      body: { action: 'summary-batch', lotteries: [...lotteries] },
      signal,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('loads expanded road validation through the protected status function', async () => {
    await fetchMatrixStatusValidation({
      lottery: '今彩539', drawPeriod: '115000210', analysisVersion: 'v1',
    }, 'road-2');
    expect(invoke).toHaveBeenCalledWith('matrix-status', {
      body: {
        action: 'validation', lottery: '今彩539', drawPeriod: '115000210',
        analysisVersion: 'v1', itemId: 'road-2',
      },
    });
  });

});

it('does not expose custom status client operations', async () => {
  const api = await import('./matrix-status-api');
  expect(Object.keys(api).sort()).toEqual([
    'fetchMatrixStatus', 'fetchMatrixStatusSummaries', 'fetchMatrixStatusValidation', 'fetchMatrixStatuses',
  ]);
});


describe('status read reuse', () => {
  it('shares concurrent requests and reuses the same member and data snapshot', async () => {
    await Promise.all([fetchMatrixStatus('六合彩'), fetchMatrixStatus('六合彩')]);
    await fetchMatrixStatus('六合彩');
    expect(statusRead).toHaveBeenCalledTimes(1);
    invalidateMatrixData();
    await fetchMatrixStatus('六合彩');
    expect(statusRead).toHaveBeenCalledTimes(2);
  });
  it('never reuses a previous member result and does not cache failures', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    statusRead.mockResolvedValueOnce(resultData({ detailLocked: true }));
    expect(await fetchMatrixStatus('今彩539')).toMatchObject({ detailLocked: true });
    getSession.mockResolvedValue({ data: { session: { user: { id: 'another' }, access_token: 'token' } }, error: null });
    statusRead.mockResolvedValueOnce({ data: null, error: { message: 'FORBIDDEN' } });
    await expect(fetchMatrixStatus('今彩539')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    statusRead.mockResolvedValueOnce(resultData({ detailLocked: false }));
    expect(await fetchMatrixStatus('今彩539')).toMatchObject({ detailLocked: false });
    expect(statusRead).toHaveBeenCalledTimes(3);
  });
  it('discards responses invalidated while in flight', async () => {
    let finish!: (value: unknown) => void;
    statusRead.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const read = fetchMatrixStatus('今彩539');
    await vi.waitFor(() => expect(statusRead).toHaveBeenCalledTimes(1));
    invalidateMatrixData();
    finish(resultData({ detailLocked: false }));
    await expect(read).rejects.toMatchObject({ code: 'ANALYSIS_VERSION_MISMATCH' });
  });
});


it('revalidates same-session entitlement changes and refuses disabled members on cache hits', async () => {
  statusRead.mockResolvedValue(resultData({ detailLocked: false }));
  expect(await fetchMatrixStatus('今彩539')).toMatchObject({ detailLocked: false });
  access.mockResolvedValue({ data: { kind: 'status-identity', drawPeriod: '115000210', analysisVersion: 'v1', entitlements: { canUseSeven: false } }, error: null });
  statusRead.mockResolvedValue(resultData({ detailLocked: true }, false));
  expect(await fetchMatrixStatus('今彩539')).toMatchObject({ detailLocked: true });
  expect(statusRead).toHaveBeenCalledTimes(2);
  access.mockResolvedValue({ data: null, error: { message: 'FORBIDDEN' } });
  await expect(fetchMatrixStatus('今彩539')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(statusRead).toHaveBeenCalledTimes(2);
});


it('does not cache a result produced under a different permission snapshot', async () => {
  statusRead.mockResolvedValueOnce({ data: { detailLocked: false, cacheIdentity: {
    drawPeriod: '115000210', analysisVersion: 'v1', entitlements: { canUseSeven: false },
  } }, error: null });
  await expect(fetchMatrixStatus('今彩539')).rejects.toMatchObject({ code: 'ANALYSIS_VERSION_MISMATCH' });
});


describe('time-window status cache', () => {
  it('keeps 今彩539 status payload cached until 20:00 while revalidating access', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T10:00:00+08:00'));
    statusRead.mockResolvedValue(resultData({ detailLocked: false }));

    await fetchMatrixStatus('今彩539');
    vi.setSystemTime(new Date('2026-09-22T19:59:59+08:00'));
    await fetchMatrixStatus('今彩539');
    expect(statusRead).toHaveBeenCalledTimes(1);
    expect(access).toHaveBeenCalledTimes(2);

    vi.setSystemTime(new Date('2026-09-22T20:00:00+08:00'));
    await fetchMatrixStatus('今彩539');
    expect(statusRead).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('keeps 天天樂 status payload cached through overnight until 09:00', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T23:00:00+08:00'));
    statusRead.mockResolvedValue(resultData({ detailLocked: false }));

    await fetchMatrixStatus('天天樂');
    vi.setSystemTime(new Date('2026-09-23T08:59:59+08:00'));
    await fetchMatrixStatus('天天樂');
    expect(statusRead).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-09-23T09:00:00+08:00'));
    await fetchMatrixStatus('天天樂');
    expect(statusRead).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('uses five minutes outside the stable status window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T20:30:00+08:00'));
    statusRead.mockResolvedValue(resultData({ detailLocked: false }));

    await fetchMatrixStatus('今彩539');
    vi.setSystemTime(new Date('2026-09-22T20:34:59+08:00'));
    await fetchMatrixStatus('今彩539');
    expect(statusRead).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-09-22T20:35:00+08:00'));
    await fetchMatrixStatus('今彩539');
    expect(statusRead).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
