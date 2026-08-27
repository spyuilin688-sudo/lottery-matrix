import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, MagnifyingGlassIcon, ReloadIcon } from "@radix-ui/react-icons";
import { BottomNavigation } from "./BottomNavigation";
import { NumberBall as LotteryNumberBall, normalizeBallNumber } from "./NumberBall";
import {
  fetchLotteryHistory,
  fetchTongXing,
  type LotteryDrawRecord,
  type MatrixNumberOrder,
  type TongXingPair,
} from "./lottery-api";
import { paginateHistory } from "./history-pagination";
import { groupHistoryByCalendarWeek } from "./history-week-groups";
import { filterHistoryRecords, normalizeLookupNumber } from "./feature-tool-logic";
import {
  FeaturePageRouter as OriginalFeaturePageRouter,
  QuickNavigationProvider,
  useQuickNavigation,
  type ScreenId,
} from "./FeaturePages";
import type { DrawOrder, LotteryId } from "./Prototype";

export { QuickNavigationProvider };
export type { ScreenId };

type Navigate = (screen: ScreenId) => void;
type BottomNavCallbacks = {
  onQuickOpen?: () => void;
  onQuickConfigure?: () => void;
  quickActive?: boolean;
};

const LOTTERIES: LotteryId[] = ["今彩539", "天天樂", "六合彩", "大樂透"];
const QUICK_CACHE_MS = 30 * 60 * 1000;
const TITLE_ARTWORK: Record<"歷史開獎號碼" | "Matrix 同星", string> = {
  "歷史開獎號碼": "/assets/lottery/functions/歷史開獎標題K.png",
  "Matrix 同星": "/assets/lottery/functions/同星標題K.png",
};

function useTimedState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initialValue;
    try {
      const stored = window.sessionStorage.getItem(`matrix-quick:${key}`);
      if (!stored) return initialValue;
      const parsed = JSON.parse(stored) as { savedAt: number; value: T };
      if (Date.now() - parsed.savedAt > QUICK_CACHE_MS) {
        window.sessionStorage.removeItem(`matrix-quick:${key}`);
        return initialValue;
      }
      return parsed.value;
    } catch {
      return initialValue;
    }
  });
  useEffect(() => {
    window.sessionStorage.setItem(`matrix-quick:${key}`, JSON.stringify({ savedAt: Date.now(), value }));
  }, [key, value]);
  return [value, setValue] as const;
}

function MobilePagePortal({ active, children }: { active: boolean; children: React.ReactNode }) {
  if (!active || typeof document === "undefined") return children;
  const host = document.querySelector<HTMLElement>(".mobile-page");
  return host ? createPortal(children, host) : children;
}

function BottomNavigationPortal({ onNavigate, onQuickOpen, onQuickConfigure, quickActive }: { onNavigate: Navigate } & BottomNavCallbacks) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => { setHost(document.querySelector<HTMLElement>(".mobile-page")); }, []);
  return host ? createPortal(
    <BottomNavigation active="首頁" quickActive={Boolean(quickActive)} onNavigate={onNavigate} onQuickOpen={onQuickOpen} onQuickConfigure={onQuickConfigure} />,
    host,
  ) : null;
}

function ToolFeatureShell({
  title,
  children,
  onNavigate,
  backTarget = "home",
  className,
  headerAction,
  onQuickOpen,
  onQuickConfigure,
  quickActive,
}: {
  title: "歷史開獎號碼" | "Matrix 同星";
  children: React.ReactNode;
  onNavigate: Navigate;
  backTarget?: ScreenId;
  className: string;
  headerAction?: React.ReactNode;
} & BottomNavCallbacks) {
  const { onQuickBack } = useQuickNavigation();
  return (
    <main className={`feature-screen ${className}`}>
      <header className="feature-brand-header integrated-title-header">
        <div className="matrix-title-banner">
          <img src={TITLE_ARTWORK[title]} alt={title} draggable={false} />
          <button type="button" className="integrated-title-back" onClick={() => quickActive && onQuickBack ? onQuickBack() : onNavigate(backTarget)} aria-label="返回" />
          {headerAction ? <div className="matrix-title-banner-actions">{headerAction}</div> : null}
        </div>
      </header>
      <div className="feature-body">{children}</div>
      <BottomNavigationPortal onNavigate={onNavigate} onQuickOpen={onQuickOpen} onQuickConfigure={onQuickConfigure} quickActive={quickActive} />
    </main>
  );
}

