import { describe, expect, it, vi } from 'vitest';
import { deleteActivationCode, filterRows, formatAdminDateTime, paginateRows, saveMemberStatus, saveSubscription } from './admin-operations';

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

  it('sends activation-code deletion to its dedicated backend route', async () => {
    const del = vi.fn(async () => ({ data: { deleted: true } }));

    await expect(deleteActivationCode({ delete: del }, 'code-1')).resolves.toMatchObject({
      data: { deleted: true },
    });
    expect(del).toHaveBeenCalledWith('/api/activation-codes/code-1');
  });

  it('formats stored dates without seconds and preserves missing values', () => {
    expect(formatAdminDateTime('2026-08-21T10:35:42+08:00')).toBe('2026/08/21 10:35');
    expect(formatAdminDateTime(null)).toBe('—');
  });

  it('paginates filtered rows in groups of thirty', () => {
    const rows = Array.from({ length: 65 }, (_, index) => ({ id: String(index + 1) }));
    expect(paginateRows(rows, 1).items).toHaveLength(30);
    expect(paginateRows(rows, 2).items[0].id).toBe('31');
    expect(paginateRows(rows, 3).totalPages).toBe(3);
    expect(paginateRows(rows, 3).items).toHaveLength(5);
    expect(paginateRows(rows, 3).items[0].id).toBe('61');
  });
});
