export type AdminRow = Record<string, unknown> & { id: string };
export type AdminDataPage = { items: AdminRow[]; total: number; currentPage: number; totalPages: number };

// Counts and page boundaries are authoritative server results; never slice a returned page.
export function readAdminDataPage(value: unknown): AdminDataPage {
  const page = value as AdminDataPage;
  if (!Array.isArray(page?.items) || !Number.isSafeInteger(page.total) || page.total < 0
      || !Number.isSafeInteger(page.currentPage) || page.currentPage < 1
      || !Number.isSafeInteger(page.totalPages) || page.totalPages < 1
      || page.currentPage > page.totalPages) throw new Error('Invalid admin page');
  return page;
}
