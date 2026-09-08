import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";

export const MATRIX_RESULTS_PER_PAGE = 15;

export function MatrixResultsPagination({ page, pageCount, label = "探索結果", onPageChange }: {
  page: number;
  pageCount: number;
  label?: string;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav className="history-pagination explore-results-pagination" aria-label={`${label}分頁`}>
      <button
        type="button"
        aria-label={`${label}上一頁`}
        disabled={page === 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
      >
        <ChevronLeftIcon aria-hidden="true" />
      </button>
      <span>{page} / {pageCount}</span>
      <button
        type="button"
        aria-label={`${label}下一頁`}
        disabled={page === pageCount}
        onClick={() => onPageChange(Math.min(pageCount, page + 1))}
      >
        <ChevronRightIcon aria-hidden="true" />
      </button>
    </nav>
  );
}
