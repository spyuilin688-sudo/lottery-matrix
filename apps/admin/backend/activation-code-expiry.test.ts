import { describe, expect, it, vi } from 'vitest';
import { listAdminTable, listAdminTablePage } from './admin-data';

const now = new Date('2026-09-19T13:00:00.000Z');
const rows = [
  { id: 'future', status: 'unused', expires_at: '2026-09-19T13:00:00.001Z', redeemed_at: null },
  { id: 'past', status: 'unused', expires_at: '2026-09-18T13:00:00.000Z', redeemed_at: null },
  { id: 'boundary', status: 'unused', expires_at: '2026-09-19T13:00:00.000Z', redeemed_at: null },
  { id: 'used', status: 'used', expires_at: '2026-09-18T13:00:00.000Z', redeemed_at: '2026-09-01T00:00:00Z' },
  { id: 'stored-expired', status: 'expired', expires_at: '2026-10-01T00:00:00Z', redeemed_at: null },
];
const expectedStatuses = [
  ['future', 'unused'], ['past', 'expired'], ['boundary', 'expired'], ['used', 'used'], ['stored-expired', 'expired'],
];

describe('activation code effective expiry', () => {
  it('maps paginated codes at one request timestamp without expiring already redeemed codes', async () => {
    const request = vi.fn().mockResolvedValue([]);
    const requestPage = vi.fn().mockResolvedValue({ items: rows, total: 5 });
    const result = await listAdminTablePage('activationCodes', {}, { request, requestPage }, now);
    expect(result.items.map(item => [item.id, item.status])).toEqual(expectedStatuses);
    expect(result).toMatchObject({ total: 5, currentPage: 1, totalPages: 1 });
    expect(result.items.find(item => item.id === 'used')?.redeemedAt).toBe('2026-09-01T00:00:00Z');
    expect(request).not.toHaveBeenCalled();
    expect(rows[1].status).toBe('unused');
  });

  it('uses the same expiry rule for legacy reads', async () => {
    const request = vi.fn(async (path: string) => {
      const query = new URL(path, 'https://test').searchParams;
      const offset = Number(query.get('offset') ?? 0);
      return rows.slice(offset, offset + Number(query.get('limit') ?? 1000));
    });
    const result = await listAdminTable('activationCodes', { request }, now);
    expect(result.items.map(item => [item.id, item.status])).toEqual(expectedStatuses);
    expect(request.mock.calls.every(call => call.length === 1)).toBe(true);
  });

  it('includes elapsed unused codes in expired filtering before pagination and preserves keyword OR', async () => {
    const request = vi.fn().mockResolvedValue([]);
    const requestPage = vi.fn().mockResolvedValue({ items: [rows[1]], total: 11 });
    const result = await listAdminTablePage('activationCodes', {
      status: 'expired', page: 2, keyword: 'ABCD', startDate: '2026-09-01', endDate: '2026-09-19',
    }, { request, requestPage }, now);
    const query = new URL(requestPage.mock.calls[0][0], 'https://test').searchParams;
    expect(query.has('status')).toBe(false);
    expect(query.get('and')).toBe('(or(status.eq.expired,and(status.eq.unused,expires_at.lte.2026-09-19T13:00:00.000Z)))');
    expect(query.get('or')).toContain('code.imatch."ABCD"');
    expect(query.getAll('created_at')).toEqual(['gte.2026-08-31T16:00:00.000Z', 'lt.2026-09-19T16:00:00.000Z']);
    expect(query.get('limit')).toBe('10');
    expect(query.get('offset')).toBe('10');
    expect(result).toMatchObject({ total: 11, currentPage: 2, totalPages: 2, items: [{ id: 'past', status: 'expired' }] });
    expect(requestPage).toHaveBeenCalledTimes(1);
  });

  it('excludes elapsed codes from unused filtering without replacing the requested expiry date range', async () => {
    const requestPage = vi.fn().mockResolvedValue({ items: [], total: 0 });
    await listAdminTablePage('activationCodes', {
      status: 'unused', dateField: 'expiresAt', startDate: '2026-09-01', endDate: '2026-10-01',
    }, { request: vi.fn(), requestPage }, now);
    const query = new URL(requestPage.mock.calls[0][0], 'https://test').searchParams;
    expect(query.get('status')).toBe('eq.unused');
    expect(query.getAll('expires_at')).toEqual([
      'gte.2026-08-31T16:00:00.000Z', 'lt.2026-10-01T16:00:00.000Z', 'gt.2026-09-19T13:00:00.000Z',
    ]);
  });

  it.each(['used', 'all'])('preserves %s filtering without excluding historical redeemed codes', async status => {
    const requestPage = vi.fn().mockResolvedValue({ items: [rows[3]], total: 1 });
    const result = await listAdminTablePage('activationCodes', { status }, { request: vi.fn(), requestPage }, now);
    const query = new URL(requestPage.mock.calls[0][0], 'https://test').searchParams;
    expect(query.get('status')).toBe(status === 'used' ? 'eq.used' : null);
    expect(query.has('expires_at')).toBe(false);
    expect(query.has('and')).toBe(false);
    expect(result.items[0].status).toBe('used');
  });

  it('rejects unsupported status before reading the table', async () => {
    const requestPage = vi.fn();
    await expect(listAdminTablePage('activationCodes', { status: 'anything' }, { request: vi.fn(), requestPage }, now)).rejects.toThrow('查詢條件不正確');
    expect(requestPage).not.toHaveBeenCalled();
  });
});
