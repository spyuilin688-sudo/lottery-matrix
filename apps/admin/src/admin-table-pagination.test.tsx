import { describe, expect, it } from 'vitest';
import { readAdminDataPage } from './admin-table-pagination';

describe('admin server page contract', () => {
  it('preserves the exact filtered total, server page and rows without client slicing', () => {
    const page = { items: [{ id: 'old-record' }], total: 301, currentPage: 11, totalPages: 11 };
    expect(readAdminDataPage(page)).toBe(page);
  });
  it('rejects a truncated legacy list without authoritative metadata', () => {
    expect(() => readAdminDataPage({ items: [{ id: 'partial' }] })).toThrow('Invalid admin page');
  });
  it('rejects invalid page boundaries', () => {
    expect(() => readAdminDataPage({ items: [], total: 1, currentPage: 2, totalPages: 1 })).toThrow('Invalid admin page');
  });
});
