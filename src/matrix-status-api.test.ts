import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ fetchJson: vi.fn() }));
vi.mock('./matrix-api-client', () => ({ matrixApiFetch: api.fetchJson }));

import { fetchMatrixStatus, listCustomStatusSettings, resetCustomStatusSetting, saveCustomStatusSetting } from './matrix-status-api';

beforeEach(() => api.fetchJson.mockReset().mockResolvedValue({}));

describe('Matrix status API', () => {
  it('loads live status for the selected lottery', async () => {
    await fetchMatrixStatus('六合彩');
    expect(api.fetchJson).toHaveBeenCalledWith(
      '/api/matrix/status',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ lottery: '六合彩' }) }),
      { auth: 'optional' },
    );
  });

  it('lists, saves and resets custom settings', async () => {
    const config = { lottery: '今彩539', status: 'ACTIVE', explorePeriods: 13, exploreRange: '完整範圍', oneCodeGroups: [], twoCodeGroups: [] } satisfies import('./matrix-status-api').CustomStatusConfig;
    await listCustomStatusSettings();
    await saveCustomStatusSetting(config);
    await resetCustomStatusSetting('今彩539', 'ACTIVE');
    expect(api.fetchJson.mock.calls.map(([path]) => path)).toEqual([
      '/api/matrix/status/settings', '/api/matrix/status/settings', '/api/matrix/status/settings/reset',
    ]);
  });
});
