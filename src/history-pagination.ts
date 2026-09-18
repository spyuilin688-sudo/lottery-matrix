export const HISTORY_PAGE_SIZE = 50;

export function paginateHistory<T>(records: T[], requestedPage: number) {
  const totalPages = Math.max(1, Math.ceil(records.length / HISTORY_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, requestedPage), totalPages);
  const start = (currentPage - 1) * HISTORY_PAGE_SIZE;

  return {
    currentPage,
    totalPages,
    items: records.slice(start, start + HISTORY_PAGE_SIZE),
  };
}
