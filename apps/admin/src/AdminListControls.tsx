import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AdminDataPageController } from './use-admin-data-page';

type Option = readonly [string, string];
const operationalSearchCards = new Set(['會員', '訂閱', '登入紀錄', '審計日誌']);

export function AdminListControls({ page, name, statuses = [], sorts, showError = true, children, className = '' }: {
  page: AdminDataPageController;
  name: string;
  statuses?: readonly Option[];
  sorts: readonly Option[];
  showError?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const [keyword, setKeyword] = useState(page.query.keyword);
  const showControls = operationalSearchCards.has(name);

  useEffect(() => { setKeyword(page.query.keyword); }, [page.query.keyword]);

  return (
    <>
      {showControls && (
        <div className={`managementToolbar ${className}`}>
          <div className="managementPrimaryFilters">
            <div className="managementSearchField">
              <input
                ref={input}
                aria-label={`搜尋${name}`}
                placeholder={`搜尋${name}`}
                maxLength={200}
                value={keyword}
                onCompositionStart={() => { composing.current = true; }}
                onCompositionEnd={(event) => {
                  composing.current = false;
                  page.setQuery({ keyword: event.currentTarget.value });
                }}
                onChange={(event) => {
                  setKeyword(event.target.value);
                  if (!composing.current) page.setQuery({ keyword: event.target.value });
                }}
              />
              {keyword && (
                <button
                  className="managementClearButton"
                  type="button"
                  onClick={() => {
                    setKeyword('');
                    page.setQuery({ keyword: '' });
                    input.current?.focus();
                  }}
                  aria-label={`清除${name}搜尋`}
                >
                  清除
                </button>
              )}
            </div>
            {statuses.length > 0 && (
              <select
                className="managementStatusFilter"
                aria-label={`篩選${name}狀態`}
                value={page.query.status}
                onChange={(event) => page.setQuery({ status: event.target.value })}
              >
                <option value="all">全部狀態</option>
                {statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            )}
            {children && <div className="managementExtraFilter">{children}</div>}
            <span
              className="managementCount"
              aria-live="polite"
              aria-label={page.loading ? '資料讀取中' : page.error ? '資料載入失敗' : `共 ${page.total} 筆資料`}
            >
              {page.loading ? '讀取中' : page.error ? '—' : `${page.total} 筆`}
            </span>
          </div>
          <div className="managementSecondaryFilters">
            <label className="managementFilterLabel">
              <span>開始日期</span>
              <input
                aria-label={`${name}開始日期`}
                type="date"
                value={page.query.startDate}
                onChange={(event) => page.setQuery({ startDate: event.target.value })}
              />
            </label>
            <label className="managementFilterLabel">
              <span>結束日期</span>
              <input
                aria-label={`${name}結束日期`}
                type="date"
                value={page.query.endDate}
                onChange={(event) => page.setQuery({ endDate: event.target.value })}
              />
            </label>
            <label className="managementFilterLabel">
              <span>排序</span>
              <select
                aria-label={`${name}排序欄位`}
                value={page.query.sortBy}
                onChange={(event) => page.setQuery({ sortBy: event.target.value })}
              >
                {sorts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="managementFilterLabel">
              <span>方向</span>
              <select
                aria-label={`${name}排序方向`}
                value={page.query.sortDirection}
                onChange={(event) => page.setQuery({ sortDirection: event.target.value as 'asc' | 'desc' })}
              >
                <option value="desc">遞減</option>
                <option value="asc">遞增</option>
              </select>
            </label>
          </div>
        </div>
      )}
      {showError && page.error && (
        <p className="managementToolbarError" role="alert">
          {page.error}{' '}
          <button type="button" onClick={() => { void page.refresh().catch(() => {}); }}>
            重新載入列表
          </button>
        </p>
      )}
    </>
  );
}
