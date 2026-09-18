import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const invoke = vi.fn();
const getSession = vi.fn();
vi.mock('./lib/supabase', () => ({ getSupabaseClient: () => ({ rpc, functions: { invoke }, auth: { getSession } }) }));

import {
  fetchMatrixStatus,
  fetchMatrixStatusSummaries,
  fetchMatrixStatusValidation,
  listCustomStatusSettings,
  resetCustomStatusSetting,
  saveCustomStatusSetting,
} from './matrix-status-api';

beforeEach(() => {
  getSession.mockReset().mockResolvedValue({ data: { session: { user: { id: 'member' } } }, error: null });
  rpc.mockReset().mockResolvedValue({ data: {}, error: null });
  invoke.mockReset().mockResolvedValue({ data: {}, error: null });
});

describe('Matrix status Supabase RPC', () => {
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

  it('lists authenticated member settings through the authenticated RPC', async () => {
    await listCustomStatusSettings();

    expect(rpc.mock.calls).toEqual([
      ['matrix_custom_status_list'],
    ]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('saves and resets custom settings through the Matrix Status Edge Function so recompute can run', async () => {
    const config = {
      schemaVersion: 2,
      lottery: '今彩539', status: 'ACTIVE', explorePeriods: 13,
      exploreRange: '完整範圍', oneCodeGroups: [], twoCodeGroups: [],
    } satisfies import('./matrix-status-api').CustomStatusConfig;

    await saveCustomStatusSetting(config);
    await resetCustomStatusSetting('今彩539', 'ACTIVE');

    expect(invoke.mock.calls).toEqual([
      ['matrix-status', { body: { action: 'custom-save', config } }],
      ['matrix-status', {
        body: { action: 'custom-reset', lottery: '今彩539', status: 'ACTIVE' },
      }],
    ]);
    expect(rpc).not.toHaveBeenCalled();
  });
});

it('classifies guest custom settings as login required without invoking RPC', async () => {
  getSession.mockResolvedValue({ data: { session: null }, error: null });
  await expect(listCustomStatusSettings()).rejects.toMatchObject({ code: 'AUTH_REQUIRED', status: 401 });
  expect(rpc).not.toHaveBeenCalled();
});
