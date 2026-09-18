import { describe, expect, it } from 'vitest';
import { getServiceEvidenceFacts, getSystemStatusPresentation, type SystemStatusItem } from './system-status';

describe('system status query count labels', () => {
  it('separates lightweight test-result counts from actual persisted result counts', () => {
    const item: SystemStatusItem = {
      id: 'supabase-rpc-matrix_explore_list',
      name: 'Matrix 探索清單',
      description: '',
      group: 'Matrix 演算法',
      location: 'Supabase',
      endpoint: '/rest/v1/rpc/matrix_explore_list',
      checkMode: 'registry',
      checkEvidence: 'query',
      ok: true,
      checkedAt: '2026-09-16T00:00:00Z',
      responseMs: 1,
      detail: {
        samples: [
          { lottery: '今彩539', ok: true, period: '115000224', records: 5, storedRecords: 2605 },
        ],
      },
    };

    expect(getSystemStatusPresentation(item)).toMatchObject({ label: '查詢正常', tone: 'good' });
    expect(getServiceEvidenceFacts(item)).toEqual([
      { label: '今彩539', value: '115000224 期 · 測試條件 5筆 · 實際儲存結果 2,605筆 · 通過' },
    ]);
  });

  it('does not mislabel a test count as the total when persisted count evidence is unavailable', () => {
    const item: SystemStatusItem = {
      id: 'supabase-rpc-matrix_explore_validation',
      name: 'Matrix 探索驗證',
      description: '',
      group: 'Matrix 演算法',
      location: 'Supabase',
      endpoint: '/rest/v1/rpc/matrix_explore_validation',
      checkMode: 'registry',
      checkEvidence: 'query',
      ok: true,
      checkedAt: '2026-09-16T00:00:00Z',
      responseMs: 1,
      detail: { samples: [{ lottery: '天天樂', ok: true, period: '115000211', records: 9 }] },
    };

    expect(getServiceEvidenceFacts(item)).toEqual([
      { label: '天天樂', value: '115000211 期 · 測試條件 9筆 · 通過' },
    ]);
  });
});