function getHistoryRecordKey(record: LotteryDrawRecord) {
  const issue = getDrawIssue(record);
  const date = getDrawDate(record);
  const numbers = record.numbers.map(normalizeBallNumber).join("-");
  return `${issue}|${date}|${numbers}`;
}

function useLotteryHistory(lottery: LotteryId, limit?: number) {
  const [data, setData] = useState<LotteryDrawRecord[]>([]);
  const requestLimit = typeof limit === "number" ? Math.max(limit * 3, limit <= 10 ? 50 : 30) : undefined;
  useEffect(() => {
    let active = true;
    setData([]);
    const refresh = () => {
      fetchLotteryHistory(lottery, requestLimit).then((records) => {
        if (!active) return;
        const seen = new Set<string>();
        const uniqueRecords = records.filter((record) => {
          const key = getHistoryRecordKey(record);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setData(typeof limit === "number" ? uniqueRecords.slice(0, limit) : uniqueRecords);
      }).catch(() => { if (active) setData([]); });
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [lottery, limit, requestLimit]);
  return data;
}

function getHistoryLimit(range: string) {
  const value = Number(range.replace(/\D/g, ""));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function getHistoryOrder(numberOrder: string): DrawOrder {
  return numberOrder.includes("實際") ? "落球" : "順球";
}

function getHistoryDrawNumbers(lottery: LotteryId, record: LotteryDrawRecord, order: DrawOrder) {
  const source = order === "順球"
    ? record.sortedNumbers?.length ? record.sortedNumbers : record.numbers
    : record.drawOrderNumbers?.length ? record.drawOrderNumbers : record.numbers;
  const normalized = source.map(normalizeBallNumber);
  if (lottery === "六合彩" || lottery === "大樂透") return { main: normalized.slice(0, 6), special: normalized[6] };
  return { main: normalized.slice(0, 5), special: undefined };
}

function getDrawIssue(record: LotteryDrawRecord) { return record.period ?? record.issue ?? ""; }
function getDrawDate(record: LotteryDrawRecord) { return record.drawDate ?? record.date ?? ""; }

function HistoryDate({ value }: { value: string }) {
  const match = value.match(/^(\d{4})\/(\d{2}\/\d{2})(?:[（(]([^）)]+)[）)])?$/);
  if (!match) return <>{value}</>;
  const weekday = match[3] ?? ["日", "一", "二", "三", "四", "五", "六"][new Date(`${match[1]}-${match[2].replace("/", "-")}T00:00:00Z`).getUTCDay()];
  return <span className="history-date-stack"><strong>{match[1]}</strong><small>{match[2]} ({weekday})</small></span>;
}

function updateLookupInputValues(values: string[], index: number, rawValue: string) {
  const candidate = rawValue.replace(/\D/g, "").slice(0, 2);
  if (candidate.length === 2 && values.some((value, valueIndex) => valueIndex !== index && normalizeLookupNumber(value) === normalizeLookupNumber(candidate))) return values;
  return values.map((value, valueIndex) => valueIndex === index ? candidate : value);
}

function finalizeLookupInputValues(values: string[], index: number) {
  const raw = values[index];
  const number = Number(raw);
  const formatted = raw !== "" && number >= 1 && number <= 49 ? String(number).padStart(2, "0") : "";
  const duplicate = formatted && values.some((value, valueIndex) => valueIndex !== index && normalizeLookupNumber(value) === formatted);
  return values.map((value, valueIndex) => valueIndex === index ? duplicate ? "" : formatted : value);
}

function PatchedDrawHistoryPage({
  onNavigate,
  backTarget = "home",
  onQuickOpen,
  onQuickConfigure,
  quickActive,
}: { onNavigate: Navigate; backTarget?: ScreenId } & BottomNavCallbacks) {
  const [lottery, setLottery] = useTimedState<LotteryId>("history-lottery", "今彩539");
  const [filterExpanded, setFilterExpanded] = useState(true);
  const [filterFloating, setFilterFloating] = useState(false);
  const [filterPanelTop, setFilterPanelTop] = useState(0);
  const [year, setYear] = useTimedState("history-year", "2026");
  const [month, setMonth] = useTimedState("history-month", "08月");
  const [day, setDay] = useTimedState("history-day", "23日");
  const [dateFilterTouched, setDateFilterTouched] = useState(false);
  const [historyFilterPriority, setHistoryFilterPriority] = useState<"date" | "range">("range");
  const [range, setRange] = useTimedState("history-range", "1000期");
  const [numberOrder, setNumberOrder] = useTimedState("history-order", "依號碼由小到大排序");
  const [appliedFilters, setAppliedFilters] = useState({ issue: "", date: "" });
  const [appliedHistorySettings, setAppliedHistorySettings] = useState({ lottery, range, numberOrder });
  const [page, setPage] = useState(1);
  const selectedLotteryLatest = useLotteryHistory(lottery, 1);
  const history = useLotteryHistory(appliedHistorySettings.lottery, getHistoryLimit(appliedHistorySettings.range));
  const historyOrder = getHistoryOrder(appliedHistorySettings.numberOrder);
  const filteredHistory = useMemo(() => filterHistoryRecords(history, appliedFilters), [history, appliedFilters]);
  const paginatedHistory = useMemo(() => paginateHistory(filteredHistory, page), [filteredHistory, page]);
  const historyWeekGroups = useMemo(() => groupHistoryByCalendarWeek(paginatedHistory.items), [paginatedHistory.items]);
  const latestSelectedDate = getDrawDate(selectedLotteryLatest[0] ?? { numbers: [] });

  useEffect(() => { setPage(1); }, [appliedHistorySettings, appliedFilters]);
  useEffect(() => { if (page !== paginatedHistory.currentPage) setPage(paginatedHistory.currentPage); }, [page, paginatedHistory.currentPage]);
  useEffect(() => {
    if (dateFilterTouched) return;
    const match = latestSelectedDate.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
    if (!match) return;
    setYear(match[1]);
    setMonth(`${match[2]}月`);
    setDay(`${match[3]}日`);
  }, [dateFilterTouched, latestSelectedDate, lottery, setDay, setMonth, setYear]);

  const changeLottery = (value: LotteryId) => {
    setLottery(value);
    setAppliedHistorySettings((current) => ({ ...current, lottery: value }));
    setAppliedFilters({ issue: "", date: "" });
    setDateFilterTouched(false);
    setHistoryFilterPriority("range");
    setPage(1);
  };

  const applyHistoryFilters = () => {
    const dateIsPrimary = historyFilterPriority === "date";
    setAppliedFilters({ issue: "", date: dateIsPrimary ? `${year}/${month.replace("月", "")}/${day.replace("日", "")}` : "" });
    setAppliedHistorySettings({ lottery, range: dateIsPrimary ? "所有期數" : range, numberOrder });
    setFilterExpanded(false);
    setFilterFloating(false);
  };

  const resetHistory = () => {
    setLottery("今彩539");
    setRange("1000期");
    setNumberOrder("依號碼由小到大排序");
    setAppliedFilters({ issue: "", date: "" });
    setAppliedHistorySettings({ lottery: "今彩539", range: "1000期", numberOrder: "依號碼由小到大排序" });
    setDateFilterTouched(false);
    setHistoryFilterPriority("range");
    setPage(1);
    setFilterExpanded(true);
    setFilterFloating(false);
  };

  const toggleHistoryFilters = () => {
    if (filterExpanded) { setFilterExpanded(false); setFilterFloating(false); return; }
    const header = document.querySelector<HTMLElement>(".draw-history-screen > .feature-brand-header");
    setFilterPanelTop((header?.getBoundingClientRect().bottom ?? 0) + 8);
    setFilterExpanded(true);
    setFilterFloating(true);
  };

  const historyTitleActions = (
    <div className="history-title-actions title-card-compact-actions">
      <button type="button" className="history-reset-trigger title-card-compact-action" onClick={resetHistory}><ReloadIcon aria-hidden="true" />重設</button>
      <button type="button" className="history-filter-trigger title-card-compact-action" aria-label={filterExpanded ? "收合篩選設定" : "展開篩選設定"} aria-expanded={filterExpanded} onClick={toggleHistoryFilters}>
        <svg className="history-filter-trigger-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 2h9L7 6v3.2L5 10V6L1.5 2Z" /></svg>
        篩選設定
        <ChevronDownIcon data-open={filterExpanded} />
      </button>
    </div>
  );

  return (
    <ToolFeatureShell title="歷史開獎號碼" onNavigate={onNavigate} backTarget={backTarget} className="draw-history-screen sticky-title-card-screen" headerAction={historyTitleActions} onQuickOpen={onQuickOpen} onQuickConfigure={onQuickConfigure} quickActive={quickActive}>
      <MobilePagePortal active={filterFloating}>
        <section className="history-filter-panel" data-floating={filterFloating} role={filterFloating ? "dialog" : "region"} aria-label="歷史篩選設定" hidden={!filterExpanded} style={filterFloating ? { top: `${filterPanelTop}px`, "--select-tech-surface": "#030b13", "--select-tech-accent": "#f0bd36", "--select-tech-text": "#d4d0c8", "--select-tech-cut": "8px" } as React.CSSProperties : undefined}>
          <div className="history-filter-primary-row">
            <div className="select-box native-select"><select aria-label="彩種" value={lottery} onChange={(event) => changeLottery(event.target.value as LotteryId)}>{LOTTERIES.map((item) => <option value={item} key={item}>{item}</option>)}</select><ChevronDownIcon aria-hidden="true" /></div>
            <div className="select-box native-select history-order-select"><select aria-label="號碼順序" value={numberOrder} onChange={(event) => setNumberOrder(event.target.value)}><option>依號碼由小到大排序</option><option>依實際開獎順序排序</option></select><ChevronDownIcon aria-hidden="true" /></div>
          </div>
          <div className="history-filter-secondary-row">
            <div className="history-date-selects">
              <div className="select-box native-select"><select aria-label="年份" value={year} onChange={(event) => { setYear(event.target.value); setDateFilterTouched(true); setHistoryFilterPriority("date"); }}>{["2026", "2025", "2024"].map((value) => <option key={value}>{value}</option>)}</select><ChevronDownIcon aria-hidden="true" /></div>
              <div className="select-box native-select"><select aria-label="月份" value={month} onChange={(event) => { setMonth(event.target.value); setDateFilterTouched(true); setHistoryFilterPriority("date"); }}>{Array.from({ length: 12 }, (_, index) => `${String(index + 1).padStart(2, "0")}月`).map((value) => <option key={value}>{value}</option>)}</select><ChevronDownIcon aria-hidden="true" /></div>
              <div className="select-box native-select"><select aria-label="日期" value={day} onChange={(event) => { setDay(event.target.value); setDateFilterTouched(true); setHistoryFilterPriority("date"); }}>{Array.from({ length: 31 }, (_, index) => `${String(index + 1).padStart(2, "0")}日`).map((value) => <option key={value}>{value}</option>)}</select><ChevronDownIcon aria-hidden="true" /></div>
            </div>
            <div className="select-box native-select history-range-select"><select aria-label="探索範圍" value={range} onChange={(event) => { setRange(event.target.value); setHistoryFilterPriority("range"); }}>{["1000期", "3000期", "5000期", "所有期數"].map((value) => <option value={value} key={value}>{value}</option>)}</select><ChevronDownIcon aria-hidden="true" /></div>
            <button type="button" className="history-filter-start branded-explore-action" onClick={applyHistoryFilters}><MagnifyingGlassIcon aria-hidden="true" /><span>開始探索</span></button>
          </div>
        </section>
      </MobilePagePortal>
      <div className="matrix-explore-main-screen draw-history-history-scope">
        <div className="draw-history-week-list" data-lottery={appliedHistorySettings.lottery} aria-label={`${appliedHistorySettings.lottery}歷史開獎號碼`}>
          {historyWeekGroups.map((weekRecords) => {
            const firstIssue = weekRecords[0]?.period ?? weekRecords[0]?.issue ?? "";
            return (
              <section className="panel history-panel draw-history-panel" data-lottery={appliedHistorySettings.lottery} key={firstIssue}>
                <div className="history-row draw-history-row history-head draw-history-head"><span>期數</span><span>日期</span><span>開獎號碼</span></div>
                {weekRecords.map((record) => {
                  const draw = getHistoryDrawNumbers(appliedHistorySettings.lottery, record, historyOrder);
                  const issue = getDrawIssue(record);
                  const date = getDrawDate(record);
                  return <div className="history-row draw-history-row" key={issue}><span className="draw-history-meta">{issue}</span><span className="draw-history-meta"><HistoryDate value={date} /></span><span className="history-numbers" data-has-special={Boolean(draw.special)}><span className="history-main-numbers">{draw.main.map((num, index) => <LotteryNumberBall className="history-lottery-ball" key={`${issue}-${num}-${index}`} lottery={appliedHistorySettings.lottery} number={num} />)}</span>{draw.special ? <span className="history-special-number"><span className="history-special-plus" aria-hidden="true">+</span><span className="history-special-ball"><small className="history-special-label">特別號</small><LotteryNumberBall className="history-lottery-ball" lottery={appliedHistorySettings.lottery} number={draw.special} isSpecial /></span></span> : null}</span></div>;
                })}
              </section>
            );
          })}
        </div>
      </div>
      {paginatedHistory.totalPages > 1 ? <nav className="history-pagination" aria-label="歷史開獎號碼分頁"><button type="button" aria-label="上一頁" disabled={paginatedHistory.currentPage === 1} onClick={() => setPage((current) => current - 1)}><ChevronLeftIcon aria-hidden="true" /></button><span>{paginatedHistory.currentPage} / {paginatedHistory.totalPages}</span><button type="button" aria-label="下一頁" disabled={paginatedHistory.currentPage === paginatedHistory.totalPages} onClick={() => setPage((current) => current + 1)}><ChevronRightIcon aria-hidden="true" /></button></nav> : null}
    </ToolFeatureShell>
  );
}

function PatchedTongXingPage({ onNavigate, onQuickOpen, onQuickConfigure, quickActive }: { onNavigate: Navigate } & BottomNavCallbacks) {
  const [lottery, setLottery] = useTimedState<LotteryId>("tongxing-lottery", "今彩539");
  const [order, setOrder] = useTimedState("tongxing-order", "依號碼由小到大排序");
  const [period, setPeriod] = useTimedState("tongxing-period", "1期");
  const [searched, setSearched] = useTimedState("tongxing-searched", false);
  const [values, setValues] = useTimedState("tongxing-values", ["", "", ""]);
  const [appliedValues, setAppliedValues] = useState<string[]>([]);
  const [appliedLottery, setAppliedLottery] = useState<LotteryId>(lottery);
  const [appliedOrder, setAppliedOrder] = useState(order);
  const [resultGroups, setResultGroups] = useState<TongXingPair[]>([]);
  const [settingsExpanded, setSettingsExpanded] = useState(true);
  const [settingsFloating, setSettingsFloating] = useState(false);
  const [settingsPanelTop, setSettingsPanelTop] = useState(0);
  const resultsEndRef = useRef<HTMLElement>(null);
  const periodOffset = Number(period.replace(/\D/g, "")) || 1;
  const historyOrder = getHistoryOrder(appliedOrder);
  const resultColumns = appliedLottery === "六合彩" || appliedLottery === "大樂透" ? ["一", "二", "三", "四", "五", "六", "特"] : ["一", "二", "三", "四", "五"];

  const handleSearch = async () => {
    const hasInvalidValue = values.some((value) => value !== "" && !/^(0[1-9]|[1-4][0-9])$/.test(value));
    if (hasInvalidValue) { setValues(values.map((value) => /^(0[1-9]|[1-4][0-9])$/.test(value) ? value : "")); return; }
    const normalizedValues = values.map(normalizeLookupNumber).filter(Boolean);
    setSettingsExpanded(false);
    setSettingsFloating(false);
    setAppliedValues(normalizedValues);
    setAppliedLottery(lottery);
    setAppliedOrder(order);
    setResultGroups([]);
    try {
      const response = await fetchTongXing({ lottery, numberOrder: order as MatrixNumberOrder, numbers: normalizedValues, futureOffset: periodOffset });
      setResultGroups(response.groups);
    } catch { setResultGroups([]); }
    setSearched(true);
    requestAnimationFrame(() => requestAnimationFrame(() => resultsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })));
  };

  const toggleSettingsPanel = () => {
    if (settingsExpanded) { setSettingsExpanded(false); setSettingsFloating(false); return; }
    const header = document.querySelector<HTMLElement>(".tongxing-screen > .feature-brand-header");
    setSettingsPanelTop((header?.getBoundingClientRect().bottom ?? 0) + 8);
    setSettingsExpanded(true);
    setSettingsFloating(true);
  };

  const renderResultRow = (entry: LotteryDrawRecord, type: "locked" | "predicted") => {
    const issue = getDrawIssue(entry);
    const date = getDrawDate(entry);
    const draw = getHistoryDrawNumbers(appliedLottery, entry, historyOrder);
    const displayedNumbers = draw.special ? [...draw.main, draw.special] : [...draw.main];
    const inputNumbers = new Set(appliedValues);
    return <div className="tongxing-table-row" data-row-type={type}><span className="tongxing-period-cell" aria-label={`${type === "locked" ? "鎖定條件期" : "預測期"} ${issue} ${date.slice(0, 10)}`}><strong>{issue}</strong><time>{date.slice(0, 10)}</time></span>{displayedNumbers.map((number, index) => <span key={`${issue}-${index}`} className={type === "locked" && inputNumbers.has(number) ? "locked-input-number" : undefined}>{number}</span>)}</div>;
  };

  return (
    <ToolFeatureShell title="Matrix 同星" onNavigate={onNavigate} className="tongxing-screen sticky-title-card-screen" headerAction={<div className="tongxing-title-actions title-card-compact-actions"><button type="button" className="title-card-compact-action" aria-label={settingsExpanded ? "收合同星探索設定" : "展開同星探索設定"} aria-expanded={settingsExpanded} onClick={toggleSettingsPanel}><span>探索設定</span><ChevronDownIcon data-open={settingsExpanded} /></button></div>} onQuickOpen={onQuickOpen} onQuickConfigure={onQuickConfigure} quickActive={quickActive}>
      <MobilePagePortal active={settingsFloating}>
        <section className="panel tongxing-query tongxing-panel-scope" data-floating={settingsFloating} role={settingsFloating ? "dialog" : "region"} aria-label="同星探索設定" hidden={!settingsExpanded} style={settingsFloating ? { top: `${settingsPanelTop}px`, "--select-tech-surface": "#030b13", "--select-tech-accent": "#f0bd36", "--select-tech-text": "#d4d0c8", "--select-tech-cut": "8px" } as React.CSSProperties : undefined}>
          <div className="query-selects"><div className="select-box native-select"><select aria-label="彩種" value={lottery} onChange={(event) => setLottery(event.target.value as LotteryId)}>{LOTTERIES.map((item) => <option value={item} key={item}>{item}</option>)}</select><ChevronDownIcon aria-hidden="true" /></div><div className="select-box native-select tongxing-order-select"><select aria-label="號碼順序" value={order} onChange={(event) => setOrder(event.target.value)}><option value="依號碼由小到大排序">依號碼由小到大排序</option><option value="依實際開獎順序排序">依實際開獎順序排序</option></select><ChevronDownIcon aria-hidden="true" /></div></div>
          <div className="same-star-fields">{values.map((value, index) => <input key={index} aria-label={`號碼 ${index + 1}`} value={value} inputMode="numeric" pattern="(0[1-9]|[1-4][0-9])" maxLength={2} onClick={(event) => event.currentTarget.select()} onChange={(event) => setValues(updateLookupInputValues(values, index, event.target.value))} onBlur={() => setValues(finalizeLookupInputValues(values, index))} />)}<span>之後下</span><div className="select-box native-select same-star-period-select"><select aria-label="之後期數" value={period} onChange={(event) => setPeriod(event.target.value)}>{Array.from({ length: 30 }, (_, index) => `${index + 1}期`).map((item) => <option value={item} key={item}>{item}</option>)}</select><ChevronDownIcon aria-hidden="true" /></div><span>開出</span></div>
          <button type="button" className="primary-action branded-explore-action" onClick={handleSearch}><MagnifyingGlassIcon /><span>開始探索</span></button>
        </section>
      </MobilePagePortal>
      {searched ? <><div className="ornament-title"><span />探索結果<span /></div><section ref={resultsEndRef} className="panel tongxing-results"><div className="tongxing-table" data-columns={resultColumns.length} aria-label={`${appliedLottery}同星探索結果`}><div className="tongxing-table-row tongxing-table-head"><span>期數</span>{resultColumns.map((column) => <span key={column}>{column}</span>)}</div>{resultGroups.map(({ lockedEntry, predictedEntry }) => <article className="tongxing-result-group" key={getDrawIssue(lockedEntry)}>{renderResultRow(lockedEntry, "locked")}{renderResultRow(predictedEntry, "predicted")}</article>)}</div></section></> : null}
    </ToolFeatureShell>
  );
}

export function FeaturePageRouter({
  screen,
  onNavigate,
  historyReturnScreen = "home",
  onQuickOpen,
  onQuickConfigure,
  quickActive,
}: {
  screen: ScreenId;
  onNavigate: Navigate;
  historyReturnScreen?: ScreenId;
} & BottomNavCallbacks) {
  if (screen === "history") return <PatchedDrawHistoryPage onNavigate={onNavigate} backTarget={historyReturnScreen} onQuickOpen={onQuickOpen} onQuickConfigure={onQuickConfigure} quickActive={quickActive} />;
  if (screen === "tongxing") return <PatchedTongXingPage onNavigate={onNavigate} onQuickOpen={onQuickOpen} onQuickConfigure={onQuickConfigure} quickActive={quickActive} />;
  return <OriginalFeaturePageRouter screen={screen} onNavigate={onNavigate} historyReturnScreen={historyReturnScreen} />;
}
