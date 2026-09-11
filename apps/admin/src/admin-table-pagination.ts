type Row = Record<string, unknown> & { id: string };

const pageSizes: Record<string, number> = {
  啟動碼管理: 15,
};

export function paginateAdminRows(active: string, rows: Row[], requestedPage: number) {
  const pageSize = pageSizes[active] ?? 0;
  if (pageSize === 0) return { items: rows, page: 1, totalPages: 1, pageSize };
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const start = (page - 1) * pageSize;
  return { items: rows.slice(start, start + pageSize), page, totalPages, pageSize };
}
