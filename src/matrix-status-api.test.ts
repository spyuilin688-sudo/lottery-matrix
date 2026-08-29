import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const invoke = vi.fn();
vi.mock('./lib/supabase', () => ({ getSupabaseClient: () => ({ rpc, functions: { invoke } }) }));

import {
  fetchMatrixStatus,
  listCustomStatusSettings,
  resetCustomStatusSetting,
  saveCustomStatusSetting,
} from './matrix-status-api';

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: {}, error: null });
  invoke.mockReset().mockResolvedValue({ data: {}, error: null });
});

describe('Matrix status Supabase RPC', () => {
  it('loads the selected lottery status artifact', async () => {
    await fetchMatrixStatus('六合彩');
    expect(invoke).toHaveBeenCalledWith('matrix-status', { body: { lottery: '六合彩' } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('lists, saves and resets the authenticated member settings', async () => {
    const config = {
      lottery: '今彩539', status: 'ACTIVE', explorePeriods: 13,
      exploreRange: '完整範圍', oneCodeGroups: [], twoCodeGroups: [],
    } satisfies import('./matrix-status-api').CustomStatusConfig;

    await listCustomStatusSettings();
    await saveCustomStatusSetting(config);
    await resetCustomStatusSetting('今彩539', 'ACTIVE');

    expect(rpc.mock.calls).toEqual([
      ['matrix_custom_status_list'],
      ['matrix_custom_status_save', { p_config: config }],
      ['matrix_custom_status_reset', { p_lottery: '今彩539', p_status: 'ACTIVE' }],
    ]);
  });
});
