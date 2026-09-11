import { describe, expect, it } from 'vitest';
import { paginateAdminRows } from './admin-table-pagination';

const rows = (count: number) => Array.from({ length: count }, (_, index) => ({ id: String(index + 1) }));

describe('admin table pagination', () => {
  it('shows activation codes fifteen at a time', () => {
    expect(paginateAdminRows('啟動碼管理', rows(31), 2)).toMatchObject({ items: rows(31).slice(15, 30), page: 2, totalPages: 3, pageSize: 15 });
  });

  it('leaves other tables unpaged', () => {
    expect(paginateAdminRows('審計日誌', rows(31), 2)).toMatchObject({ items: rows(31), page: 1, totalPages: 1, pageSize: 0 });
  });
});
