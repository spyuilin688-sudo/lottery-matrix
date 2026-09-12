import { useEffect, useMemo, useState } from "react";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { type LotteryId } from "../Prototype";
import { NumberBall as LotteryNumberBall } from "../NumberBall";
import { paginateHistory } from "../history-pagination";
import { groupHistoryByCalendarWeek } from "../history-week-groups";
import { filterHistoryRecords } from "../feature-tool-logic";
import { Navigate, ScreenId } from "./navigation";
import { useTimedState, useLotteryHistory, getHistoryLimit, getHistoryOrder, FeatureShell, MobilePagePortal, LOTTERIES, getHistoryDrawNumbers, HistoryDate } from "./shared";

export function DrawHistoryPage({
  onNavigate,
  backTarget = "home",
}: {
  onNavigate: Navigate;
  backTarget?: ScreenId;
}) {
  const [lottery, setLottery] = useTimedState<LotteryId>("history-lottery", "今彩539");
  const [filterExpanded, setFilterExpanded] = useState(true);
  const [filterFloating, setFilterFloating] = useState(false);
  const [filterPanelTop, setFilterPanelTop] = useState(0);
  const [year, setYear] = useTimedState("history-year", "2026");
  const [month, setMonth] = useTimedState("history-month", "07月");
  const [day, setDay] = useTimedState("history-day", "31日");
  const [dateFilterTouched, setDateFilterTouched] = useState(false);
  const [range, setRange] = useTimedState("history-range", "1000期");
  const [numberOrder, setNumberOrder] = useTimedState("history-order", "依號碼由小到大排序");
  const [appliedFilters, setAppliedFilters] = useState({ issue: "", date: "" });
  const [appliedHistorySettings, setAppliedHistorySettings] = useState({
    lottery,
    range,
    numberOrder,
  });
  const [page, setPage] = useState(1);
  const history = useLotteryHistory(
    appliedHistorySettings.lottery,
    getHistoryLimit(appliedHistorySettings.range),
  );
  const historyOrder = getHistoryOrder(appliedHistorySettings.numberOrder);
  const filteredHistory = useMemo(
    () => filterHistoryRecords(history, appliedFilters),
    [history, appliedFilters],
  );
  const paginatedHistory = useMemo(() => paginateHistory(filteredHistory, page), [filteredHistory, page]);
  const historyWeekGroups = useMemo(
    () => groupHistoryByCalendarWeek(paginatedHistory.items),
    [paginatedHistory.items],
  );

  useEffect(() => {
    setPage(1);
  }, [appliedHistorySettings, appliedFilters]);

  useEffect(() => {
    if (page !== paginatedHistory.currentPage) setPage(paginatedHistory.currentPage);
  }, [page, paginatedHistory.currentPage]);

  const applyHistoryFilters = () => {
    setAppliedFilters({
      issue: "",
      date: dateFilterTouched ? `${year}/${month.replace("月", "")}/${day.replace("日", "")}` : "",
    });
    setAppliedHistorySettings({ lottery, range, numberOrder });
    setFilterExpanded(false);
    setFilterFloating(false);
  };

  const toggleHistoryFilters = () => {
    if (filterExpanded) {
      setFilterExpanded(false);
      setFilterFloating(false);
      return;
    }
    const header = document.querySelector<HTMLElement>(".draw-history-screen > .feature-brand-header");
    setFilterPanelTop((header?.getBoundingClientRect().bottom ?? 0) + 8);
    setFilterExpanded(true);
    setFilterFloating(true);
  };

  const historyTitleActions = (
    <div className="history-title-actions title-card-compact-actions">
      <button
        type="button"
        className="history-filter-trigger title-card-compact-action"
        aria-label={filterExpanded ? "收合篩選設定" : "展開篩選設定"}
        aria-expanded={filterExpanded}
        onClick={toggleHistoryFilters}
      >
        <svg className="history-filter-trigger-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 2h9L7 6v3.2L5 10V6L1.5 2Z" /></svg>
        篩選設定
        <ChevronDownIcon data-open={filterExpanded} />
      </button>
    </div>
  );

  return (
    <FeatureShell
      title="歷史開獎號碼"
      onNavigate={onNavigate}
      backTarget={backTarget}
      className="draw-history-screen sticky-title-card-screen"
      headerAction={historyTitleActions}
    >
      <MobilePagePortal active={filterFloating}>
        <section
          className="history-filter-panel"
          data-floating={filterFloating}
          role={filterFloating ? "dialog" : "region"}
          aria-label="歷史篩選設定"
          hidden={!filterExpanded}
          style={filterFloating ? {
            top: `${filterPanelTop}px`,
            "--select-tech-surface": "#030b13",
            "--select-tech-accent": "#f0bd36",
            "--select-tech-text": "#d4d0c8",
            "--select-tech-cut": "8px",
          } as React.CSSProperties : undefined}
        >
          <div className="history-filter-primary-row">
            <div className="select-box native-select">
              <select aria-label="彩種" value={lottery} onChange={(event) => setLottery(event.target.value as LotteryId)}>
                {LOTTERIES.map((item) => <option value={item} key={item}>{item}</option>)}
              </select>
              <ChevronDownIcon aria-hidden="true" />
            </div>
            <div className="select-box native-select history-order-select">
              <select aria-label="號碼順序" value={numberOrder} onChange={(event) => setNumberOrder(event.target.value)}>
                <option>依號碼由小到大排序</option>
                <option>依實際開獎順序排序</option>
              </select>
              <ChevronDownIcon aria-hidden="true" />
            </div>
          </div>
          <div className="history-filter-secondary-row">
            <div className="history-date-selects">
              <div className="select-box native-select">
                <select aria-label="年份" value={year} onChange={(event) => { setYear(event.target.value); setDateFilterTouched(true); }}>
                  {["2026", "2025", "2024"].map((value) => <option key={value}>{value}</option>)}
                </select>
                <ChevronDownIcon aria-hidden="true" />
              </div>
              <div className="select-box native-select">
                <select aria-label="月份" value={month} onChange={(event) => { setMonth(event.target.value); setDateFilterTouched(true); }}>
                  {Array.from({ length: 12 }, (_, index) => `${String(index + 1).padStart(2, "0")}月`).map((value) => <option key={value}>{value}</option>)}
                </select>
                <ChevronDownIcon aria-hidden="true" />
              </div>
              <div className="select-box native-select">
                <select aria-label="日期" value={day} onChange={(event) => { setDay(event.target.value); setDateFilterTouched(true); }}>
                  {Array.from({ length: 31 }, (_, index) => `${String(index + 1).padStart(2, "0")}日`).map((value) => <option key={value}>{value}</option>)}
                </select>
                <ChevronDownIcon aria-hidden="true" />
              </div>
            </div>
            <div className="select-box native-select history-range-select">
              <select aria-label="探索範圍" value={range} onChange={(event) => setRange(event.target.value)}>
                {["1000期", "3000期", "5000期", "所有期數"].map((value) => <option value={value} key={value}>{value}</option>)}
              </select>
              <ChevronDownIcon aria-hidden="true" />
            </div>
            <button type="button" className="history-filter-start" onClick={applyHistoryFilters}>開始探索</button>
          </div>
        </section>
      </MobilePagePortal>
      <div className="matrix-explore-main-screen draw-history-history-scope">
      <div className="draw-history-week-list" data-lottery={appliedHistorySettings.lottery} aria-label={`${appliedHistorySettings.lottery}歷史開獎號碼`}>
        {historyWeekGroups.map((weekRecords) => {
          const firstIssue = weekRecords[0]?.period ?? weekRecords[0]?.issue ?? "";
          return (
            <section className="panel history-panel draw-history-panel" data-lottery={appliedHistorySettings.lottery} key={firstIssue}>
              <div className="history-row draw-history-row history-head draw-history-head">
                <span>期數</span>
                <span>日期</span>
                <span>開獎號碼</span>
              </div>
              {weekRecords.map((record) => {
                const draw = getHistoryDrawNumbers(appliedHistorySettings.lottery, record, historyOrder);
                const issue = record.period ?? record.issue ?? "";
                const date = record.drawDate ?? record.date ?? "";

                return (
                  <div className="history-row draw-history-row" key={issue}>
                    <span className="draw-history-meta">{issue}</span>
                    <span className="draw-history-meta"><HistoryDate value={date} /></span>
                    <span className="history-numbers" data-has-special={Boolean(draw.special)}>
                      <span className="history-main-numbers">
                        {!draw.main.length ? "待公布" : null}{draw.main.map((num, index) => <LotteryNumberBall className="history-lottery-ball" key={`${issue}-${num}-${index}`} lottery={appliedHistorySettings.lottery} number={num} />)}
                      </span>
                      {draw.special ? (
                        <span className="history-special-number">
                          <span className="history-special-plus" aria-hidden="true">+</span>
                          <span className="history-special-ball">
                            <small className="history-special-label">特別號</small>
                            <LotteryNumberBall className="history-lottery-ball" lottery={appliedHistorySettings.lottery} number={draw.special} isSpecial />
                          </span>
                        </span>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
      </div>
      {paginatedHistory.totalPages > 1 ? (
        <nav className="history-pagination" aria-label="歷史開獎號碼分頁">
          <button type="button" aria-label="上一頁" disabled={paginatedHistory.currentPage === 1} onClick={() => setPage((current) => current - 1)}>
            <ChevronLeftIcon aria-hidden="true" />
          </button>
          <span>{paginatedHistory.currentPage} / {paginatedHistory.totalPages}</span>
          <button type="button" aria-label="下一頁" disabled={paginatedHistory.currentPage === paginatedHistory.totalPages} onClick={() => setPage((current) => current + 1)}>
            <ChevronRightIcon aria-hidden="true" />
          </button>
        </nav>
      ) : null}
    </FeatureShell>
  );
}
