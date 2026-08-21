import { describe, expect, it, vi } from 'vitest';
import { filterRows, saveMemberStatus, saveSubscription } from './admin-operations';

describe('admin operation helpers', () => {
  it('filters rows by keyword and status', () => {
    const rows = [
      { id: '1', authUserId: 'alpha', status: 'active', planName: '月費方案' },
      { id: '2', authUserId: 'beta', status: 'disabled', planName: '季費方案' },
    ];
    expect(filterRows(rows, 'beta', 'disabled')).toEqual([rows[1]]);
    expect(filterRows(rows, '月費', 'all')).toEqual([rows[0]]);
  });

  it('normalizes Chinese and canonical member status values for filters', () => {
    const rows = [
      { id: '1', status: '啟用' },
      { id: '2', status: '停用' },
      { id: '3', status: 'disabled' },
    ];
    expect(filterRows(rows, '', 'active')).toEqual([rows[0]]);
    expect(filterRows(rows, '', 'disabled')).toEqual([rows[1], rows[2]]);
  });

  it('sends exact member and subscription mutation payloads', async () => {
    const put = vi.fn(async () => ({ data: {} }));
    await saveMemberStatus({ put }, 'member-1', 'disabled');
    await saveSubscription({ put }, 'member-1', { action: 'cancel' });
    expect(put).toHaveBeenNthCalledWith(1, '/api/members/member-1/status', { status: 'disabled' });
    expect(put).toHaveBeenNthCalledWith(2, '/api/subscriptions/member-1', { action: 'cancel' });
  });
});
