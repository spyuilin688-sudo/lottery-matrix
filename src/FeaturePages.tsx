import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  Cross2Icon,
  DownloadIcon,
  GearIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  Pencil2Icon,
  PlusIcon,
  ReaderIcon,
  ReloadIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { LotterySwitcher, type LotteryId, type DrawOrder } from "./Prototype";
import { BottomNavigation } from "./BottomNavigation";
import { NumberBall as LotteryNumberBall, normalizeBallNumber } from "./NumberBall";
import {
  fetchLotteryHistory,
  fetchNumberReference,
  fetchTongXing,
  type LotteryDrawRecord,
  type MatrixNumberOrder,
  type NumberReferenceItem,
  type TongXingPair,
} from "./lottery-api";
import { BrandLogo, PRIMARY_BRAND_LOGO } from "./BrandLogo";
import { paginateHistory } from "./history-pagination";
import { groupHistoryByCalendarWeek, isNearHistoryWeekBoundary } from "./history-week-groups";
import { formatReferenceNumber, sanitizeReferenceNumber } from "./reference-number-input";
import {
  filterHistoryRecords,
  isDuplicateLookupNumber,
  normalizeLookupNumber,
} from "./feature-tool-logic";
import {
  isActivationRedemptionError,
  redeemActivationCode,
  type ActivationRedemptionErrorCode,
} from "./activation/redeemActivationCode";

export type ScreenId =
  | "home"
  | "matrix-core"
  | "explore"
  | "tianyan"
  | "tiangong"
  | "tongxing"
  | "history"
  | "reference"
  | "calculator"
  | "matrix-card"
  | "guide"
  | "notes"
  | "notebook"
  | "notifications"
  | "profile"
  | "subscription-management"
  | "pro-plans"
  | "about-matrix"
  | "activation-code"
  | "service-info"
  | "refund-policy"
  | "merchant-info"
  | "member-terms"
  | "privacy-policy"
  | "payment-history"
  | "problem-report"
  | "business-cooperation"
  | "invite-friends"
  | "promotions"
  | "version-info"
  | "update-history"
  | "disclaimer"
  | "status";

type Navigate = (screen: ScreenId) => void;

type QuickNavigationContextValue = {
  onQuickOpen?: () => void;
  onQuickConfigure?: () => void;
  currentScreen?: ScreenId;
  quickTarget?: ScreenId | null;
  quickActive?: boolean;
};

const QuickNavigationContext = createContext<QuickNavigationContextValue>({});

export function QuickNavigationProvider({
  children,
  onQuickOpen,
  onQuickConfigure,
  currentScreen,
  quickTarget,
  quickActive,
}: QuickNavigationContextValue & { children: React.ReactNode }) {
  return (
    <QuickNavigationContext.Provider value={{ onQuickOpen, onQuickConfigure, currentScreen, quickTarget, quickActive }}>
      {children}
    </QuickNavigationContext.Provider>
  );
}

const QUICK_CACHE_MS = 30 * 60 * 1000;

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

const LOTTERIES: LotteryId[] = ["今彩539", "天天樂", "六合彩", "大樂透"];
const MATRIX_PAGE_ITEMS = [
  { screen: "explore", label: "Matrix 探索", image: "/assets/lottery/functions/Matrix探索.png" },
  { screen: "tianyan", label: "Matrix 天衍", image: "/assets/lottery/functions/Matrix天衍.png" },
  { screen: "tiangong", label: "Matrix 天工", image: "/assets/lottery/functions/Matrix天工.png" },
] as const;

const MATRIX_TITLE_ARTWORK: Partial<Record<string, string>> = {
  "Matrix 探索": "/assets/lottery/functions/探索標題K.png",
  "Matrix 天衍": "/assets/lottery/functions/天衍標題K.png",
  "Matrix 天工": "/assets/lottery/functions/天工標題K.png",
  "Matrix 指南": "/assets/lottery/functions/指南標題K.png",
  "Matrix 同星": "/assets/lottery/functions/同星標題K.png",
  "Matrix 牌單": "/assets/lottery/functions/牌單標題K.png",
  "Matrix 狀態": "/assets/lottery/functions/狀態標題K.png",
  "Matrix 筆記本": "/assets/lottery/functions/筆記本標題K.png",
  "號碼對照單": "/assets/lottery/functions/對照單標題K.png",
  "歷史開獎號碼": "/assets/lottery/functions/歷史開獎標題K.png",
  "連碰計算機": "/assets/lottery/functions/連碰標題K.png",
  "立柱計算機": "/assets/lottery/functions/立柱標題K.png",
  "Matrix Pro 方案與收費標準": "/assets/lottery/functions/會員方案標題K.png",
  "Matrix 自訂觸發狀態": "/assets/lottery/functions/自訂觸發標題K.png",
};

function MatrixPageSwitcher({ onNavigate }: {
  current?: "explore" | "tianyan" | "tiangong";
  onNavigate: Navigate;
}) {
  return (
    <nav className="matrix-page-switcher" aria-label="Matrix Core 功能切換">
      <button type="button" aria-label="Matrix 天衍" onClick={() => onNavigate("tianyan")}>
        <img src="/assets/lottery/functions/Matrix天衍.png" alt="" draggable={false} />
      </button>
      <button type="button" aria-label="Matrix 天工" onClick={() => onNavigate("tiangong")}>
        <img src="/assets/lottery/functions/Matrix天工.png" alt="" draggable={false} />
      </button>
    </nav>
  );
}
const ROAD_VALIDATION_SAMPLE_HISTORY = [
  ["5887", "2026/06/12（四）", ["02", "03", "18", "29", "31"]],
  ["5888", "2026/06/13（五）", ["04", "05", "06", "34", "36"]],
  ["5889", "2026/06/15（日）", ["12", "16", "24", "28", "36"]],
  ["5890", "2026/06/16（一）", ["05", "17", "23", "25", "29"]],
  ["5891", "2026/06/17（二）", ["08", "10", "15", "16", "37"]],
  ["5892", "2026/06/18（三）", ["09", "20", "27", "28", "30"]],
  ["5893", "2026/06/19（四）", ["01", "05", "07", "13", "25"]],
  ["5894", "2026/06/20（五）", ["04", "11", "24", "25", "31"]],
  ["5895", "2026/06/21（六）", ["02", "09", "18", "26", "34"]],
  ["5896", "2026/06/23（一）", ["05", "12", "21", "28", "37"]],
] as const;

function BrandHeader({
  title,
  onBack,
  action,
  compact = false,
  hideTitle = false,
  showBack = true,
}: {
  title: string;
  onBack: () => void;
  action?: React.ReactNode;
  compact?: boolean;
  hideTitle?: boolean;
  showBack?: boolean;
}) {
  const integratedArtwork = MATRIX_TITLE_ARTWORK[title];
  if (integratedArtwork && !hideTitle) {
    return (
      <header className="feature-brand-header integrated-title-header" data-compact={compact}>
        <div className="matrix-title-banner">
          <img src={integratedArtwork} alt={title} draggable={false} />
          {showBack ? <button type="button" className="integrated-title-back" onClick={onBack} aria-label="返回" /> : null}
          {action ? <div className="matrix-title-banner-actions">{action}</div> : null}
        </div>
      </header>
    );
  }
  return (
    <header className="feature-brand-header" data-compact={compact} data-hide-title={hideTitle}>
      {!compact || showBack ? (
        <div className="feature-brand-row">
          {showBack ? (
            <div className="back-button-slot">
              <button type="button" className="icon-button back-button" onClick={onBack} aria-label="返回">
                <ChevronLeftIcon aria-hidden="true" />
              </button>
            </div>
          ) : null}
          <div className="feature-brand-lockup"><BrandLogo /></div>
        </div>
      ) : <BrandLogo />}
      {!hideTitle ? (
        <div className="feature-title-card">
          <h1>{title}</h1>
          {action ? <div className="feature-title-actions">{action}</div> : null}
        </div>
      ) : null}
    </header>
  );
}

function FeatureBottomNavigationPortal({
  active,
  onNavigate,
}: {
  active: "首頁" | "快捷" | "通知" | "我的";
  onNavigate: Navigate;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const { onQuickOpen, onQuickConfigure, quickActive } = useContext(QuickNavigationContext);

  useEffect(() => {
    setHost(document.querySelector<HTMLElement>(".mobile-page"));
  }, []);

  return host
    ? createPortal(
        <BottomNavigation
          active={active}
          quickActive={Boolean(quickActive)}
          onNavigate={onNavigate}
          onQuickOpen={onQuickOpen}
          onQuickConfigure={onQuickConfigure}
        />,
        host,
      )
    : null;
}

function MobilePagePortal({ active, children }: { active: boolean; children: React.ReactNode }) {
  if (!active || typeof document === "undefined") return children;
  const host = document.querySelector<HTMLElement>(".mobile-page");
  return host ? createPortal(children, host) : children;
}

function FeatureShell({
  title,
  children,
  onNavigate,
  active = "首頁",
  className = "",
  backTarget = "home",
  headerAction,
  compactHeader = false,
  hidePageTitle = false,
}: {
  title: string;
  children: React.ReactNode;
  onNavigate: Navigate;
  active?: "首頁" | "快捷" | "通知" | "我的";
  className?: string;
  backTarget?: ScreenId;
  headerAction?: React.ReactNode;
  compactHeader?: boolean;
  hidePageTitle?: boolean;
}) {
  const logoOnlyHeader = compactHeader || active !== "首頁";
  const hideTitle = hidePageTitle || compactHeader;
  return (
    <main className={`feature-screen ${logoOnlyHeader ? "compact-feature-screen bottom-nav-brand-screen" : ""} ${className}`.trim()}>
      <BrandHeader
        title={title}
        onBack={() => onNavigate(backTarget)}
        action={headerAction}
        compact={logoOnlyHeader}
        hideTitle={hideTitle}
        showBack={Boolean(MATRIX_TITLE_ARTWORK[title]) || !logoOnlyHeader || (active === "我的" && backTarget === "profile")}
      />
      <div className="feature-body">{children}</div>
      <FeatureBottomNavigationPortal active={active} onNavigate={onNavigate} />
    </main>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="section-title"><span />{children}</h2>;
}

function SettingLabelIcon({
  type,
}: {
  type: "lottery" | "period" | "road" | "order" | "date" | "range";
}) {
  return (
    <span className="setting-label-icon" aria-hidden="true">
      <img src={`/assets/matrix-explore/${type}.png`} alt="" />
    </span>
  );
}

function LotteryTabs({
  selected,
  onChange,
}: {
  selected: LotteryId;
  onChange: (value: LotteryId) => void;
}) {
  return (
    <div className="lottery-tabs" role="tablist" aria-label="彩種">
      {LOTTERIES.map((item) => (
        <button
          type="button"
          role="tab"
          aria-selected={selected === item}
          data-selected={selected === item}
          onClick={() => onChange(item)}
          key={item}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

const LOTTERY_LOGOS: Record<LotteryId, string> = {
  "今彩539": "/assets/lottery/jincai-539-logo.png",
  "天天樂": "/assets/lottery/fantasy-5-logo.png",
  "六合彩": "/assets/lottery/mark-six-logo.png",
  "大樂透": "/assets/lottery/lotto-649-logo.png",
};

function LotteryLogoTabs({ selected, onChange }: {
  selected: LotteryId;
  onChange: (value: LotteryId) => void;
}) {
  return (
    <div className="lottery-logo-tabs" role="tablist" aria-label="彩種">
      {LOTTERIES.map((item) => (
        <button
          type="button"
          role="tab"
          aria-selected={selected === item}
          data-selected={selected === item}
          onClick={() => onChange(item)}
          key={item}
        >
          <img src={LOTTERY_LOGOS[item]} alt="" />
          <span>{item}</span>
        </button>
      ))}
    </div>
  );
}

function SelectBox({
  children,
  badge,
}: {
  children: React.ReactNode;
  badge?: string;
}) {
  return (
    <button type="button" className="select-box">
      <span>{children}</span>
      {badge ? <em>{badge}</em> : null}
      <ChevronDownIcon />
    </button>
  );
}

function MiniBall({ number, tone = "gold" }: { number: string; tone?: string }) {
  return <span className="mini-ball" data-tone={tone}>{number}</span>;
}

type HistoryDrawNumbers = {
  main: string[];
  special?: string;
};

function getHistoryRecordKey(record: LotteryDrawRecord) {
  const issue = getDrawIssue(record);
  const date = getDrawDate(record);
  const numbers = record.numbers.map(normalizeBallNumber).join("-");
  return `${issue}|${date}|${numbers}`;
}

function useLotteryHistory(lottery: LotteryId, limit?: number) {
  const [data, setData] = useState<LotteryDrawRecord[]>([]);
  const requestLimit = typeof limit === "number" ? Math.max(limit * 3, 30) : undefined;

  useEffect(() => {
    let active = true;
    setData([]);

    const refreshLotteryHistory = () => {
      fetchLotteryHistory(lottery, requestLimit)
        .then((records) => {
          if (!active) return;

          const seen = new Set<string>();
          const uniqueRecords = records.filter((record) => {
            const key = getHistoryRecordKey(record);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          setData(typeof limit === "number" ? uniqueRecords.slice(0, limit) : uniqueRecords);
        })
        .catch(() => {
          if (active) setData([]);
        });
    };

    refreshLotteryHistory();
    const refreshTimer = window.setInterval(refreshLotteryHistory, 60_000);

    return () => {
      active = false;
      window.clearInterval(refreshTimer);
    };
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

function getHistoryDrawNumbers(
  lottery: LotteryId,
  record: LotteryDrawRecord,
  order: DrawOrder,
): HistoryDrawNumbers {
  const source = order === "順球"
    ? record.sortedNumbers?.length ? record.sortedNumbers : record.numbers
    : record.drawOrderNumbers?.length ? record.drawOrderNumbers : record.numbers;
  const normalized = source.map(normalizeBallNumber);

  if (lottery === "六合彩" || lottery === "大樂透") {
    return {
      main: normalized.slice(0, 6),
      special: normalized[6],
    };
  }

  return {
    main: normalized.slice(0, 5),
    special: undefined,
  };
}

function HistoryDate({ value }: { value: string }) {
  const match = value.match(/^(\d{4})\/(\d{2}\/\d{2})(?:[（(]([^）)]+)[）)])?$/);

  if (!match) return <>{value}</>;

  const weekday = match[3] ?? ["日", "一", "二", "三", "四", "五", "六"][
    new Date(`${match[1]}-${match[2].replace("/", "-")}T00:00:00Z`).getUTCDay()
  ];

  return (
    <span className="history-date-stack">
      <strong>{match[1]}</strong>
      <small>{match[2]} ({weekday})</small>
    </span>
  );
}

function getDrawIssue(record: LotteryDrawRecord) {
  return record.period ?? record.issue ?? "";
}

function getDrawDate(record: LotteryDrawRecord) {
  return record.drawDate ?? record.date ?? "";
}

function HistoryList({
  lottery,
  numberOrder,
  onOpenHistory,
  collapsible = false,
}: {
  lottery: LotteryId;
  numberOrder: string;
  onOpenHistory: () => void;
  collapsible?: boolean;
}) {
  const history = useLotteryHistory(lottery, 10);
  const order = getHistoryOrder(numberOrder);
  const [expanded, setExpanded] = useState(!collapsible);
  const historyHeading = (
    <div className="history-panel-title">
      <SectionTitle>近10期開獎號碼</SectionTitle>
      <span className="history-panel-order">（{numberOrder}）</span>
    </div>
  );

  return (
    <section className="panel history-panel" data-lottery={lottery}>
      <header className="panel-heading">
        {collapsible ? (
          <button
            type="button"
            className="history-panel-toggle"
            aria-expanded={expanded}
            aria-controls="tongxing-history-table"
            onClick={() => setExpanded((current) => !current)}
          >
            {historyHeading}
            <ChevronDownIcon data-open={expanded} aria-hidden="true" />
          </button>
        ) : (
          historyHeading
        )}
        <button type="button" onClick={onOpenHistory}>查看更多紀錄 <ChevronRightIcon /></button>
      </header>
      <div
        id={collapsible ? "tongxing-history-table" : undefined}
        className="history-table"
        hidden={collapsible && !expanded}
      >
        <div className="history-row history-head">
          <span>期數</span><span>日期</span><span>開獎號碼</span>
        </div>
        {history.map((record, index) => {
          const draw = getHistoryDrawNumbers(lottery, record, order);
          const issue = record.period ?? record.issue ?? "";
          const date = record.drawDate ?? record.date ?? "";
          const previousDate = index > 0 ? getDrawDate(history[index - 1]) : undefined;

          return (
            <div className="history-row" data-week-boundary={isNearHistoryWeekBoundary(lottery, previousDate, date)} key={issue}>
              <span>{issue}</span>
              <span><HistoryDate value={date} /></span>
              <span className="history-numbers" data-has-special={Boolean(draw.special)}>
                <span className="history-main-numbers">
                  {draw.main.map((num, index) => (
                    <LotteryNumberBall className="history-lottery-ball" key={`${issue}-${num}-${index}`} lottery={lottery} number={num} />
                  ))}
                </span>
                {draw.special ? (
                  <span className="history-special-number">
                    <span aria-hidden="true">+</span>
                    <span className="history-special-ball">
                      <small className="history-special-label">特別號</small>
                      <LotteryNumberBall className="history-lottery-ball" lottery={lottery} number={draw.special} isSpecial />
                    </span>
                  </span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function DrawHistoryPage({
  onNavigate,
  backTarget = "home",
}: {
  onNavigate: Navigate;
  backTarget?: ScreenId;
}) {
  const [lottery, setLottery] = useTimedState<LotteryId>("history-lottery", "今彩539");
  const [filterOpen, setFilterOpen] = useState(false);
  const [issue, setIssue] = useTimedState("history-issue", "");
  const [year, setYear] = useTimedState("history-year", "2026");
  const [month, setMonth] = useTimedState("history-month", "07月");
  const [day, setDay] = useTimedState("history-day", "31日");
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

  useEffect(() => {
    if (!filterOpen) return;

    const mobilePage = document.querySelector<HTMLElement>(".mobile-page");
    if (!mobilePage) return;
    const previousOverflow = mobilePage.style.overflow;
    mobilePage.style.overflow = "hidden";

    return () => {
      mobilePage.style.overflow = previousOverflow;
    };
  }, [filterOpen]);

  const resetHistoryFilters = () => {
    setIssue("");
    setYear("2026");
    setMonth("07月");
    setDay("31日");
    setRange("1000期");
    setNumberOrder("依號碼由小到大排序");
    setAppliedFilters({ issue: "", date: "" });
  };

  const applyHistoryFilters = () => {
    setAppliedFilters({
      issue,
      date: `${year}/${month.replace("月", "")}/${day.replace("日", "")}`,
    });
    setAppliedHistorySettings({ lottery, range, numberOrder });
    setFilterOpen(false);
  };

  const historyTitleActions = (
    <div className="history-title-actions">
      <button type="button" className="history-filter-trigger" onClick={() => setFilterOpen(true)}>
        <svg className="history-filter-trigger-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 2h9L7 6v3.2L5 10V6L1.5 2Z" /></svg>
        篩選條件
      </button>
    </div>
  );

  return (
    <FeatureShell
      title="歷史開獎號碼"
      onNavigate={onNavigate}
      backTarget={backTarget}
      className="draw-history-screen"
      headerAction={historyTitleActions}
    >
      <div className="draw-history-week-list" data-lottery={appliedHistorySettings.lottery} aria-label={`${appliedHistorySettings.lottery}歷史開獎號碼`}>
        {historyWeekGroups.map((weekRecords) => {
          const firstIssue = weekRecords[0]?.period ?? weekRecords[0]?.issue ?? "";
          return (
            <section className="panel draw-history-panel" key={firstIssue}>
              <div className="draw-history-row draw-history-head">
                <span>期數</span>
                <span>日期</span>
                <span>開獎號碼</span>
              </div>
              {weekRecords.map((record) => {
                const draw = getHistoryDrawNumbers(appliedHistorySettings.lottery, record, historyOrder);
                const issue = record.period ?? record.issue ?? "";
                const date = record.drawDate ?? record.date ?? "";

                return (
                  <div className="draw-history-row" key={issue}>
                    <span className="draw-history-meta">{issue}</span>
                    <span className="draw-history-meta"><HistoryDate value={date} /></span>
                    <span className="history-numbers" data-has-special={Boolean(draw.special)}>
                      <span className="history-main-numbers">
                        {draw.main.map((num, index) => <LotteryNumberBall className="history-lottery-ball" key={`${issue}-${num}-${index}`} lottery={appliedHistorySettings.lottery} number={num} />)}
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
      {filterOpen && document.querySelector<HTMLElement>(".mobile-page")
        ? createPortal(
            <div className="filter-sheet-backdrop" role="presentation" onClick={() => setFilterOpen(false)}>
              <section
                className="filter-sheet history-filter-sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby="history-filter-title"
                onClick={(event) => event.stopPropagation()}
              >
                <header>
                  <h2 id="history-filter-title">篩選條件</h2>
                  <button type="button" onClick={() => setFilterOpen(false)} aria-label="關閉">
                    <Cross2Icon />
                  </button>
                </header>
                <div className="history-filter-fields">
                  <div className="history-filter-row">
                    <span className="history-filter-icon"><img src="/assets/lottery/functions/彩種.png" alt="彩種" /></span>
                    <div className="select-box native-select">
                      <select aria-label="彩種" value={lottery} onChange={(event) => setLottery(event.target.value as LotteryId)}>
                        {LOTTERIES.map((item) => <option value={item} key={item}>{item}</option>)}
                      </select>
                      <ChevronDownIcon />
                    </div>
                  </div>
                  <label>
                    <span className="history-filter-icon"><img src="/assets/history-filter/issue.png" alt="期數" /></span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={issue}
                      onChange={(event) => setIssue(event.target.value.replace(/\D/g, ""))}
                    />
                  </label>
                  <div className="history-filter-row">
                    <span className="history-filter-icon"><img src="/assets/history-filter/date.png" alt="日期" /></span>
                    <div className="history-date-selects">
                      <div className="select-box native-select">
                        <select aria-label="年份" value={year} onChange={(event) => setYear(event.target.value)}>
                          {["2026", "2025", "2024"].map((value) => <option key={value}>{value}</option>)}
                        </select>
                        <ChevronDownIcon />
                      </div>
                      <div className="select-box native-select">
                        <select aria-label="月份" value={month} onChange={(event) => setMonth(event.target.value)}>
                          {Array.from({ length: 12 }, (_, index) => `${String(index + 1).padStart(2, "0")}月`).map((value) => <option key={value}>{value}</option>)}
                        </select>
                        <ChevronDownIcon />
                      </div>
                      <div className="select-box native-select">
                        <select aria-label="日期" value={day} onChange={(event) => setDay(event.target.value)}>
                          {Array.from({ length: 31 }, (_, index) => `${String(index + 1).padStart(2, "0")}日`).map((value) => <option key={value}>{value}</option>)}
                        </select>
                        <ChevronDownIcon />
                      </div>
                    </div>
                  </div>
                  <div className="history-filter-row">
                    <span className="history-filter-icon"><img src="/assets/history-filter/order.png" alt="號碼順序" /></span>
                    <div className="select-box native-select history-order-select">
                      <select aria-label="號碼順序" value={numberOrder} onChange={(event) => setNumberOrder(event.target.value)}>
                        <option>依號碼由小到大排序</option>
                        <option>依實際開獎順序排序</option>
                      </select>
                      <ChevronDownIcon />
                    </div>
                  </div>
                  <fieldset aria-label="探索範圍">
                    <div className="history-range-options">
                      {["1000期", "3000期", "5000期", "所有期數"].map((value) => (
                        <button
                          type="button"
                          key={value}
                          data-selected={range === value}
                          onClick={() => setRange(value)}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                </div>
                <footer className="history-filter-actions">
                  <button type="button" onClick={resetHistoryFilters}>重設</button>
                  <button type="button" onClick={applyHistoryFilters}>開始探索</button>
                </footer>
              </section>
            </div>,
            document.querySelector<HTMLElement>(".mobile-page")!,
          )
        : null}
    </FeatureShell>
  );
}


function RoadValidationProcess({
  number,
  position,
  predictionPeriod,
  consecutive,
  prediction,
}: {
  number: string;
  position: number;
  predictionPeriod: number;
  consecutive: string;
  prediction: string;
}) {
  const sourceGroups = [ROAD_VALIDATION_SAMPLE_HISTORY.slice(0, 3), ROAD_VALIDATION_SAMPLE_HISTORY.slice(3, 6)];
  const validationGroups = Array.from({ length: 8 }, (_, index) => sourceGroups[index % sourceGroups.length]);
  return (
    <section className="road-validation-process" aria-label="驗證過程">
      <header className="validation-summary-card">
        <span>開 {number} 第 {position} 顆｜上 2 期｜第 3 顆｜+14.24｜下 {predictionPeriod} 期開</span>
        <em>{consecutive}</em>
      </header>
      {validationGroups.map((group, groupIndex) => (
        <div className="validation-period-block" key={groupIndex}>
          {group.map(([issue, , numbers], rowIndex) => {
            const lockRow = groupIndex % 2 === 0 ? 1 : 0;
            return (
              <div className="validation-period-row" key={issue}>
                <span className="validation-issue">{issue}</span>
                <span className="validation-full-numbers">{numbers.map((value) => <i key={value}>{value}</i>)}</span>
                <span className="validation-formula">
                  {rowIndex < 2 ? <><b>{number} +14.24</b>{rowIndex === lockRow ? <small>鎖定條件</small> : null}</> : <><b>預測期</b><strong>版路結果 {prediction.replace(".", "、")}</strong></>}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}

export function MatrixExplorePage({
  onNavigate,
  title = "Matrix 探索",
  roadTypes = ["加減版路", "合值版路", "拖牌版路"],
}: {
  onNavigate: Navigate;
  title?: "Matrix 探索" | "Matrix 天衍" | "Matrix 天工";
  roadTypes?: string[];
}) {
  type ConsecutiveOption =
    | "準4進5"
    | "準5進6"
    | "準6進7"
    | "準7進8"
    | "準9進10"
    | "準11進12"
    | "準13進14"
    | "準15進16"
    | "準17進18+";

  type ExploreResult = {
    id: number;
    position: number;
    number: string;
    predictionPeriod: number;
    consecutive: ConsecutiveOption;
    prediction: string;
    sameCode: boolean;
  };

  const filterOptions: Record<string, ConsecutiveOption[]> = {
    "準4+（鎖定1碼）": ["準4進5", "準5進6", "準6進7", "準7進8"],
    "準5+（鎖定2碼）": ["準5進6", "準6進7", "準7進8", "準9進10", "準11進12", "準13進14", "準15進16", "準17進18+"],
  };
  const defaultFilters: Record<string, ConsecutiveOption[]> = {
    "準4+（鎖定1碼）": ["準5進6", "準6進7", "準7進8"],
    "準5+（鎖定2碼）": ["準9進10", "準11進12", "準13進14", "準15進16", "準17進18+"],
  };
  const resultRows: ExploreResult[] = [
    { id: 1, position: 1, number: "10", predictionPeriod: 1, consecutive: "準11進12", prediction: "03.09", sameCode: true },
    { id: 2, position: 2, number: "25", predictionPeriod: 1, consecutive: "準9進10", prediction: "33.35", sameCode: true },
    { id: 3, position: 1, number: "10", predictionPeriod: 2, consecutive: "準7進8", prediction: "11.39", sameCode: true },
    { id: 4, position: 3, number: "32", predictionPeriod: 1, consecutive: "準7進8", prediction: "15.31", sameCode: false },
    { id: 5, position: 2, number: "09", predictionPeriod: 2, consecutive: "準6進7", prediction: "02.12", sameCode: true },
    { id: 6, position: 4, number: "36", predictionPeriod: 1, consecutive: "準6進7", prediction: "02.16", sameCode: false },
    { id: 7, position: 1, number: "08", predictionPeriod: 3, consecutive: "準5進6", prediction: "05.24", sameCode: true },
    { id: 8, position: 5, number: "03", predictionPeriod: 2, consecutive: "準5進6", prediction: "07.28", sameCode: false },
    { id: 9, position: 3, number: "18", predictionPeriod: 1, consecutive: "準4進5", prediction: "12.29", sameCode: true },
    { id: 10, position: 6, number: "29", predictionPeriod: 2, consecutive: "準4進5", prediction: "17.38", sameCode: false },
  ];
  const duplicateNumbers = ["38", "09", "08", "32", "03", "36", "18", "29", "12", "17", "21", "28", "05", "24", "30", "04", "27", "02"];
  const [lottery, setLottery] = useState<LotteryId>("今彩539");
  const [period, setPeriod] = useState("十三期");
  const [road, setRoad] = useState(roadTypes[0]);
  const [hit, setHit] = useState(title === "Matrix 天衍" ? "準5+（鎖定2碼）" : "準4+（鎖定1碼）");
  const [advanced, setAdvanced] = useState(false);
  const [numberOrder, setNumberOrder] = useState("依號碼由小到大排序");
  const [exploreDate, setExploreDate] = useState("本日（最新）");
  const [exploreRange, setExploreRange] = useState("標準範圍");
  const [searched, setSearched] = useState(false);
  const [expandedRoad, setExpandedRoad] = useState<number | null>(null);
  const [sameCode, setSameCode] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<ConsecutiveOption[]>(
    defaultFilters[title === "Matrix 天衍" ? "準5+（鎖定2碼）" : "準4+（鎖定1碼）"],
  );

  useEffect(() => {
    if (!filterOpen) return;

    const scrollContainer = document.querySelector<HTMLElement>(".mobile-scroll");
    if (!scrollContainer) return;

    const previousOverflowY = scrollContainer.style.overflowY;
    const previousScrollTop = scrollContainer.scrollTop;
    scrollContainer.style.overflowY = "hidden";

    return () => {
      scrollContainer.style.overflowY = previousOverflowY;
      scrollContainer.scrollTop = previousScrollTop;
    };
  }, [filterOpen]);

  const visibleResults = useMemo(() => {
    const consecutiveValue = (value: ConsecutiveOption) => Number(value.match(/\d+/)?.[0] ?? 0);
    return resultRows
      .filter((item) => selectedFilters.includes(item.consecutive))
      .filter((item) => !sameCode || item.sameCode)
      .sort((a, b) => (
        consecutiveValue(b.consecutive) - consecutiveValue(a.consecutive)
        || a.predictionPeriod - b.predictionPeriod
        || a.position - b.position
      ));
  }, [sameCode, selectedFilters]);

  const duplicateStats = useMemo(() => {
    const activeRatio = selectedFilters.length / Math.max(filterOptions[hit].length, 1);
    return duplicateNumbers
      .map((number, index) => ({
        number,
        count: Math.max(1, Math.round((80 - index * 1.45) * activeRatio) - (sameCode ? 0 : index % 3)),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 18);
  }, [hit, sameCode, selectedFilters]);

  const resultCount = selectedFilters.length === 0
    ? 0
    : visibleResults.length * 180;

  const changeHit = (value: string) => {
    setHit(value);
    setSelectedFilters(defaultFilters[value]);
    setExpandedRoad(null);
  };

  const toggleFilter = (value: ConsecutiveOption) => {
    setSelectedFilters((current) => (
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    ));
    setExpandedRoad(null);
  };

  return (
    <FeatureShell
      title={title}
      onNavigate={onNavigate}
      backTarget={title === "Matrix 探索" ? "home" : "explore"}
      className={`matrix-explore-screen ${title === "Matrix 探索" ? "matrix-explore-main-screen" : title === "Matrix 天衍" ? "matrix-tianyan-screen" : ""}`}
      headerAction={title === "Matrix 探索" ? <MatrixPageSwitcher current="explore" onNavigate={onNavigate} /> : undefined}
    >
      <section className="panel explore-settings">
        <SectionTitle>探索設定</SectionTitle>
        <div className="setting-grid">
          <label><span>{title === "Matrix 探索" ? <img className="setting-label-icon matrix-explore-setting-icon" src="/assets/matrix-explore/lottery.png" alt="" aria-hidden="true" /> : <SettingLabelIcon type="lottery" />}<b>彩種</b></span>
            <div className="select-box native-select">
              <select
                aria-label="彩種"
                value={lottery}
                onChange={(event) => setLottery(event.target.value as LotteryId)}
              >
                {LOTTERIES.map((item) => <option value={item} key={item}>{item}</option>)}
              </select>
              <ChevronDownIcon aria-hidden="true" />
            </div>
          </label>
          <label><span>{title === "Matrix 探索" ? <img className="setting-label-icon matrix-explore-setting-icon" src="/assets/matrix-explore/period.png" alt="" aria-hidden="true" /> : <SettingLabelIcon type="period" />}探索期數</span>
            <div className="segmented three">
              {["二期", "七期", "十三期"].map((v) => (
                <button type="button" key={v} data-selected={period === v} onClick={() => setPeriod(v)}>
                  {v}
                  {title === "Matrix 探索" && v === "十三期" ? <em><LockClosedIcon />Matrix Pro</em> : null}
                </button>
              ))}
            </div>
          </label>
          <label><span>{title === "Matrix 探索" ? <img className="setting-label-icon matrix-explore-setting-icon" src="/assets/matrix-explore/road.png" alt="" aria-hidden="true" /> : <SettingLabelIcon type="road" />}版路類型</span>
            <div className={`segmented ${roadTypes.length === 1 ? "one" : "three"}`}>
              {roadTypes.map((v) => (
                <button type="button" key={v} data-selected={road === v} onClick={() => setRoad(v)}>
                  {v}
                  {title === "Matrix 探索" && v === "拖牌版路" ? <em>推薦</em> : null}
                </button>
              ))}
            </div>
          </label>
        </div>
      </section>

      <section className="panel hit-advanced-panel">
        <SectionTitle>命中條件</SectionTitle>
        <div className="segmented two hit-options">
          {(title === "Matrix 天衍" ? ["準5+（鎖定2碼）"] : ["準4+（鎖定1碼）", "準5+（鎖定2碼）"]).map((v) => (
            <button type="button" key={v} data-selected={hit === v} onClick={() => changeHit(v)}>{v}</button>
          ))}
        </div>

        <button type="button" className="advanced-row" onClick={() => setAdvanced(!advanced)}>
          <img src={PRIMARY_BRAND_LOGO} alt="" aria-hidden="true" />
          <span>進階探索設定</span><ChevronRightIcon data-open={advanced} />
        </button>
        {advanced ? (
          <div className="advanced-panel">
            <label>
              <span className="advanced-setting-title">
                {title === "Matrix 探索" ? <img className="setting-label-icon matrix-explore-setting-icon" src="/assets/matrix-explore/order.png" alt="" aria-hidden="true" /> : <SettingLabelIcon type="order" />}號碼順序
              </span>
              <div className="select-box native-select">
                <select
                  aria-label="號碼順序"
                  value={numberOrder}
                  onChange={(event) => setNumberOrder(event.target.value)}
                >
                  <option value="依號碼由小到大排序">依號碼由小到大排序</option>
                  <option value="依實際開獎順序排序">依實際開獎順序排序</option>
                </select>
                <ChevronDownIcon aria-hidden="true" />
              </div>
            </label>
            <label>
              <span className="advanced-setting-title">
                {title === "Matrix 探索" ? <img className="setting-label-icon matrix-explore-setting-icon" src="/assets/matrix-explore/date.png" alt="" aria-hidden="true" /> : <SettingLabelIcon type="date" />}探索日期
              </span>
              <div className="segmented three">
                {["本日（最新）", "昨日（上1期）", "前日（上2期）"].map((value) => (
                  <button
                    type="button"
                    key={value}
                    data-selected={exploreDate === value}
                    onClick={() => setExploreDate(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </label>
            <label>
              <span className="advanced-setting-title">
                {title === "Matrix 探索" ? <img className="setting-label-icon matrix-explore-setting-icon" src="/assets/matrix-explore/range.png" alt="" aria-hidden="true" /> : <SettingLabelIcon type="range" />}探索範圍
              </span>
              <div className="segmented two">
                {["標準範圍", "完整範圍"].map((value) => (
                  <button
                    type="button"
                    key={value}
                    data-selected={exploreRange === value}
                    onClick={() => setExploreRange(value)}
                  >
                    {value}
                    {title === "Matrix 探索" && value === "完整範圍" ? <em><LockClosedIcon />Matrix Pro</em> : null}
                  </button>
                ))}
              </div>
            </label>
          </div>
        ) : null}
      </section>

      <button type="button" className="primary-action branded-explore-action" onClick={() => setSearched(true)}>
        <MagnifyingGlassIcon /><span>開始探索</span>
      </button>

      <HistoryList
        lottery={lottery}
        numberOrder={numberOrder}
        onOpenHistory={() => onNavigate("history")}
      />

      {searched ? (
        <>
          <section className="panel repeat-stats-panel">
            <header className="repeat-stats-heading">
              <SectionTitle>重複號碼統計</SectionTitle>
              <button
                type="button"
                aria-pressed={sameCode}
                data-selected={sameCode}
                onClick={() => setSameCode(!sameCode)}
              >
                同碼
              </button>
              <span>點選進行版路篩選</span>
            </header>
            <div className="result-summary">
              {duplicateStats.map(({ number, count }) => (
                <div key={number}><b>{number}</b><small>{count}次</small></div>
              ))}
            </div>
          </section>

          <p className="explore-result-disclaimer">
            探索結果依歷史資料與所選條件產生，僅供參考之用，不保證中獎或<span className="explore-disclaimer-nowrap">獲利</span>。
          </p>

          <section className="panel result-panel">
            <header className="result-title">
              <SectionTitle>探索結果區</SectionTitle>
              <button type="button" className="consecutive-filter-button" onClick={() => setFilterOpen(true)}>
                連準篩選
              </button>
              <strong className="result-count">
                <span>探索到&nbsp;</span><span className="numeric-text">{resultCount}</span><span>&nbsp;組符合條件版路</span>
              </strong>
            </header>
            <div className="road-results">
              <div className="road-results-head" aria-hidden="true">
                <span>位置</span>
                <span>號碼</span>
                <span>預測期</span>
                <span>連準次數</span>
                <span>預測</span>
                <span>版路類型</span>
              </div>
              {visibleResults.map((item) => (
                <article key={item.id}>
                  <div className="road-result-row">
                    <span className="tag"><span>順球</span><span className="numeric-text">{item.position}</span></span>
                    <span className="result-number numeric-text">{item.number}</span>
                    <span className="result-period"><span>下</span><span className="numeric-text">{item.predictionPeriod}</span><span>期</span></span>
                    <span className="result-consecutive">
                      <span>準</span><span className="numeric-text">{item.consecutive.match(/\d+/g)?.[0]}</span><span>進</span><span className="numeric-text">{item.consecutive.match(/\d+/g)?.[1]}</span>
                    </span>
                    <strong className="numeric-text">{item.prediction}</strong>
                    <button
                      type="button"
                      className="road-type-toggle"
                      aria-expanded={expandedRoad === item.id}
                      onClick={() => setExpandedRoad(expandedRoad === item.id ? null : item.id)}
                    >
                      <span>{road}</span>
                      <ChevronDownIcon data-open={expandedRoad === item.id} />
                    </button>
                  </div>
                  {expandedRoad === item.id ? (
                    <RoadValidationProcess number={item.number} position={item.position} predictionPeriod={item.predictionPeriod} consecutive={item.consecutive} prediction={item.prediction} />
                  ) : null}
                </article>
              ))}
              {visibleResults.length === 0 ? <p className="empty-result">無符合設定條件</p> : null}
            </div>
          </section>
          {filterOpen && document.querySelector<HTMLElement>(".mobile-page")
            ? createPortal(
                <div className="filter-sheet-backdrop" role="presentation" onClick={() => setFilterOpen(false)}>
                  <section
                    className="filter-sheet"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="consecutive-filter-title"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <header>
                      <h2 id="consecutive-filter-title">連準篩選</h2>
                      <button type="button" onClick={() => setFilterOpen(false)} aria-label="關閉">
                        <Cross2Icon />
                      </button>
                    </header>
                    <div className="filter-options">
                      {filterOptions[hit].map((option) => (
                        <label key={option}>
                          <input
                            type="checkbox"
                            checked={selectedFilters.includes(option)}
                            onChange={() => toggleFilter(option)}
                          />
                          <span aria-hidden="true" />
                          <strong>{option}</strong>
                        </label>
                      ))}
                    </div>
                  </section>
                </div>,
                document.querySelector<HTMLElement>(".mobile-page")!,
              )
            : null}
        </>
      ) : null}
    </FeatureShell>
  );
}


function MatrixTiangongPage({ onNavigate }: { onNavigate: Navigate }) {
  const [lottery, setLottery] = useState<LotteryId>("今彩539");
  const [period, setPeriod] = useState("五十期");
  const [mode, setMode] = useState("一段式");
  const [hit, setHit] = useState("準2進3");
  const [searchPositions, setSearchPositions] = useState(["固定"]);
  const [firstPositions, setFirstPositions] = useState(["固定"]);
  const [firstRoads, setFirstRoads] = useState(["加減版路"]);
  const [secondPositions, setSecondPositions] = useState(["固定"]);
  const [secondRoads, setSecondRoads] = useState(["加減版路"]);
  const [searched, setSearched] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const toggle = (value: string, current: string[], setter: React.Dispatch<React.SetStateAction<string[]>>) => setter(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  const positionOptions = ["固定", "依序遞增", "依序遞減"];
  const roadOptions = ["加減版路", "合值版路"];
  return (
    <FeatureShell title="Matrix 天工" onNavigate={onNavigate} backTarget="explore" className="matrix-explore-screen matrix-tiangong-screen">
      <section className="panel explore-settings tiangong-settings">
        <SectionTitle>探索設定</SectionTitle>
        <div className="setting-grid">
          <label><span><SettingLabelIcon type="lottery" /><b>彩種</b></span><div className="select-box native-select"><select value={lottery} onChange={(event) => setLottery(event.target.value as LotteryId)}>{LOTTERIES.map((item) => <option key={item}>{item}</option>)}</select><ChevronDownIcon /></div></label>
          <label><span><SettingLabelIcon type="period" />探索期數</span><div className="segmented two">{["五十期", "八十期"].map((value) => <button type="button" data-selected={period === value} onClick={() => setPeriod(value)} key={value}>{value}</button>)}</div></label>
          <label><span><SettingLabelIcon type="road" />探索模式</span><div className="segmented two">{["一段式", "二段式"].map((value) => <button type="button" data-selected={mode === value} onClick={() => setMode(value)} key={value}>{value}</button>)}</div></label>
          <label><span>命中條件</span><div className="segmented two">{["準2進3", "準3進4"].map((value) => <button type="button" data-selected={hit === value} onClick={() => setHit(value)} key={value}>{value}</button>)}</div></label>
          <fieldset><legend>探索球位</legend><div className="segmented three">{positionOptions.map((value) => <button type="button" data-selected={searchPositions.includes(value)} onClick={() => toggle(value, searchPositions, setSearchPositions)} key={value}>{value}</button>)}</div></fieldset>
          <fieldset><legend>第一段球位</legend><div className="segmented three">{positionOptions.map((value) => <button type="button" data-selected={firstPositions.includes(value)} onClick={() => toggle(value, firstPositions, setFirstPositions)} key={value}>{value}</button>)}</div></fieldset>
          <fieldset><legend>第一段版路類型</legend><div className="segmented two">{roadOptions.map((value) => <button type="button" data-selected={firstRoads.includes(value)} onClick={() => toggle(value, firstRoads, setFirstRoads)} key={value}>{value}</button>)}</div></fieldset>
          {mode === "二段式" ? <><fieldset><legend>第二段球位</legend><div className="segmented three">{positionOptions.map((value) => <button type="button" data-selected={secondPositions.includes(value)} onClick={() => toggle(value, secondPositions, setSecondPositions)} key={value}>{value}</button>)}</div></fieldset><fieldset><legend>第二段版路類型</legend><div className="segmented two">{roadOptions.map((value) => <button type="button" data-selected={secondRoads.includes(value)} onClick={() => toggle(value, secondRoads, setSecondRoads)} key={value}>{value}</button>)}</div></fieldset></> : null}
        </div>
      </section>
      <button type="button" className="primary-action branded-explore-action" onClick={() => setSearched(true)}><MagnifyingGlassIcon /><span>開始探索</span></button>
      {searched ? <section className="panel result-panel"><header className="result-title"><SectionTitle>探索結果區</SectionTitle></header><div className="road-results"><article><div className="road-result-row"><span className="tag"><span>順球</span><span className="numeric-text">4</span></span><span className="result-number numeric-text">25</span><span className="result-period"><span>下</span><span className="numeric-text">2</span><span>期</span></span><span className="result-consecutive">準3進4</span><strong className="numeric-text">08.37</strong><button type="button" className="road-type-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><span>版路類型</span><ChevronDownIcon data-open={expanded} /></button></div>{expanded ? <RoadValidationProcess number="25" position={4} predictionPeriod={2} consecutive="準3進4" prediction="08.37" /> : null}</article></div></section> : null}
    </FeatureShell>
  );
}

export function TongXingPage({ onNavigate }: { onNavigate: Navigate }) {
  const [lottery, setLottery] = useTimedState<LotteryId>("tongxing-lottery", "今彩539");
  const [order, setOrder] = useTimedState("tongxing-order", "依號碼由小到大排序");
  const [period, setPeriod] = useTimedState("tongxing-period", "1期");
  const [searched, setSearched] = useTimedState("tongxing-searched", false);
  const [values, setValues] = useTimedState("tongxing-values", ["", "", ""]);
  const [appliedValues, setAppliedValues] = useState<string[]>([]);
  const [appliedLottery, setAppliedLottery] = useState<LotteryId>(lottery);
  const [appliedOrder, setAppliedOrder] = useState(order);
  const [resultGroups, setResultGroups] = useState<TongXingPair[]>([]);
  const resultsEndRef = useRef<HTMLDivElement>(null);
  const periodOffset = Number(period.replace(/\D/g, "")) || 1;
  const historyOrder = getHistoryOrder(appliedOrder);
  const resultColumns = appliedLottery === "六合彩" || appliedLottery === "大樂透"
    ? ["一", "二", "三", "四", "五", "六", "特"]
    : ["一", "二", "三", "四", "五"];

  const updateInputValue = (index: number, rawValue: string) => {
    const nextValue = sanitizeReferenceNumber(rawValue);
    setValues(values.map((value, valueIndex) => valueIndex === index ? nextValue : value));
  };

  const validateInputValue = (index: number) => {
    const value = values[index];
    if (value === "") return;
    const formatted = formatReferenceNumber(value);
    setValues(values.map((currentValue, valueIndex) => valueIndex === index ? formatted : currentValue));
  };

  const handleSearch = async () => {
    const hasInvalidValue = values.some((value) => value !== "" && !/^(0[1-9]|[1-4][0-9])$/.test(value));
    if (hasInvalidValue) {
      setValues(values.map((value) => /^(0[1-9]|[1-4][0-9])$/.test(value) ? value : ""));
      return;
    }
    const normalizedValues = values.map(normalizeLookupNumber).filter(Boolean);
    setAppliedValues(normalizedValues);
    setAppliedLottery(lottery);
    setAppliedOrder(order);
    setResultGroups([]);
    try {
      const response = await fetchTongXing({
        lottery,
        numberOrder: order as MatrixNumberOrder,
        numbers: normalizedValues,
        futureOffset: periodOffset,
      });
      setResultGroups(response.groups);
    } catch {
      setResultGroups([]);
    }
    setSearched(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resultsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    });
  };

  const renderResultRow = (
    entry: LotteryDrawRecord,
    type: "locked" | "predicted",
  ) => {
    const issue = getDrawIssue(entry);
    const date = getDrawDate(entry);
    const draw = getHistoryDrawNumbers(appliedLottery, entry, historyOrder);
    const displayedNumbers = draw.special ? [...draw.main, draw.special] : [...draw.main];
    const inputNumbers = new Set(appliedValues);

    return (
      <div className="tongxing-table-row" data-row-type={type}>
        <span
          className="tongxing-period-cell"
          aria-label={`${type === "locked" ? "鎖定條件期" : "預測期"} ${issue} ${date.slice(0, 10)}`}
        >
          <strong>{issue}</strong>
          <time>{date.slice(0, 10)}</time>
        </span>
        {displayedNumbers.map((number, index) => (
          <span
            key={`${issue}-${index}`}
            className={type === "locked" && inputNumbers.has(number) ? "locked-input-number" : undefined}
          >
            {number}
          </span>
        ))}
      </div>
    );
  };

  return (
    <FeatureShell title="Matrix 同星" onNavigate={onNavigate} className="tongxing-screen">
      <section className="panel tongxing-query">
        <div className="query-selects">
          <div className="select-box native-select">
            <select
              aria-label="彩種"
              value={lottery}
              onChange={(event) => setLottery(event.target.value as LotteryId)}
            >
              {LOTTERIES.map((item) => <option value={item} key={item}>{item}</option>)}
            </select>
            <ChevronDownIcon aria-hidden="true" />
          </div>
          <div className="select-box native-select tongxing-order-select">
            <select
              aria-label="號碼順序"
              value={order}
              onChange={(event) => setOrder(event.target.value)}
            >
              <option value="依號碼由小到大排序">依號碼由小到大排序</option>
              <option value="依實際開獎順序排序">依實際開獎順序排序</option>
            </select>
            <ChevronDownIcon aria-hidden="true" />
          </div>
        </div>
        <LotteryTabs selected={lottery} onChange={setLottery} />
        <div className="same-star-fields">
          {values.map((value, index) => (
            <input
              key={index}
              aria-label={`號碼 ${index + 1}`}
              value={value}
              inputMode="numeric"
              pattern="(0[1-9]|[1-4][0-9])"
              maxLength={2}
              onChange={(event) => updateInputValue(index, event.target.value)}
              onBlur={() => validateInputValue(index)}
            />
          ))}
          <span>之後下</span>
          <div className="select-box native-select same-star-period-select">
            <select
              aria-label="之後期數"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
            >
              {Array.from({ length: 30 }, (_, index) => `${index + 1}期`).map((item) => (
                <option value={item} key={item}>{item}</option>
              ))}
            </select>
            <ChevronDownIcon aria-hidden="true" />
          </div>
          <span>開出</span>
        </div>
        <button type="button" className="primary-action branded-explore-action" onClick={handleSearch}>
          <MagnifyingGlassIcon /><span>開始探索</span>
        </button>
      </section>
      <HistoryList
        lottery={lottery}
        numberOrder={order}
        onOpenHistory={() => onNavigate("history")}
        collapsible
      />
      {searched ? (
        <>
          <div className="ornament-title"><span />探索結果<span /></div>
          <section className="panel tongxing-results">
            <div
              className="tongxing-table"
              data-columns={resultColumns.length}
              aria-label={`${appliedLottery}同星探索結果`}
            >
              <div className="tongxing-table-row tongxing-table-head">
                <span>期數</span>
                {resultColumns.map((column) => <span key={column}>{column}</span>)}
              </div>
              {resultGroups.map(({ lockedEntry, predictedEntry }) => (
                <article className="tongxing-result-group" key={getDrawIssue(lockedEntry)}>
                  {renderResultRow(lockedEntry, "locked")}
                  {renderResultRow(predictedEntry, "predicted")}
                </article>
              ))}
            </div>
          </section>
          <div ref={resultsEndRef} className="tongxing-results-end" aria-hidden="true" />
        </>
      ) : null}
    </FeatureShell>
  );
}

export function NumberReferencePage({ onNavigate }: { onNavigate: Navigate }) {
  const [lottery, setLottery] = useTimedState<LotteryId>("reference-lottery", "今彩539");
  const [range, setRange] = useTimedState("reference-range", "1000期");
  const [order, setOrder] = useTimedState("reference-order", "依號碼由小到大排序");
  const [inputs, setInputs] = useTimedState("reference-inputs", ["", "", ""]);
  const [appliedLottery, setAppliedLottery] = useState<LotteryId>(lottery);
  const [appliedRange, setAppliedRange] = useState(range);
  const [appliedOrder, setAppliedOrder] = useState(order);
  const [markedRows, setMarkedRows] = useState<Set<string>>(new Set());
  const [markedCells, setMarkedCells] = useState<Set<string>>(new Set());
  const [queryExpanded, setQueryExpanded] = useState(true);
  const [queryFloating, setQueryFloating] = useState(false);
  const [queryPanelTop, setQueryPanelTop] = useState(0);
  const resultsEndRef = useRef<HTMLDivElement>(null);
  const [referenceItems, setReferenceItems] = useState<NumberReferenceItem[] | null>(null);
  const history = useLotteryHistory(appliedLottery, getHistoryLimit(appliedRange));
  const fallbackHistory = useMemo(() => [...history].reverse(), [history]);
  const displayedHistory = referenceItems ?? fallbackHistory;
  const historyOrder = getHistoryOrder(appliedOrder);
  const resetReference = () => {
    setInputs(["", "", ""]);
    setReferenceItems(null);
    setMarkedRows(new Set());
    setMarkedCells(new Set());
  };

  const toggleMarkedRow = (issue: string) => {
    setMarkedRows((current) => {
      const next = new Set(current);
      if (next.has(issue)) {
        next.delete(issue);
      } else {
        next.add(issue);
        setMarkedCells((cells) => new Set(
          [...cells].filter((key) => !key.startsWith(`${issue}-`)),
        ));
      }
      return next;
    });
  };

  const toggleMarkedCell = (issue: string, number: string) => {
    const key = `${issue}-${number}`;
    setMarkedCells((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const startReferenceSearch = async () => {
    const normalized = inputs.map(normalizeLookupNumber);
    const unique = normalized.filter((value, index) => value && normalized.indexOf(value) === index);
    const historyRange = Number(range.replace(/\D/g, "")) as 1000 | 3000 | 5000;
    setInputs(normalized);
    setAppliedLottery(lottery);
    setAppliedRange(range);
    setAppliedOrder(order);
    try {
      const response = await fetchNumberReference({
        lottery,
        numberOrder: order as MatrixNumberOrder,
        historyRange,
        numbers: unique,
      });
      setReferenceItems(response.items);
    } catch {
      setReferenceItems([]);
    }
    setQueryExpanded(false);
    setQueryFloating(false);
    requestAnimationFrame(() => {
      resultsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  };

  const toggleQueryPanel = () => {
    if (queryExpanded) {
      setQueryExpanded(false);
      setQueryFloating(false);
      return;
    }
    const header = document.querySelector<HTMLElement>(".number-reference-screen > .feature-brand-header");
    const mobilePage = document.querySelector<HTMLElement>(".mobile-page");
    const pageRect = mobilePage?.getBoundingClientRect();
    const pageTop = pageRect?.top ?? 0;
    const pageScale = pageRect && mobilePage?.offsetWidth ? pageRect.width / mobilePage.offsetWidth : 1;
    setQueryPanelTop(((header?.getBoundingClientRect().bottom ?? pageTop) - pageTop) / pageScale + 8);
    setQueryExpanded(true);
    setQueryFloating(true);
  };

  return (
    <FeatureShell
      title="號碼對照單"
      onNavigate={onNavigate}
      className="number-reference-screen"
      headerAction={(
        <div className="reference-title-actions">
          <button type="button" onClick={resetReference}><ReloadIcon />刷新</button>
          <button type="button" aria-label={queryExpanded ? "收合探索設定" : "展開探索設定"} aria-expanded={queryExpanded} onClick={toggleQueryPanel}>
            <span>探索設定</span>
            <ChevronDownIcon data-open={queryExpanded} />
          </button>
        </div>
      )}
    >
      <MobilePagePortal active={queryFloating}>
        <div
          className="reference-query-panel"
          data-floating={queryFloating}
          role={queryFloating ? "dialog" : undefined}
          aria-label={queryFloating ? "探索設定" : undefined}
          hidden={!queryExpanded}
          style={queryFloating ? {
            top: `${queryPanelTop}px`,
            "--select-tech-surface": "#030b13",
            "--select-tech-accent": "#f0bd36",
            "--select-tech-text": "#d4d0c8",
            "--select-tech-cut": "8px",
          } as React.CSSProperties : undefined}
        >
        <div className="query-selects three-cols">
        <div className="select-box native-select reference-select">
          <select
            aria-label="彩種"
            value={lottery}
            onChange={(event) => setLottery(event.target.value as LotteryId)}
          >
            {LOTTERIES.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
          <ChevronDownIcon aria-hidden="true" />
        </div>
        <div className="select-box native-select reference-select">
          <select
            aria-label="歷史範圍"
            value={range}
            onChange={(event) => setRange(event.target.value)}
          >
            {["1000期", "3000期", "5000期"].map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
          <ChevronDownIcon aria-hidden="true" />
        </div>
        <div className="select-box native-select reference-select reference-order-select">
          <select
            aria-label="號碼順序"
            value={order}
            onChange={(event) => setOrder(event.target.value)}
          >
            <option value="依號碼由小到大排序">依號碼由小到大排序</option>
            <option value="依實際開獎順序排序">依實際開獎順序排序</option>
          </select>
          <ChevronDownIcon aria-hidden="true" />
        </div>
        </div>
        <section className="reference-search" aria-label="探索號碼">
          <div>
            {inputs.map((v, i) => (
              <input key={i} value={v} aria-label={`探索號碼 ${i + 1}`} inputMode="numeric" maxLength={2} data-filled={Boolean(v)}
                onClick={(event) => event.currentTarget.select()}
                onChange={(event) => {
                  const candidate = sanitizeReferenceNumber(event.target.value);
                  if (candidate.length === 2 && isDuplicateLookupNumber(inputs.map(formatReferenceNumber), i, candidate)) return;
                  setInputs(inputs.map((x, index) => index === i ? candidate : x));
                }}
                onBlur={() => {
                  const formatted = formatReferenceNumber(inputs[i]);
                  const nextValue = isDuplicateLookupNumber(inputs.map(formatReferenceNumber), i, formatted) ? "" : formatted;
                  setInputs(inputs.map((x, index) => index === i ? nextValue : x));
                }}
              />
            ))}
            <button type="button" className="gold-button branded-explore-action" onClick={startReferenceSearch}><MagnifyingGlassIcon />開始探索</button>
          </div>
        </section>
        </div>
      </MobilePagePortal>
      <section className="panel reference-table-panel">
        <header><h2>{appliedLottery}（{appliedOrder}）</h2></header>
        <div className="reference-table">
          <div className="reference-row head"><span>期數</span><span>開獎號碼</span></div>
          {displayedHistory.map((record) => {
            const issue = getDrawIssue(record);
            const draw = getHistoryDrawNumbers(appliedLottery, record, historyOrder);
            const displayedNumbers = draw.special
              ? [...draw.main, draw.special]
              : [...draw.main];

            return (
              <div
                className="reference-row"
                data-row-marked={markedRows.has(issue)}
                data-has-special={Boolean(draw.special)}
                key={issue}
              >
                <button
                  type="button"
                  className="reference-issue"
                  aria-pressed={markedRows.has(issue)}
                  onClick={() => toggleMarkedRow(issue)}
                >
                  {issue}
                </button>
                <span>
                  {displayedNumbers.map((num, index) => {
                    const autoMatch = Array.isArray(record.matchSlots) ? Number(record.matchSlots[index] ?? 0) : 0;
                    const manuallyMarked = markedCells.has(`${issue}-${num}`);
                    const isSpecial = Boolean(draw.special) && index === displayedNumbers.length - 1;
                    return (
                      <button
                        type="button"
                        data-auto-match={autoMatch}
                        data-cell-marked={manuallyMarked}
                        data-special={isSpecial}
                        aria-pressed={manuallyMarked}
                        aria-label={`${isSpecial ? "特別號" : "號碼"} ${num}`}
                        key={`${num}-${index}`}
                        onClick={() => toggleMarkedCell(issue, num)}
                      >
                        {num}
                      </button>
                    );
                  })}
                </span>
              </div>
            );
          })}
        </div>
      </section>
      <div ref={resultsEndRef} className="reference-results-end" aria-hidden="true" />
    </FeatureShell>
  );
}

const COMBINATION_RESULTS = [
  ["二星", 2], ["三星", 3], ["四星", 4], ["五星", 5],
] as const;

export function CalculatorPage({ onNavigate }: { onNavigate: Navigate }) {
  const [mode, setMode] = useTimedState<"連碰" | "立柱">("calculator-mode", "連碰");
  const [collisionMode, setCollisionMode] = useTimedState<"總數" | "選號">("calculator-collision-mode", "總數");
  const [totalCount, setTotalCount] = useTimedState("calculator-total", 0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [columns, setColumns] = useTimedState("calculator-columns", [3, 2, 4, 3, 2, 0, 0, 0, 0, 0, 0, 0]);
  const [bulkColumnSetting, setBulkColumnSetting] = useState<{ value: number | null; phase: 0 | 1 | 2 }>({ value: null, phase: 0 });
  const toggleNumber = (number: number) => {
    const next = new Set(selected);
    if (next.has(number)) next.delete(number); else next.add(number);
    setSelected(next);
  };
  const clearColumns = () => {
    setColumns(Array(12).fill(0));
    setBulkColumnSetting({ value: null, phase: 0 });
  };
  const cycleBulkColumnSetting = (value: number) => {
    if (bulkColumnSetting.value !== value || bulkColumnSetting.phase === 0) {
      setColumns(Array.from({ length: 12 }, (_, index) => index < 6 ? value : 0));
      setBulkColumnSetting({ value, phase: 1 });
      return;
    }
    if (bulkColumnSetting.phase === 1) {
      setColumns(Array(12).fill(value));
      setBulkColumnSetting({ value, phase: 2 });
      return;
    }
    clearColumns();
  };
  const columnDisplayOrder = [0, 6, 1, 7, 2, 8, 3, 9, 4, 10, 5, 11];
  const switchCollisionMode = () => {
    setCollisionMode((current) => current === "總數" ? "選號" : "總數");
    setSelected(new Set());
    setTotalCount(0);
  };
  const clearCollision = () => {
    setSelected(new Set());
    setTotalCount(0);
  };
  const collisionCount = collisionMode === "總數" ? totalCount : selected.size;
  const choose = (n: number, r: number) => {
    if (n < r || r < 0) return 0;
    let value = 1;
    for (let i = 1; i <= r; i += 1) value = (value * (n - r + i)) / i;
    return Math.round(value);
  };
  const columnCombination = (degree: number) => {
    const sums = Array(degree + 1).fill(0) as number[];
    sums[0] = 1;
    columns.filter((value) => value > 0).forEach((value) => {
      for (let index = degree; index >= 1; index -= 1) {
        sums[index] += sums[index - 1] * value;
      }
    });
    return sums[degree] ?? 0;
  };
  return (
    <FeatureShell title={mode === "連碰" ? "連碰計算機" : "立柱計算機"} onNavigate={onNavigate} className="calculator-screen">
      <div className="mode-tabs"><button type="button" data-selected={mode === "連碰"} onClick={() => setMode("連碰")}>連碰計算機</button><button type="button" data-selected={mode === "立柱"} onClick={() => setMode("立柱")}>立柱計算機</button></div>
      {mode === "連碰" ? (
        <section className="panel calculator-panel">
          <header>
            <div className="calculator-heading"><SectionTitle>連碰設定</SectionTitle><span>{collisionMode === "總數" ? "計算總數" : "已選號碼"}：<strong>{collisionCount}</strong> 個</span></div>
            <div className="calculator-actions"><button type="button" className="mode-select-button" onClick={switchCollisionMode}>{collisionMode === "總數" ? "選號" : "總數"}</button><button type="button" onClick={clearCollision}><TrashIcon />清除</button></div>
          </header>
          <div className="number-grid">
            {Array.from({ length: 49 }, (_, i) => i + 1).map((number) => (
              <button
                type="button"
                data-selected={collisionMode === "總數" ? totalCount === number : selected.has(number)}
                onClick={() => collisionMode === "總數" ? setTotalCount(number) : toggleNumber(number)}
                key={number}
              >
                {String(number).padStart(2, "0")}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="panel calculator-panel column-panel">
          <header><div className="calculator-heading"><SectionTitle>立柱設定</SectionTitle><span>啟動柱數：<strong>{columns.filter(Boolean).length}</strong> 柱</span></div></header>
          <div className="quick-actions"><button type="button" onClick={() => cycleBulkColumnSetting(2)}>全部設為 2</button><button type="button" onClick={() => cycleBulkColumnSetting(3)}>全部設為 3</button><button type="button" onClick={() => cycleBulkColumnSetting(5)}>全部設為 5</button><button type="button" className="clear-button" onClick={clearColumns}><TrashIcon />清除</button></div>
          <div className="column-grid">
            {columnDisplayOrder.map((index) => (
              <div key={index}><span>第 {index + 1} 柱</span><button type="button" onClick={() => setColumns(columns.map((v, i) => i === index ? Math.max(0, v - 1) : v))}>−</button><strong>{columns[index]}</strong><button type="button" onClick={() => setColumns(columns.map((v, i) => i === index ? Math.min(48, v + 1) : v))}>＋</button></div>
            ))}
          </div>
        </section>
      )}
      <section className="panel calculation-results">
        <SectionTitle>計算結果</SectionTitle>
        <div>{COMBINATION_RESULTS.map(([label, degree]) => <article key={label}><span>{label}</span><strong>{mode === "連碰" ? choose(collisionCount, degree) : columnCombination(degree)}</strong></article>)}</div>
      </section>
    </FeatureShell>
  );
}

export function MatrixCardPage({ onNavigate }: { onNavigate: Navigate }) {
  const [lottery, setLottery] = useState<LotteryId>("今彩539");
  return (
    <FeatureShell title="Matrix 牌單" onNavigate={onNavigate}>
      <LotteryTabs selected={lottery} onChange={setLottery} />
      <section className="matrix-ticket">
        <img src={PRIMARY_BRAND_LOGO} alt="樂彩 Matrix" />
        <span>{lottery}</span>
        <h2>最新一期牌單</h2>
      </section>
      <button type="button" className="primary-action"><DownloadIcon />下載 PNG</button>
    </FeatureShell>
  );
}

export function MatrixCorePage({ onNavigate }: { onNavigate: Navigate }) {
  const entries: Array<{ title: string; roadType: string; screen: ScreenId }> = [
    { title: "Matrix 探索", roadType: "加減版路｜合值版路｜拖牌版路", screen: "explore" },
    { title: "Matrix 天衍", roadType: "複合版路", screen: "tianyan" },
    { title: "Matrix 天工", roadType: "自訂版路", screen: "tiangong" },
  ];

  return (
    <FeatureShell title="Matrix Core" onNavigate={onNavigate} className="matrix-core-screen">
      <section className="matrix-core-entry-list" aria-label="Matrix Core 核心入口">
        {entries.map((entry) => (
          <button type="button" className="panel matrix-core-entry" key={entry.title} onClick={() => onNavigate(entry.screen)}>
            <img src={PRIMARY_BRAND_LOGO} alt="" aria-hidden="true" />
            <span>
              <strong>{entry.title}</strong>
              <small>版路類型：{entry.roadType}</small>
            </span>
            <ChevronRightIcon aria-hidden="true" />
          </button>
        ))}
      </section>
    </FeatureShell>
  );
}

export function MatrixGuidePage({ onNavigate }: { onNavigate: Navigate }) {
  type GuideSection = { title: string; summary: string; blocks: Array<{ title: string; items: string[] }> };
  const sections: GuideSection[] = [
    {
      title: "新手入門",
      summary: "樂彩 Matrix 提供公開的開獎資料查詢、整理、比對、驗證及探索功能，支援今彩539、天天樂、六合彩及大樂透。",
      blocks: [
        { title: "開始使用", items: ["使用 LINE 登入之後進入首頁。", "切換彩種，查看最新開獎資訊、下次開獎時間與 Matrix 狀態。", "依需求使用 Matrix 探索、Matrix 同星、號碼對照單、連碰立柱計算機、Matrix 牌單及 Matrix 指南。"] },
        { title: "基本導覽", items: ["首頁：查看四彩種最新的資訊與主要功能入口。", "Matrix 狀態：查看四彩種目前觸發的狀態與相關資訊。", "快捷：開啟已設定的功能；長按三秒可變更快捷設定。", "通知：設定各類型的推播通知。", "我的：查看 Matrix Pro 訂閱、推薦、系統及法律資訊。"] },
        { title: "Matrix Pro", items: ["Matrix Pro 提供更多探索功能及會員權限。", "功能開放內容依目前會員狀態顯示。"] },
        { title: "結果說明", items: ["探索結果依歷史資料與所選條件產生，僅供參考，不代表中獎、獲利或任何結果之保證。"] },
      ],
    },
    {
      title: "Matrix 首頁",
      summary: "集中顯示目前彩種的最新開獎資訊、下次開獎時間、剩餘時間、Matrix 狀態及主要功能入口。",
      blocks: [
        { title: "四彩種切換", items: ["固定顯示今彩539、天天樂、六合彩及大樂透。", "切換後，最新開獎資訊卡顯示該彩種的期數、日期與開獎號碼。"] },
        { title: "Matrix 狀態", items: ["四個彩種固定顯示。", "狀態卡依資料呈現啟動、聚合、共振或臨界；同一彩種同時符合多種狀態時，只顯示最高等級狀態。", "點擊狀態卡可進入該彩種的 Matrix 狀態頁。"] },
        { title: "功能入口", items: ["Matrix Core 為 Matrix 探索、Matrix 天衍及 Matrix 天工的核心入口。"] },
      ],
    },
    {
      title: "Matrix 探索",
      summary: "依彩種、探索期數、版路類型、命中條件與進階設定，篩選符合條件的版路結果。",
      blocks: [
        { title: "探索設定", items: ["彩種：今彩539、天天樂、六合彩、大樂透。", "探索期數：二期、七期、十三期 (Matrix Pro)。", "版路類型：加減版路、合值版路、拖牌版路。", "命中條件：準4+ (鎖定1碼)或準5+ (鎖定2碼) 單選。"] },
        { title: "進階探索設定", items: ["號碼順序：依號碼由小到大排序或依實際開獎順序排序。", "探索日期：本日、昨日、前日。", "探索範圍：標準範圍或完整範圍；完整範圍為 Matrix Pro 功能。"] },
        { title: "查看結果", items: ["按下「開始探索」後，查看重複號碼統計與探索結果。", "結果顯示位置、號碼、預測期、連準次數、預測及版路類型。", "可使用同碼與連準篩選，並展開每條版路查看驗證過程。"] },
      ],
    },
    {
      title: "Matrix 狀態",
      summary: "顯示符合條件的版路結果，依規則分為啟動、聚合、共振及臨界。",
      blocks: [
        { title: "狀態層級", items: ["啟動 ACTIVE。", "聚合 FOCUS。", "共振 RESONANCE。", "臨界 CRITICAL。"] },
        { title: "查看方式", items: ["切換彩種查看各自狀態。", "點擊狀態下拉可展開符合觸發條件的版路。", "每條版路顯示位置、號碼、預測期、連準次數及版路類型。", "符合一組以上觸發條件時，各組內容以間隔區分。"] },
      ],
    },
    {
      title: "Matrix 同星",
      summary: "輸入指定號碼後，查詢指定期數的開獎結果。",
      blocks: [
        { title: "設定條件", items: ["選擇彩種及號碼順序。", "輸入1至3個號碼，號碼不可重複。", "「之後下」可選擇1至30期，再按「開始探索」。"] },
        { title: "結果內容", items: ["同頁顯示近10期開獎號碼。", "結果左側顯示期數與日期，右側顯示開獎號碼。", "今彩539與天天樂顯示5個號碼；六合彩與大樂透顯示6個號碼及特別號。"] },
      ],
    },
    {
      title: "號碼對照單",
      summary: "瀏覽完整歷史開獎紀錄，並以探索號碼與手動標記比對歷史資料。",
      blocks: [
        { title: "查詢設定", items: ["選擇彩種、歷史範圍（1000／3000／5000期）及號碼順序。", "可輸入0至3個探索號碼；空白格不參與探索，號碼不可重複。"] },
        { title: "開始探索", items: ["修改條件後，需按「開始探索」才更新歷史資料與標記。", "未輸入探索號碼時，仍可顯示完整歷史表格且不顯示探索標記。", "探索顏色固定依輸入格位置對應。"] },
        { title: "手動標記與刷新", items: ["點擊期數或單一號碼可手動標記，並立即生效。", "刷新後清空探索號碼與所有標記，並重新載入資料。"] },
      ],
    },
    {
      title: "連碰立柱計算機",
      summary: "提供連碰與立柱計算，並顯示二星、三星、四星及五星結果。",
      blocks: [
        { title: "連碰計算", items: ["切換至「連碰計算機」。", "選取號碼後查看已選數量。", "結果依序顯示二星、三星、四星與五星。"] },
        { title: "立柱計算", items: ["切換至「立柱計算機」。", "調整各柱號碼數量，最多計算至五星。", "可使用批次設定或清除後重新輸入。"] },
      ],
    },
    {
      title: "Matrix 牌單",
      summary: "依最新一期資料顯示牌單，並提供 PNG 下載。",
      blocks: [
        { title: "使用方式", items: ["選擇今彩539、天天樂、六合彩或大樂透。", "查看所選彩種的最新一期牌單。", "按下「下載 PNG」下載目前牌單。"] },
      ],
    },
    {
      title: "快捷與 Matrix 筆記本",
      summary: "快捷可快速開啟已設定的功能；Matrix 筆記本提供筆記與紀錄兩種模式。",
      blocks: [
        { title: "快捷", items: ["點擊快捷開啟目前設定的功能。", "長按三秒可設定快捷功能。"] },
        { title: "筆記模式", items: ["新增筆記後輸入標題與內容，再按「寫入筆記」。", "返回列表前若內容尚未寫入，將提醒是否儲存。", "只顯示筆記功能，不顯示損益與紀錄統計。"] },
        { title: "紀錄模式", items: ["可建立單號、連碰或立柱紀錄，號碼由彈窗選取。", "玩法可複選，各玩法分別設定碰數、1碰成本、成本與玩法獎金。", "摘要顯示玩法成本、已確認獎金及金額差額；統計提供本日、本週與自訂日期。", "每筆紀錄保存建立當下的設定快照，後續修改設定不影響歷史紀錄。"] },
      ],
    },
    {
      title: "通知",
      summary: "可設定選號提醒、開獎結果、Matrix 狀態、Matrix 牌單下載、Matrix Pro 到期、系統通知。",
      blocks: [
        { title: "通知設定", items: ["各通知可個別開啟或關閉。", "投注通知可依彩種設定時間。", "選號提醒、開獎結果、Matrix 牌單下載可依彩種設定。", "中獎通知可選擇彩種通知或中獎金額通知。"] },
        { title: "Matrix Pro 通知", items: ["部分通知功能需具備 Matrix Pro 權限。", "到期通知可選擇提前1日、提前3日或提前7日。"] },
      ],
    },
    {
      title: "Matrix Pro",
      summary: "Matrix Pro 為樂彩 Matrix 的付費訂閱方案。",
      blocks: [
        { title: "方案與期間", items: ["提供月方案、季方案與年方案。", "實際價格、期間及權限請至「Matrix Pro 會員方案與收費標準」查看。"] },
        { title: "權限內容", items: ["Matrix 狀態進階資訊。", "Matrix 探索期數十三期。", "Matrix 探索完整範圍。", "Matrix Pro 專屬推播通知。", "依訂閱方案顯示 Matrix 天衍、Matrix 天工權限。"] },
      ],
    },
    {
      title: "帳號與安全",
      summary: "使用 LINE 官方授權登入，會員資料、記事、通知、設定與 Matrix Pro 權益會同步。",
      blocks: [
        { title: "登入規則", items: ["一個帳號僅允許一個有效 Session。", "新裝置登入時，舊裝置會自動登出。", "系統將定期驗證登入狀態。", "會員資料與權益依 LINE 帳號同步。"] },
        { title: "安全機制", items: ["使用裝置驗證與資料加密保護。", "若帳號在其他裝置登入，目前裝置會自動登出。"] },
      ],
    },
    {
      title: "常見問題",
      summary: "依目前功能整理操作時常見的查詢方式。",
      blocks: [
        { title: "條件變更後結果沒有更新", items: ["Matrix 探索需按「開始探索」產生結果。", "號碼對照單修改條件後，也需再次按「開始探索」。"] },
        { title: "查看更多開獎紀錄", items: ["近10期開獎號碼，點選查看更多紀錄，可查閱歷史開獎號碼。", "號碼對照單可選擇1000期、3000期或5000期。"] },
        { title: "設定常用功能", items: ["長按底部「快捷」三秒後，選擇要指定的功能。"] },
        { title: "查看 Matrix Pro 權限", items: ["前往「我的」中的「Matrix Pro 方案與收費標準」。"] },
      ],
    },
    {
      title: "關於 樂彩 Matrix",
      summary: "樂彩 Matrix 提供開獎資料查詢與分析服務，協助查閱公開資訊、整理歷史數據與使用各項分析工具。",
      blocks: [
        { title: "服務內容", items: ["支援今彩539、天天樂、六合彩及大樂透。", "提供 Matrix 分析、歷史資料查詢、號碼紀錄、計算工具、牌單及通知等功能。"] },
        { title: "品牌資訊", items: ["品牌名稱：樂彩 Matrix。", "Copyright © 2026 樂彩 Matrix. All Rights Reserved."] },
      ],
    },
  ];
  const [selected, setSelected] = useState(0);
  const current = sections[selected];
  return (
    <FeatureShell title="Matrix 指南" onNavigate={onNavigate} className="matrix-guide-screen">
      <section className="guide-intro panel">
        <img src="/assets/lottery/functions/matrix-guide.png" alt="" />
        <div><p>樂彩 Matrix 功能說明</p></div>
      </section>
      <nav className="guide-category-strip" aria-label="Matrix 指南分類">
        {sections.map((section, index) => (
          <button type="button" data-selected={selected === index} onClick={() => setSelected(index)} key={section.title}>
            <span>{String(index + 1).padStart(2, "0")}</span>{section.title}
          </button>
        ))}
      </nav>
      <section className="panel guide-preview">
        <header><span>{String(selected + 1).padStart(2, "0")}</span><h2>{current.title}</h2></header>
        <p className="guide-summary">{current.summary}</p>
        <div className="guide-detail-list">
          {current.blocks.map((block) => (
            <section className="guide-detail-block" key={block.title}>
              <h3>{block.title}</h3>
              <ul>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
          ))}
        </div>
      </section>
    </FeatureShell>
  );
}

function LegacyMatrixNotebookPage({ onNavigate }: { onNavigate: Navigate }) {
  type NotebookEntry = { id: string; title: string; content: string; updatedAt: string };
  const [entries, setEntries] = useState<NotebookEntry[]>(() => {
    if (typeof window === "undefined") return [];
    const stored = window.localStorage.getItem("matrix-notebook-entries");
    if (stored) {
      try { return JSON.parse(stored) as NotebookEntry[]; } catch { /* use legacy content */ }
    }
    const legacy = window.localStorage.getItem("matrix-notebook-content");
    return legacy ? [{ id: "legacy", title: "未命名筆記", content: legacy, updatedAt: new Date().toISOString() }] : [];
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.localStorage.setItem("matrix-notebook-entries", JSON.stringify(entries));
  }, [entries]);

  useEffect(() => {
    if (editingId === null || (!draftTitle.trim() && !draftContent.trim())) return;
    setSaved(false);
    const timer = window.setTimeout(() => {
      setEntries((current) => current.map((entry) => entry.id === editingId
        ? { ...entry, title: draftTitle, content: draftContent, updatedAt: new Date().toISOString() }
        : entry));
      setSaved(true);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draftContent, draftTitle, editingId]);

  const startNew = () => {
    const id = `note-${Date.now()}`;
    setEntries((current) => [{ id, title: "", content: "", updatedAt: new Date().toISOString() }, ...current]);
    setEditingId(id);
    setDraftTitle("");
    setDraftContent("");
    setSaved(false);
  };

  const startEdit = (entry: NotebookEntry) => {
    setEditingId(entry.id);
    setDraftTitle(entry.title);
    setDraftContent(entry.content);
    setSaved(true);
  };

  const finishEditing = () => {
    if (editingId !== null && !draftTitle.trim() && !draftContent.trim()) {
      setEntries((current) => current.filter((entry) => entry.id !== editingId));
    }
    setEditingId(null);
  };

  const deleteEntry = (id: string) => {
    if (!window.confirm("確定刪除此筆記？")) return;
    setEntries((current) => current.filter((entry) => entry.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const formatModifiedTime = (value: string) => new Intl.DateTimeFormat("zh-TW", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(value));

  return (
    <FeatureShell title="Matrix 筆記本" onNavigate={onNavigate} active="快捷" className="matrix-notebook-screen">
      {editingId === null ? <>
        <section className="notebook-heading">
          <img src="/assets/quick/matrix-notebook.png" alt="" />
          <div><h2>Matrix 筆記本</h2><span>{entries.length} 筆筆記</span></div>
          <button type="button" onClick={startNew}><PlusIcon />新增筆記</button>
        </section>
        <section className="notebook-entry-list" aria-label="筆記列表">
          {entries.length === 0 ? <div className="panel notebook-empty"><img src="/assets/quick/matrix-notebook.png" alt="" /><strong>尚無筆記</strong></div> : entries.map((entry) => (
            <article className="panel notebook-entry" key={entry.id}>
              <button type="button" className="notebook-entry-open" onClick={() => startEdit(entry)}>
                <span><strong>{entry.title.trim() || "未命名筆記"}</strong><small>{formatModifiedTime(entry.updatedAt)}</small></span>
                <ChevronRightIcon />
              </button>
              <button type="button" className="notebook-entry-delete" onClick={() => deleteEntry(entry.id)} aria-label={`刪除${entry.title.trim() || "未命名筆記"}`}><TrashIcon /></button>
            </article>
          ))}
        </section>
      </> : <section className="panel matrix-notebook-editor">
        <header><button type="button" onClick={finishEditing}><ChevronLeftIcon />返回列表</button><span>{saved ? "已自動儲存" : "儲存中"}</span></header>
        <input aria-label="筆記標題" placeholder="標題" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
        <textarea aria-label="筆記內容" placeholder="輸入筆記內容" value={draftContent} onChange={(event) => setDraftContent(event.target.value)} />
        <footer><span>最後修改時間</span><strong>{formatModifiedTime(entries.find((entry) => entry.id === editingId)?.updatedAt ?? new Date().toISOString())}</strong></footer>
        <button type="button" className="notebook-editor-delete" onClick={() => deleteEntry(editingId)}><TrashIcon />刪除筆記</button>
      </section>}
    </FeatureShell>
  );
}

type NotebookView = "list" | "note" | "record" | "settings";
type RecordMode = "單號" | "連碰" | "立柱";
type RecordStatus = "等待開獎" | "已結算" | "已鎖定";
type CostMode = "依照碰數" | "固定成本";
type NotebookNote = { id: string; title: string; content: string; updatedAt: string };
type TagSetting = { name: string; costMode: CostMode; defaultBets: number; costPerBet: number; fixedCost: number; prizePerBet: number };
type LotteryRecordSettings = { tags: TagSetting[] };
type RecordSnapshot = {
  lottery: LotteryId;
  plays: Array<{ name: string; bets: number; costPerBet: number; cost: number; playPrize: number }>;
  quantity: number;
  createdDate: string;
  createdTime: string;
};
const formatNotebookAmount = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);
type PlayDraft = { quantity: string };
type NotebookRecord = {
  id: string;
  lottery: LotteryId;
  date: string;
  mode: RecordMode;
  numbers: string[];
  columns: string[][];
  tags: string[];
  quantity: number;
  bets: number;
  cost: number;
  estimatedPrize: number;
  actualPrize: number;
  status: RecordStatus;
  unlocked: boolean;
  snapshot: RecordSnapshot;
};

const DEFAULT_RECORD_SETTINGS = (): Record<LotteryId, LotteryRecordSettings> => Object.fromEntries(
  LOTTERIES.map((lottery) => {
    const isThirtyNine = lottery === "今彩539" || lottery === "天天樂";
    const singlePrize = isThirtyNine ? 21200 : 28500;
    const singleBets = isThirtyNine ? 38 : 48;
    const singleFixedCost = isThirtyNine ? 3040 : 3840;
    const twoStarPrize = isThirtyNine ? 5300 : 5700;
    const fourStarPrize = isThirtyNine ? 800000 : 750000;
    return [lottery, {
      tags: [
        { name: "單號", costMode: "依照碰數" as CostMode, defaultBets: singleBets, costPerBet: 80, fixedCost: singleFixedCost, prizePerBet: singlePrize },
        { name: "二星", costMode: "固定成本" as CostMode, defaultBets: 1, costPerBet: 80, fixedCost: 80, prizePerBet: twoStarPrize },
        { name: "三星", costMode: "固定成本" as CostMode, defaultBets: 1, costPerBet: 80, fixedCost: 80, prizePerBet: 57000 },
        { name: "四星", costMode: "固定成本" as CostMode, defaultBets: 1, costPerBet: 80, fixedCost: 80, prizePerBet: fourStarPrize },
      ],
    }];
  }),
) as Record<LotteryId, LotteryRecordSettings>;

function parseRecordNumbers(value: string, max: number) {
  return value.split(/[^0-9]+/).filter(Boolean).map((number) => number.padStart(2, "0")).filter((number) => Number(number) >= 1 && Number(number) <= max);
}

function combinations(total: number, choose: number) {
  if (choose < 0 || choose > total) return 0;
  let result = 1;
  for (let index = 1; index <= choose; index += 1) result = (result * (total - choose + index)) / index;
  return Math.round(result);
}

export function MatrixNotebookPage({ onNavigate }: { onNavigate: Navigate }) {
  const [view, setView] = useState<NotebookView>("list");
  const [notebookMode, setNotebookMode] = useState<"筆記" | "紀錄">("筆記");
  const [notes, setNotes] = useState<NotebookNote[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(window.localStorage.getItem("matrix-notebook-entries") || "[]") as NotebookNote[]; } catch { return []; }
  });
  const [records, setRecords] = useState<NotebookRecord[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(window.localStorage.getItem("matrix-notebook-records") || "[]") as NotebookRecord[]; } catch { return []; }
  });
  const [settings, setSettings] = useState<Record<LotteryId, LotteryRecordSettings>>(() => {
    if (typeof window === "undefined") return DEFAULT_RECORD_SETTINGS();
    try {
      const stored = JSON.parse(window.localStorage.getItem("matrix-notebook-record-settings") || "null") as Record<LotteryId, LotteryRecordSettings> | null;
      if (!stored) return DEFAULT_RECORD_SETTINGS();
      const defaults = DEFAULT_RECORD_SETTINGS();
      return Object.fromEntries(LOTTERIES.map((item) => [item, { tags: [...defaults[item].tags, ...(stored[item]?.tags ?? []).filter((play) => !["單號", "二星", "三星", "四星", "自訂"].includes(play.name)).map((play) => ({ ...play, defaultBets: Math.min(9999999, Math.max(1, Number(play.defaultBets) || 1)), costPerBet: Math.min(9999999, Math.max(1, Number(play.costPerBet) || 1)), fixedCost: Math.min(9999999, Math.max(1, Number(play.fixedCost) || 1)), prizePerBet: Math.min(9999999, Math.max(1, Number(play.prizePerBet) || 1)) }))] }])) as Record<LotteryId, LotteryRecordSettings>;
    } catch { return DEFAULT_RECORD_SETTINGS(); }
  });
  const [settingsDraft, setSettingsDraft] = useState<Record<LotteryId, LotteryRecordSettings>>(() => DEFAULT_RECORD_SETTINGS());
  const [settingsBaseline, setSettingsBaseline] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteBaseline, setNoteBaseline] = useState({ title: "", content: "" });
  const [lottery, setLottery] = useState<LotteryId>("今彩539");
  const [recordDate, setRecordDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState<RecordMode>("單號");
  const [numberText, setNumberText] = useState("");
  const [columnTexts, setColumnTexts] = useState(() => Array.from({ length: 12 }, () => ""));
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [playDrafts, setPlayDrafts] = useState<Record<string, PlayDraft>>({});
  const [numberPicker, setNumberPicker] = useState<{ type: "numbers" | "column" | "special"; column?: number } | null>(null);
  const [specialNumber, setSpecialNumber] = useState("");
  const [dateInfoOpen, setDateInfoOpen] = useState(false);
  const [expandedRecordIds, setExpandedRecordIds] = useState<string[]>([]);
  const [recordLotteryFilters, setRecordLotteryFilters] = useState<LotteryId[]>([...LOTTERIES]);
  const [customStartDate, setCustomStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [customEndDate, setCustomEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [statsPeriod, setStatsPeriod] = useState<"本日" | "本週" | "自訂">("本日");
  const [settingsLottery, setSettingsLottery] = useState<LotteryId>("今彩539");
  const [settingsEditMode, setSettingsEditMode] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const importRef = useRef<HTMLInputElement | null>(null);
  const draggedTagIndex = useRef<number | null>(null);
  const draggedTagTargetIndex = useRef<number | null>(null);
  const editingTagName = useRef("");

  useEffect(() => { window.localStorage.setItem("matrix-notebook-entries", JSON.stringify(notes)); }, [notes]);
  useEffect(() => { window.localStorage.setItem("matrix-notebook-records", JSON.stringify(records)); }, [records]);
  useEffect(() => { window.localStorage.setItem("matrix-notebook-record-settings", JSON.stringify(settings)); }, [settings]);

  const maxNumber = lottery === "今彩539" || lottery === "天天樂" ? 39 : 49;
  const currentTags = settings[lottery].tags.filter((tag) => tag.name !== "自訂");
  const parsedNumbers = parseRecordNumbers(numberText, maxNumber);
  const parsedColumns = columnTexts.map((text) => parseRecordNumbers(text, maxNumber));
  const getCalculatedBets = (playName: string) => {
    const setting = currentTags.find((play) => play.name === playName);
    const star = Number((/^[二三四]星$/.test(playName) ? playName : "二星").replace("二", "2").replace("三", "3").replace("四", "4").replace("星", ""));
    if (mode === "單號") return setting?.defaultBets ?? 0;
    if (mode === "連碰") return combinations(parsedNumbers.length, star);
    return parsedColumns.length >= star && parsedColumns.slice(0, star).every((column) => column.length > 0)
      ? parsedColumns.slice(0, star).reduce((total, column) => total * column.length, 1)
      : 0;
  };
  const selectedPlayRows = selectedTags.map((name) => {
    const setting = currentTags.find((play) => play.name === name);
    const draft = playDrafts[name];
    const playQuantity = Math.min(9999999, Math.max(0.1, Number(draft?.quantity || 1)));
    const baseBets = getCalculatedBets(name);
    const bets = baseBets * playQuantity;
    const cost = setting?.costMode === "固定成本"
      ? (setting.fixedCost ?? 0) * playQuantity
      : bets * (setting?.costPerBet ?? 0);
    const playPrize = (setting?.prizePerBet ?? 0) * playQuantity;
    const unitCost = bets ? cost / bets : 0;
    const unitPrize = bets ? playPrize / bets : 0;
    return { name, quantity: playQuantity, bets, costPerBet: setting?.costPerBet ?? 0, cost, playPrize, unitCost, unitPrize };
  });
  const computedBets = selectedPlayRows.reduce((sum, play) => sum + play.bets, 0);
  const computedCost = selectedPlayRows.reduce((sum, play) => sum + play.cost, 0);
  const estimatedPrize = selectedPlayRows.reduce((sum, play) => sum + play.playPrize, 0);

  const weekDates = useMemo(() => {
    const selected = new Date(`${recordDate}T00:00:00`);
    const monday = new Date(selected);
    const day = monday.getDay();
    monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return { label: ["一", "二", "三", "四", "五", "六", "日"][index], value: date.toISOString().slice(0, 10), day: date.getDate() };
    });
  }, [recordDate]);

  const visibleRecords = useMemo(() => records.filter((record) => {
    const date = new Date(`${record.date}T00:00:00`);
    const today = new Date();
    if (!recordLotteryFilters.includes(record.lottery)) return false;
    if (statsPeriod === "本日") return record.date === today.toISOString().slice(0, 10);
    if (statsPeriod === "自訂") return record.date >= customStartDate && record.date <= customEndDate;
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const day = monday.getDay();
    monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59, 999);
    return date >= monday && date <= sunday;
  }), [customEndDate, customStartDate, recordLotteryFilters, records, statsPeriod]);
  const stats = useMemo(() => ({
    total: visibleRecords.length,
    won: visibleRecords.filter((record) => record.actualPrize > 0).length,
    missed: visibleRecords.filter((record) => record.status !== "等待開獎" && record.actualPrize === 0).length,
    bets: visibleRecords.reduce((sum, record) => sum + record.bets, 0),
    cost: visibleRecords.reduce((sum, record) => sum + record.cost, 0),
    prize: visibleRecords.reduce((sum, record) => sum + record.actualPrize, 0),
  }), [visibleRecords]);
  const settingsDirty = view === "settings" && JSON.stringify(settingsDraft) !== settingsBaseline;

  useEffect(() => {
    if (!settingsDirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [settingsDirty]);

  const startNote = (entry?: NotebookNote) => {
    setEditingNoteId(entry?.id ?? null);
    setNoteTitle(entry?.title ?? "");
    setNoteContent(entry?.content ?? "");
    setNoteBaseline({ title: entry?.title ?? "", content: entry?.content ?? "" });
    setView("note");
  };
  const returnFromNote = () => {
    const changed = noteTitle !== noteBaseline.title || noteContent !== noteBaseline.content;
    if (changed && !window.confirm("內容尚未寫入，確定返回列表？")) return;
    setView("list");
  };
  const saveNote = () => {
    if (!noteTitle.trim() && !noteContent.trim()) return;
    if (!window.confirm("確定寫入筆記？")) return;
    const now = new Date().toISOString();
    if (editingNoteId) setNotes((current) => current.map((entry) => entry.id === editingNoteId ? { ...entry, title: noteTitle, content: noteContent, updatedAt: now } : entry));
    else setNotes((current) => [{ id: `note-${Date.now()}`, title: noteTitle, content: noteContent, updatedAt: now }, ...current]);
    setView("list");
  };
  const deleteNote = (id: string) => {
    if (window.confirm("確定刪除此筆記？")) setNotes((current) => current.filter((entry) => entry.id !== id));
  };
  const startRecord = () => {
    setLottery("今彩539"); setRecordDate(new Date().toISOString().slice(0, 10)); setMode("單號"); setNumberText(""); setColumnTexts(Array.from({ length: 12 }, () => "")); setSelectedTags([]); setPlayDrafts({}); setSpecialNumber(""); setView("record");
  };
  const openSettings = () => {
    const draft = structuredClone(settings);
    setSettingsDraft(draft);
    setSettingsBaseline(JSON.stringify(draft));
    setSettingsEditMode(false);
    setNewTagName("");
    setView("settings");
  };
  const leaveSettings = (action: () => void) => {
    if (settingsDirty && !window.confirm("設定尚未儲存，確定離開？")) return;
    action();
  };
  const navigateFromNotebook: Navigate = (screen) => {
    if (view === "settings") leaveSettings(() => onNavigate(screen));
    else onNavigate(screen);
  };
  const saveRecord = () => {
    const numbers = mode === "立柱" ? parsedColumns.flat() : parsedNumbers;
    if (mode === "立柱" && new Set(numbers).size !== numbers.length) return;
    if (numbers.length === 0 || selectedTags.length === 0) return;
    const created = new Date();
    const snapshot: RecordSnapshot = {
      lottery, plays: selectedPlayRows, quantity: 1,
      createdDate: created.toLocaleDateString("zh-TW"), createdTime: created.toLocaleTimeString("zh-TW", { hour12: false }),
    };
    setRecords((current) => [{
      id: `record-${Date.now()}`, lottery, date: recordDate, mode, numbers: specialNumber ? [...numbers, specialNumber] : numbers, columns: parsedColumns,
      tags: selectedTags, quantity: 1, bets: computedBets, cost: computedCost, estimatedPrize,
      actualPrize: 0, status: "等待開獎", unlocked: false, snapshot,
    }, ...current]);
    setView("list");
  };
  const updateTag = (index: number, patch: Partial<TagSetting>) => setSettingsDraft((current) => ({
    ...current,
    [settingsLottery]: { tags: current[settingsLottery].tags.map((tag, tagIndex) => tagIndex === index ? { ...tag, ...patch } : tag) },
  }));
  const updateTagNumber = (index: number, key: "defaultBets" | "costPerBet" | "fixedCost" | "prizePerBet", rawValue: string) => {
    const digits = rawValue.replace(/\D/g, "").slice(0, 7);
    updateTag(index, { [key]: digits === "" ? 0 : Math.min(9999999, Math.max(1, Number(digits))) });
  };
  const finalizeTagNumber = (index: number, key: "defaultBets" | "costPerBet" | "fixedCost" | "prizePerBet", value: number) => {
    if (value < 1) updateTag(index, { [key]: 1 });
  };
  const reorderSettingsTag = (from: number, to: number) => {
    if (from === to) return;
    setSettingsDraft((current) => {
      const tags = [...current[settingsLottery].tags];
      const [moved] = tags.splice(from, 1);
      tags.splice(to, 0, moved);
      return { ...current, [settingsLottery]: { tags } };
    });
  };
  const beginTagDrag = (event: React.PointerEvent<HTMLButtonElement>, index: number) => {
    draggedTagIndex.current = index;
    draggedTagTargetIndex.current = index;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveTagDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const from = draggedTagIndex.current;
    if (from === null) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-tag-setting-index]");
    const to = Number(target?.dataset.tagSettingIndex);
    if (Number.isInteger(to)) draggedTagTargetIndex.current = to;
  };
  const endTagDrag = () => {
    const from = draggedTagIndex.current;
    const to = draggedTagTargetIndex.current;
    draggedTagIndex.current = null;
    draggedTagTargetIndex.current = null;
    if (from === null || to === null || from === to) return;
    if (!window.confirm("確定變更玩法順序？")) return;
    reorderSettingsTag(from, to);
  };
  const addSettingsTag = () => {
    if (!newTagName.trim()) return;
    const name = newTagName.trim();
    if (settingsDraft[settingsLottery].tags.some((play) => play.name === name)) return;
    if (!window.confirm(`確定新增「${name}」玩法？`)) return;
    setSettingsDraft((current) => ({
      ...current,
      [settingsLottery]: {
        tags: [...current[settingsLottery].tags, {
          name,
          costMode: "依照碰數",
          defaultBets: settingsLottery === "今彩539" || settingsLottery === "天天樂" ? 38 : 48,
          costPerBet: 1,
          fixedCost: 1,
          prizePerBet: 1,
        }],
      },
    }));
    setNewTagName("");
  };
  const deleteSettingsTag = (index: number, name: string) => {
    if (!window.confirm(`確定刪除「${name}」玩法？`)) return;
    setSettingsDraft((current) => ({
      ...current,
      [settingsLottery]: { tags: current[settingsLottery].tags.filter((_, tagIndex) => tagIndex !== index) },
    }));
  };
  const resetSettings = () => {
    if (!window.confirm("確定重置設定？")) return;
    setSettingsDraft((current) => ({ ...current, [settingsLottery]: DEFAULT_RECORD_SETTINGS()[settingsLottery] }));
  };
  const saveSettings = () => {
    if (!window.confirm("確定儲存設定？")) return;
    const savedSettings = structuredClone(settingsDraft);
    setSettings(savedSettings);
    setSettingsBaseline(JSON.stringify(savedSettings));
    setSettingsEditMode(false);
  };
  const togglePlay = (name: string) => {
    setSelectedTags((current) => current.includes(name) ? current.filter((play) => play !== name) : [...current, name]);
    if (!playDrafts[name]) setPlayDrafts((current) => ({ ...current, [name]: { quantity: "1" } }));
  };
  const updatePlayDraft = (name: string, patch: Partial<PlayDraft>) => setPlayDrafts((current) => ({ ...current, [name]: { quantity: current[name]?.quantity ?? "1", ...patch } }));
  const togglePickedNumber = (number: string) => {
    if (!numberPicker) return;
    if (numberPicker.type === "special") {
      setSpecialNumber((current) => current === number ? "" : number);
      setNumberText((current) => parseRecordNumbers(current, maxNumber).filter((item) => item !== number).join(" "));
      setColumnTexts((columns) => columns.map((value) => parseRecordNumbers(value, maxNumber).filter((item) => item !== number).join(" ")));
      return;
    }
    setSpecialNumber((current) => current === number ? "" : current);
    if (numberPicker.type === "numbers") {
      if (mode === "單號") setNumberText(number);
      else setNumberText((parsedNumbers.includes(number) ? parsedNumbers.filter((item) => item !== number) : [...parsedNumbers, number]).join(" "));
      return;
    }
    const columnIndex = numberPicker.column ?? 0;
    const current = parsedColumns[columnIndex] ?? [];
    const removing = current.includes(number);
    setColumnTexts((columns) => columns.map((value, index) => {
      const values = parseRecordNumbers(value, maxNumber).filter((item) => item !== number);
      if (index === columnIndex && !removing) values.push(number);
      return values.join(" ");
    }));
  };
  const exportBackup = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ notes, records, settings }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "matrix-notebook-backup.json"; link.click(); URL.revokeObjectURL(url);
  };
  const importBackup = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as { notes?: NotebookNote[]; records?: NotebookRecord[]; settings?: Record<LotteryId, LotteryRecordSettings> };
        if (data.notes) setNotes(data.notes); if (data.records) setRecords(data.records); if (data.settings) setSettings(data.settings);
      } catch { window.alert("匯入備份失敗"); }
    };
    reader.readAsText(file);
  };
  const formatTime = (value: string) => new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));

  return (
    <FeatureShell title="Matrix 筆記本" onNavigate={navigateFromNotebook} active="快捷" className="matrix-notebook-screen">
      {view === "list" ? <>
        <section className="notebook-heading notebook-heading-v2">
          <img src="/assets/quick/matrix-notebook.png" alt="" />
          <div className="notebook-heading-content">
            <div className="notebook-title-row">
              <h2>Matrix 筆記本</h2>
              <div className="notebook-mode-switch" aria-label="筆記本模式">
                <button type="button" data-selected={notebookMode === "筆記"} onClick={() => setNotebookMode("筆記")} aria-label="切換至筆記模式"><img src="/assets/quick/notebook-mode-note.png" alt="" /><span>筆記</span></button>
                <button type="button" data-selected={notebookMode === "紀錄"} onClick={() => setNotebookMode("紀錄")} aria-label="切換至紀錄模式"><img src="/assets/quick/notebook-mode-record.png" alt="" /><span>紀錄</span></button>
              </div>
            </div>
            <span>{notebookMode === "筆記" ? `${notes.length} 筆筆記` : `${records.length} 筆紀錄`}</span>
          </div>
          <div className="notebook-create-actions" data-mode={notebookMode}>{notebookMode === "紀錄" ? <div className="record-lottery-filters" aria-label="彩種分類">{LOTTERIES.map((item) => <button type="button" data-selected={recordLotteryFilters.includes(item)} onClick={() => setRecordLotteryFilters((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])} key={item}>{item}</button>)}</div> : null}{notebookMode === "筆記" ? <button type="button" onClick={() => startNote()}><PlusIcon />新增筆記</button> : <button type="button" onClick={startRecord}><PlusIcon />新增紀錄</button>}</div>
        </section>
        {notebookMode === "紀錄" ? <section className="record-stats panel">
          <header><div>{(["本日", "本週", "自訂"] as const).map((period) => <button type="button" data-selected={statsPeriod === period} onClick={() => setStatsPeriod(period)} key={period}>{period}</button>)}</div><button type="button" onClick={openSettings}><GearIcon />設定</button></header>{statsPeriod === "自訂" ? <div className="record-custom-range"><input type="date" value={customStartDate} onChange={(event) => setCustomStartDate(event.target.value)} /><span>至</span><input type="date" value={customEndDate} onChange={(event) => setCustomEndDate(event.target.value)} /></div> : null}
          <div className="record-stats-grid">
            <span>玩法成本 <strong>NT {formatNotebookAmount(stats.cost)}</strong></span><span>已確認獎金 <strong>{formatNotebookAmount(stats.prize)}</strong></span><span>金額差額 <strong>NT {formatNotebookAmount(stats.prize - stats.cost)}</strong></span>
          </div>
        </section> : null}
        <section className="notebook-entry-list" aria-label={notebookMode === "筆記" ? "筆記列表" : "紀錄列表"}>
          {notebookMode === "筆記" ? notes.map((entry) => <article className="panel notebook-entry" key={entry.id}>
            <button type="button" className="notebook-entry-open" onClick={() => startNote(entry)}><span><strong>{entry.title.trim() || "未命名筆記"}</strong><small>{formatTime(entry.updatedAt)}</small></span><ChevronRightIcon /></button>
            <button type="button" className="notebook-entry-delete" onClick={() => deleteNote(entry.id)} aria-label="刪除筆記"><TrashIcon /></button>
          </article>) : visibleRecords.map((record) => {
            const expanded = expandedRecordIds.includes(record.id);
            return <article className="panel notebook-record-card" key={record.id}>
              <button type="button" className="record-card-toggle" aria-expanded={expanded} onClick={() => setExpandedRecordIds((current) => current.includes(record.id) ? current.filter((id) => id !== record.id) : [...current, record.id])}>
                <span><strong>{record.lottery}</strong><small>{record.date}</small></span><em>{record.status}</em><ChevronDownIcon data-open={expanded} />
              </button>
              {expanded ? <div className="record-card-details"><p>{record.mode}｜{record.tags.join("、")}</p><div className="record-number-row">{record.numbers.map((number, index) => <i key={number + "-" + index}>{number}</i>)}</div><footer><span>總碰數 <strong>{formatNotebookAmount(record.bets)}</strong></span><span>玩法成本 <strong>NT {formatNotebookAmount(record.cost)}</strong></span><span>已確認獎金 <strong>{formatNotebookAmount(record.actualPrize)}</strong></span><span>金額差額 <strong>NT {formatNotebookAmount(record.actualPrize - record.cost)}</strong></span></footer><div className="record-status-actions"><em>{record.status}</em><button type="button" onClick={() => { if (window.confirm("確定刪除此紀錄？")) setRecords((current) => current.filter((item) => item.id !== record.id)); }}><TrashIcon />刪除</button></div></div> : null}
            </article>;
          })}
          {notebookMode === "筆記" && notes.length === 0 ? <div className="panel notebook-empty"><img src="/assets/quick/matrix-notebook.png" alt="" /><strong>尚無筆記</strong></div> : null}
          {notebookMode === "紀錄" && visibleRecords.length === 0 ? <div className="panel notebook-empty"><img src="/assets/quick/matrix-notebook.png" alt="" /><strong>尚無紀錄</strong></div> : null}
        </section>
      </> : null}

      {view === "note" ? <section className="panel matrix-notebook-editor">
        <header><button type="button" onClick={returnFromNote}><ChevronLeftIcon />返回列表</button></header>
        <input aria-label="筆記標題" placeholder="標題" value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} />
        <textarea aria-label="筆記內容" placeholder="輸入筆記內容" value={noteContent} onChange={(event) => setNoteContent(event.target.value)} />
        <button type="button" className="notebook-write-button" onClick={saveNote}>寫入筆記</button>
      </section> : null}

      {view === "record" ? <section className="record-editor">
        <header className="record-page-header"><button type="button" onClick={() => setView("list")}><ChevronLeftIcon />返回列表</button><button type="button" onClick={openSettings}><GearIcon />設定</button></header>
        <section className="panel record-form-section"><h3>彩種</h3><div className="record-lottery-tabs">{LOTTERIES.map((item) => <button type="button" data-selected={lottery === item} onClick={() => { setLottery(item); setSettingsLottery(item); setNumberText(""); setColumnTexts(Array.from({ length: 12 }, () => "")); setSpecialNumber(""); setSelectedTags([]); setPlayDrafts({}); }} key={item}>{item}</button>)}</div></section>
        <section className="panel record-form-section record-date-section"><button type="button" className="record-date-toggle" aria-expanded={dateInfoOpen} onClick={() => setDateInfoOpen(!dateInfoOpen)}><h3>日期</h3><ChevronDownIcon data-open={dateInfoOpen} /></button>{dateInfoOpen ? <div className="record-week-row">{weekDates.map((date) => <button type="button" data-selected={recordDate === date.value} onClick={() => setRecordDate(date.value)} key={date.value}><span>{date.label}</span><strong>{date.day}</strong></button>)}</div> : null}</section>
        <section className="panel record-form-section"><h3>輸入模式</h3><div className="record-mode-tabs">{(["單號", "連碰", "立柱"] as const).map((item) => <button type="button" data-selected={mode === item} onClick={() => { setMode(item); setNumberText(""); setColumnTexts(Array.from({ length: 12 }, () => "")); setSpecialNumber(""); setSelectedTags([]); setPlayDrafts({}); }} key={item}>{item}</button>)}</div>
          <div className="record-number-and-special">{mode !== "立柱" ? <button type="button" className="record-number-picker-button" onClick={() => setNumberPicker({ type: "numbers" })}><span>{parsedNumbers.length ? parsedNumbers.join("、") : "選取號碼"}</span><ChevronRightIcon /></button> : <div className="record-columns">{columnTexts.map((value, index) => <label key={index}>第{index + 1}柱<button type="button" onClick={() => setNumberPicker({ type: "column", column: index })}><span>{parseRecordNumbers(value, maxNumber).length ? parseRecordNumbers(value, maxNumber).join("、") : "選取號碼"}</span><ChevronRightIcon /></button></label>)}</div>}{lottery === "六合彩" || lottery === "大樂透" ? <button type="button" className="record-special-picker-button" onClick={() => setNumberPicker({ type: "special" })}><span>特別號</span><strong>{specialNumber || "—"}</strong></button> : null}</div>
        </section>
        <section className="panel record-form-section"><h3>玩法</h3><div className="record-tag-options">{currentTags.filter((play) => mode === "單號" ? !["二星", "三星", "四星"].includes(play.name) : play.name !== "單號").map((play) => <button type="button" data-selected={selectedTags.includes(play.name)} onClick={() => togglePlay(play.name)} key={play.name}>{play.name}</button>)}</div></section>
        {selectedPlayRows.map((play) => <section className="panel record-play-setting" key={play.name}><h3>{play.name}</h3><div className="record-play-metrics"><label>數量 <input type="number" min="0.1" max="9999999" step="0.1" value={playDrafts[play.name]?.quantity ?? "1"} onChange={(event) => updatePlayDraft(play.name, { quantity: event.target.value })} /></label><p className="record-formula"><span>碰數 <strong>{formatNotebookAmount(play.bets)}</strong> × 1碰金額 <strong>{formatNotebookAmount(play.unitCost)}</strong> = 玩法成本 <strong>NT {formatNotebookAmount(play.cost)}</strong></span></p><p className="record-formula"><span>碰數 <strong>{formatNotebookAmount(play.bets)}</strong> × 1碰獎金 <strong>{formatNotebookAmount(play.unitPrize)}</strong> = 最高獎金 <strong>{formatNotebookAmount(play.playPrize)}</strong></span></p></div></section>)}
        <section className="panel record-form-section record-quantity"><span>總碰數 <strong>{formatNotebookAmount(computedBets)}</strong></span><span>玩法成本 <strong>NT {formatNotebookAmount(computedCost)}</strong></span><span>最高獎金 <strong>{formatNotebookAmount(estimatedPrize)}</strong></span></section>
        <button type="button" className="record-save-button" onClick={saveRecord}>新增紀錄</button>
      </section> : null}

      {view === "settings" ? <section className="record-settings">
        <header className="record-page-header"><button type="button" onClick={() => leaveSettings(() => setView("list"))}><ChevronLeftIcon />返回列表</button><div className="record-settings-heading"><strong>設定</strong><button type="button" data-selected={settingsEditMode} onClick={() => setSettingsEditMode(true)}>編輯</button></div></header>
        <div className="record-lottery-tabs">{LOTTERIES.map((item) => <button type="button" data-selected={settingsLottery === item} onClick={() => setSettingsLottery(item)} key={item}>{item}</button>)}</div>
        {settingsDraft[settingsLottery].tags.map((tag, index) => <section className="panel tag-setting-card" data-tag-setting-index={index} key={index}>
          <header data-editing={settingsEditMode}>
            {settingsEditMode ? <button type="button" className="tag-drag-handle" aria-label={`拖曳調整${tag.name}順序`} onPointerDown={(event) => beginTagDrag(event, index)} onPointerMove={moveTagDrag} onPointerUp={endTagDrag} onPointerCancel={endTagDrag}><span aria-hidden="true">⠿</span></button> : null}
            {["單號", "二星", "三星", "四星"].includes(tag.name) || !settingsEditMode ? <strong>{tag.name}</strong> : <input aria-label="玩法名稱" value={tag.name} onFocus={() => { editingTagName.current = tag.name; }} onChange={(event) => updateTag(index, { name: event.target.value })} onBlur={() => { if (tag.name !== editingTagName.current && !window.confirm(`確定將「${editingTagName.current}」修改為「${tag.name}」？`)) updateTag(index, { name: editingTagName.current }); }} />}
            {settingsEditMode ? <button type="button" className="tag-delete-button" aria-label={`刪除${tag.name}`} onClick={() => deleteSettingsTag(index, tag.name)}><TrashIcon /></button> : null}
          </header>
          <div className="tag-setting-fields">
            <label>成本模式<div className="select-box native-select tag-cost-mode-select"><select value={String(tag.costMode) === "固定成本模式" ? "固定成本" : tag.costMode} onChange={(event) => updateTag(index, { costMode: event.target.value as CostMode })}><option>依照碰數</option><option>固定成本</option></select><ChevronDownIcon /></div></label>
            {String(tag.costMode) === "固定成本" || String(tag.costMode) === "固定成本模式"
              ? <>
                  <label>1組成本<input type="number" min="1" max="9999999" value={tag.fixedCost || ""} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateTagNumber(index, "fixedCost", event.target.value)} onBlur={() => finalizeTagNumber(index, "fixedCost", tag.fixedCost)} /></label>
                  <label>中1組獎金<input type="number" min="1" max="9999999" value={tag.prizePerBet || ""} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateTagNumber(index, "prizePerBet", event.target.value)} onBlur={() => finalizeTagNumber(index, "prizePerBet", tag.prizePerBet)} /></label>
                </>
              : <>
                  <label>碰數<input type="number" min="1" max="9999999" value={tag.defaultBets || ""} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateTagNumber(index, "defaultBets", event.target.value)} onBlur={() => finalizeTagNumber(index, "defaultBets", tag.defaultBets)} /></label>
                  <label>1碰成本<input type="number" min="1" max="9999999" value={tag.costPerBet || ""} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateTagNumber(index, "costPerBet", event.target.value)} onBlur={() => finalizeTagNumber(index, "costPerBet", tag.costPerBet)} /></label>
                  <label>中1碰獎金<input type="number" min="1" max="9999999" value={tag.prizePerBet || ""} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateTagNumber(index, "prizePerBet", event.target.value)} onBlur={() => finalizeTagNumber(index, "prizePerBet", tag.prizePerBet)} /></label>
                </>}
          </div>
        </section>)}
        <section className="panel custom-tag-add"><input placeholder="新增自訂玩法" value={newTagName} onChange={(event) => setNewTagName(event.target.value)} /><button type="button" onClick={addSettingsTag}>新增</button></section>
        <section className="panel record-data-actions"><button type="button" onClick={resetSettings}>重置設定</button><button type="button" onClick={saveSettings}>儲存設定</button></section>
      </section> : null}
      {numberPicker && document.querySelector<HTMLElement>(".mobile-page") ? createPortal(<div className="filter-sheet-backdrop record-picker-backdrop" role="presentation" onClick={() => setNumberPicker(null)}><section className="filter-sheet record-number-picker" role="dialog" aria-modal="true" aria-labelledby="record-number-picker-title" onClick={(event) => event.stopPropagation()}><header><h2 id="record-number-picker-title">選取號碼</h2><button type="button" onClick={() => setNumberPicker(null)} aria-label="關閉"><Cross2Icon /></button></header><div className="record-number-grid">{Array.from({ length: maxNumber }, (_, index) => String(index + 1).padStart(2, "0")).map((number) => { const selected = numberPicker.type === "special" ? specialNumber === number : numberPicker.type === "numbers" ? parsedNumbers.includes(number) : parsedColumns[numberPicker.column ?? 0]?.includes(number); return <button type="button" data-selected={selected} onClick={() => togglePickedNumber(number)} key={number}>{number}</button>; })}</div><button type="button" className="record-picker-done" onClick={() => setNumberPicker(null)}>完成</button></section></div>, document.querySelector<HTMLElement>(".mobile-page")!) : null}
    </FeatureShell>
  );
}

export function NotesPage({ onNavigate }: { onNavigate: Navigate }) {
  const [lottery, setLottery] = useState<LotteryId>("今彩539");
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [issue, setIssue] = useState("第1234期");
  const [drawDate, setDrawDate] = useState("2026/08/04（二）");
  const [play, setPlay] = useState("三星");
  const [cost, setCost] = useState("NT$500");
  const [numberGroups, setNumberGroups] = useState([["03", "12", "21", "27", "35"]]);
  const [statusFilter, setStatusFilter] = useState<"全部" | "待開獎" | "已開獎">("全部");
  const [sortOrder, setSortOrder] = useState<"最新優先" | "最舊優先">("最新優先");
  const [selectedNote, setSelectedNote] = useState<number | null>(null);
  const [notes, setNotes] = useState([
    { id: 1, lottery: "今彩539" as LotteryId, issue: "第1234期", date: "2026/08/04（二）", play: "三星", groups: [["03", "12", "21", "27", "35"]], status: "待開獎" as const, cost: 500, prize: "待開獎", amount: 0, drawNumbers: [] as string[], matchedNumbers: [] as string[] },
    { id: 2, lottery: "今彩539" as LotteryId, issue: "第1233期", date: "2026/08/03（一）", play: "三星", groups: [["03", "12", "18", "27", "35"]], status: "已開獎" as const, cost: 500, prize: "三星獎", amount: 1000, drawNumbers: ["03", "12", "18", "27", "35"], matchedNumbers: ["03", "12", "18"] },
    { id: 3, lottery: "今彩539" as LotteryId, issue: "第1232期", date: "2026/08/02（日）", play: "四星", groups: [["05", "11", "17", "22", "31"]], status: "已開獎" as const, cost: 500, prize: "未中獎", amount: 0, drawNumbers: ["02", "09", "18", "26", "34"], matchedNumbers: [] as string[] },
  ]);
  const weekRange = useMemo(() => {
    const current = new Date();
    const monday = new Date(current.getFullYear(), current.getMonth(), current.getDate());
    const day = monday.getDay();
    monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const format = (date: Date) => `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
    return `${format(monday)}－${format(sunday)}`;
  }, []);

  const summary = useMemo(() => {
    const current = new Date();
    const monday = new Date(current.getFullYear(), current.getMonth(), current.getDate());
    const day = monday.getDay();
    monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    const weeklyNotes = notes.filter((note) => {
      const match = note.date.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
      if (!match) return false;
      const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      return date >= monday && date <= sunday;
    });
    const totalCost = weeklyNotes.reduce((sum, note) => sum + note.cost, 0);
    const confirmedPrize = weeklyNotes.filter((note) => note.status === "已開獎").reduce((sum, note) => sum + note.amount, 0);
    return {
      totalCost,
      confirmedPrize,
      difference: confirmedPrize - totalCost,
      drawn: weeklyNotes.filter((note) => note.status === "已開獎").length,
      pending: weeklyNotes.filter((note) => note.status === "待開獎").length,
    };
  }, [notes]);

  const formatMoney = (value: number, signed = false) => {
    if (value === 0) return "NT$0";
    const prefix = signed && value > 0 ? "+" : "";
    return `${prefix}${value < 0 ? "-" : ""}NT$${Math.abs(value).toLocaleString("en-US")}`;
  };

  const visibleNotes = useMemo(() => {
    const filtered = statusFilter === "全部" ? notes : notes.filter((note) => note.status === statusFilter);
    return sortOrder === "最新優先" ? filtered : [...filtered].reverse();
  }, [notes, sortOrder, statusFilter]);

  const switchLottery = (nextLottery: LotteryId) => {
    setLottery(nextLottery);
    setIssue("");
    setDrawDate("");
    setNumberGroups([["", "", "", "", ""]]);
  };

  const updateNumber = (groupIndex: number, numberIndex: number, value: string) => {
    setNumberGroups((groups) => groups.map((group, currentGroupIndex) =>
      currentGroupIndex === groupIndex
        ? group.map((number, currentNumberIndex) => currentNumberIndex === numberIndex ? value.replace(/\D/g, "").slice(0, 2) : number)
        : group,
    ));
  };

  const saveNote = () => {
    setNotes((current) => [{
      id: Date.now(), lottery, issue: issue || "第—期", date: drawDate || "—", play,
      groups: numberGroups, status: "待開獎" as const,
      cost: Number(cost.replace(/[^\d]/g, "")) || 0,
      prize: "待開獎", amount: 0, drawNumbers: [] as string[], matchedNumbers: [] as string[],
    }, ...current]);
  };

  const detail = selectedNote === null ? null : notes.find((note) => note.id === selectedNote) ?? null;
  if (detail) {
    const difference = detail.amount - detail.cost;
    const detailRows = [
      ["彩種", detail.lottery], ["期數", detail.issue], ["日期", detail.date], ["玩法", detail.play],
      ["投注號碼", detail.groups.map((group) => group.join("　")).join(" ／ ")],
      ["開獎號碼", detail.status === "待開獎" ? "待開獎" : detail.drawNumbers.join("　")],
      ["命中號碼", detail.status === "待開獎" ? "待開獎" : (detail.matchedNumbers.join("　") || "無")],
      ["紀錄成本", formatMoney(detail.cost)], ["獎金名稱", detail.prize],
      ["實際獎金", detail.status === "待開獎" ? "待開獎" : formatMoney(detail.amount)],
      ["金額差額", detail.status === "待開獎" ? "待開獎" : formatMoney(difference, true)], ["紀錄狀態", detail.status],
    ];
    return (
      <main className="feature-screen note-detail-screen">
        <BrandHeader title="記事詳細" onBack={() => setSelectedNote(null)} />
        <div className="feature-body">
          <section className="panel note-detail-card">
            {detailRows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </section>
          <button type="button" className="delete-note-button" onClick={() => { setNotes((current) => current.filter((note) => note.id !== detail.id)); setSelectedNote(null); }}><TrashIcon />刪除紀錄</button>
        </div>
      </main>
    );
  }

  return (
    <FeatureShell title="記事" onNavigate={onNavigate} active="快捷" compactHeader className="notes-screen">
      <section className="panel weekly-summary">
        <header>
          <h2>本週紀錄</h2>
          <span>{weekRange}</span>
          <button
            type="button"
            className="summary-collapse"
            onClick={() => setSummaryExpanded((current) => !current)}
            aria-label={summaryExpanded ? "收合本週紀錄" : "展開本週紀錄"}
            aria-expanded={summaryExpanded}
          ><ChevronDownIcon data-expanded={summaryExpanded} /></button>
        </header>
        <div hidden={!summaryExpanded}>
          <article><span>紀錄成本</span><strong>{formatMoney(summary.totalCost)}</strong></article>
          <article><span>已確認獎金</span><strong>{formatMoney(summary.confirmedPrize)}</strong></article>
          <article className="weekly-difference"><span>金額差額</span><strong>{formatMoney(summary.difference, true)}</strong></article>
          <article><span>已開獎</span><strong>{summary.drawn}</strong></article>
          <article><span>待開獎</span><strong>{summary.pending}</strong></article>
        </div>
      </section>
      <section className="panel note-form">
        <header><SectionTitle>新增投注紀錄</SectionTitle><button type="button"><GearIcon />紀錄設定<ChevronRightIcon /></button></header>
        <fieldset className="note-form-section"><legend>開獎資料</legend>
          <label className="note-full-field"><span>彩種</span><LotteryLogoTabs selected={lottery} onChange={switchLottery} /></label>
          <div className="note-two-fields">
            <label><span>期數</span><input value={issue} inputMode="numeric" onChange={(event) => setIssue(event.target.value.replace(/\D/g, ""))} placeholder="期數" /></label>
            <label><span>日期</span><div className="date-input"><input value={drawDate} onChange={(event) => setDrawDate(event.target.value)} placeholder="日期" /><CalendarIcon /></div></label>
          </div>
        </fieldset>
        <fieldset className="note-form-section"><legend>投注資料</legend>
          <div className="note-two-fields">
            <label><span>玩法</span><div className="select-box native-select"><select value={play} onChange={(event) => setPlay(event.target.value)}><option>三星</option><option>四星</option></select><ChevronDownIcon /></div></label>
            <label><span>紀錄成本</span><input value={cost} onChange={(event) => setCost(event.target.value.replace(/\D/g, ""))} inputMode="numeric" /></label>
          </div>
        </fieldset>
        <fieldset className="note-form-section note-number-section"><legend>投注號碼</legend>
          {numberGroups.map((group, groupIndex) => <div className="note-number-group" key={groupIndex}><span>{numberGroups.length > 1 ? `第${groupIndex + 1}組` : "投注號碼"}</span><div>{group.map((number, numberIndex) => <input aria-label={`第${groupIndex + 1}組投注號碼${numberIndex + 1}`} value={number} onChange={(event) => updateNumber(groupIndex, numberIndex, event.target.value)} key={numberIndex} />)}</div></div>)}
          <div className="note-number-actions"><button type="button" onClick={() => setNumberGroups((groups) => [...groups, ["", "", "", "", ""]])}><PlusIcon />新增一組</button><button type="button" disabled={numberGroups.length > 1} onClick={() => setNumberGroups([["", "", "", "", ""]])}><TrashIcon />清除</button></div>
        </fieldset>
        <fieldset className="note-form-section"><legend>結果資料</legend>
          <div className="note-two-fields"><label><span>獎金名稱</span><input value="待開獎" readOnly /></label><label><span>實際獎金</span><input value="待開獎" readOnly /></label></div>
        </fieldset>
        <button type="button" className="save-note-button" onClick={saveNote}>儲存紀錄</button>
      </section>
      <div className="note-filters"><span>狀態</span>{(["全部", "待開獎", "已開獎"] as const).map((status) => <button type="button" data-selected={statusFilter === status} onClick={() => setStatusFilter(status)} key={status}>{status}</button>)}<span>排序</span><button type="button" className="note-sort-button" onClick={() => setSortOrder((current) => current === "最新優先" ? "最舊優先" : "最新優先")}>{sortOrder}<ChevronDownIcon /></button></div>
      <section className="notes-list">
        <h2>已建立紀錄</h2>
        {visibleNotes.map((note) => <button type="button" className="panel note-card" onClick={() => setSelectedNote(note.id)} key={note.id}>
          <header><strong>{note.issue}</strong><span>{note.date}</span><em data-status={note.status}>{note.status}</em><ChevronRightIcon /></header>
          <div className="note-record-main"><span>彩種<strong>{note.lottery}</strong></span><span>玩法<strong>{note.play}</strong></span><span className="note-record-numbers">投注號碼<b>{note.groups[0].map((number) => <i key={number}>{number}</i>)}</b></span></div>
          <div className="note-record-result"><span>紀錄成本<strong>{formatMoney(note.cost)}</strong></span><span>獎金名稱<strong>{note.prize}</strong></span><span>實際獎金<strong>{note.status === "待開獎" ? "待開獎" : formatMoney(note.amount)}</strong></span>{note.status === "已開獎" ? <span className="note-difference">金額差額<strong>{formatMoney(note.amount - note.cost, true)}</strong></span> : null}</div>
        </button>)}
      </section>
    </FeatureShell>
  );
}

function Toggle({ checked, onChange, disabled = false }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return <button type="button" className="toggle" data-checked={checked} disabled={disabled} onClick={onChange}><span /></button>;
}

export function NotificationsPage({ onNavigate }: { onNavigate: Navigate }) {
  const lotteries = ["今彩539", "天天樂", "六合彩", "大樂透"] as const;
  const matrixStatuses = ["啟動", "聚合", "共振", "臨界"] as const;
  const initial = useMemo(() => ({
    bet: true, result: true, win: true, status: true, card: true, collision: false, system: true, expiry: true,
  }), []);
  const [settings, setSettings] = useState(initial);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({
    result: ["今彩539", "天天樂", "六合彩", "大樂透"],
    win: ["彩種通知"],
    card: ["今彩539", "天天樂", "六合彩", "大樂透"],
    system: ["維護", "更新"],
    expiry: ["提前1日", "提前3日", "提前7日"],
  });
  const [betTimes, setBetTimes] = useState<Record<string, [string, string]>>(
    Object.fromEntries(lotteries.map((lottery) => [lottery, ["", ""]])) as Record<string, [string, string]>,
  );
  const [statusOptions, setStatusOptions] = useState<Record<string, string[]>>(
    Object.fromEntries(lotteries.map((lottery) => [lottery, [...matrixStatuses]])),
  );
  const [collisionOptions, setCollisionOptions] = useState<Record<string, string[]>>(
    Object.fromEntries(lotteries.map((lottery) => [lottery, ["獨碰二星", "獨碰三星"]])),
  );
  const [activeSettings, setActiveSettings] = useState<string | null>(null);
  const betTimeOptions: Record<(typeof lotteries)[number], string[]> = {
    "今彩539": ["16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "19:45", "20:00", "20:10", "20:20", "20:25"],
    "大樂透": ["16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "19:45", "20:00", "20:10", "20:20", "20:25"],
    "六合彩": ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "20:45", "21:00", "21:10", "21:20", "21:25"],
    "天天樂": ["05:00", "05:30", "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "08:45", "09:00", "09:10", "09:20", "09:25"],
  };
  const rows = [
    ["bet", "選號提醒", "", "/resources/notify-bet.png"],
    ["result", "開獎結果", "今彩539、天天樂、六合彩、大樂透", "/resources/notify-result.png"],
    ["win", "中獎通知", "彩種通知、獎金通知", "/resources/notify-win.png"],
    ["status", "Matrix 狀態", "", "/resources/notify-status.png"],
    ["card", "Matrix 牌單", "今彩539、天天樂、六合彩、大樂透", "/resources/notify-card.png"],
    ["collision", "Matrix 摘星", "", "/resources/notify-collision.png"],
    ["expiry", "Matrix Pro", "提前1日、提前3日、提前7日", "/resources/notify-expiry.png"],
    ["system", "系統通知", "維護、更新", "/resources/notify-system.png"],
  ] as const;
  const toggleOption = (key: string, option: string) => {
    if (key === "collision") return;
    setSelectedOptions((current) => {
      const selected = current[key] ?? [];
      return {
        ...current,
        [key]: key === "win"
          ? [option]
          : selected.includes(option)
            ? selected.filter((item) => item !== option)
            : [...selected, option],
      };
    });
  };
  const toggleNestedOption = (setter: React.Dispatch<React.SetStateAction<Record<string, string[]>>>, lottery: string, option: string) => {
    setter((current) => ({
      ...current,
      [lottery]: current[lottery]?.includes(option)
        ? current[lottery].filter((item) => item !== option)
        : [...(current[lottery] ?? []), option],
    }));
  };
  const activeRow = rows.find(([key]) => key === activeSettings);
  const renderSettings = (key: string, title: string, subtitle: string) => {
    const options = subtitle ? subtitle.split("、") : [];
    if (key === "bet") return <div className="notification-lottery-settings notification-time-settings">{lotteries.map((lottery) => <div className="notification-lottery-row" key={lottery}><strong>{lottery}</strong><div>{([0, 1] as const).map((index) => <div className="select-box native-select" key={index}><select aria-label={`${lottery}時間${index + 1}`} value={betTimes[lottery][index]} onChange={(event) => setBetTimes((current) => ({ ...current, [lottery]: index === 0 ? [event.target.value, current[lottery][1]] : [current[lottery][0], event.target.value] }))}><option value="">選擇時間</option>{betTimeOptions[lottery].map((time) => <option value={time} key={time}>{time.replace(":", "：")}</option>)}</select></div>)}</div></div>)}</div>;
    if (key === "status") return <div className="notification-lottery-settings notification-status-settings">{lotteries.map((lottery) => <div className="notification-lottery-row" key={lottery}><strong>{lottery}</strong><div>{matrixStatuses.map((option) => <label className="notification-choice" key={option}><input type="checkbox" checked={statusOptions[lottery]?.includes(option)} onChange={() => toggleNestedOption(setStatusOptions, lottery, option)} /><span>{option}</span></label>)}</div></div>)}</div>;
    if (key === "collision") return <div className="notification-lottery-settings">{lotteries.map((lottery) => <fieldset className="notification-lottery-row" key={lottery}><legend>{lottery}</legend><div>{["獨碰二星", "獨碰三星"].map((option) => <label className="notification-choice" key={option}><input type="checkbox" checked={collisionOptions[lottery]?.includes(option)} onChange={() => toggleNestedOption(setCollisionOptions, lottery, option)} /><span>{option}</span></label>)}</div></fieldset>)}</div>;
    return <div className="notification-options" role={key === "win" ? "radiogroup" : "group"} aria-label={`${title}選項`}>{options.map((option) => <label className="notification-choice" key={option}><input type={key === "win" ? "radio" : "checkbox"} name={key === "win" ? "win-notification" : undefined} checked={selectedOptions[key]?.includes(option)} onChange={() => toggleOption(key, option)} /><span>{option}</span></label>)}</div>;
  };
  return (
    <FeatureShell title="通知" onNavigate={onNavigate} active="通知" className="notifications-screen" compactHeader>
      <div className="notification-list">
        {rows.map(([key, title, subtitle, icon]) => {
          return <article className="notification-row" key={key}>
            <div className="notification-heading">
              <div className="notification-icon"><img src={icon} alt="" /></div>
              <div className="notification-title"><h2>{key === "status" || key === "card" || key === "collision" ? <em>Matrix Pro</em> : null}<span>{title}</span></h2></div>
              <div className="notification-actions"><button type="button" disabled={!settings[key] || key === "collision"} onClick={() => setActiveSettings(key)}>設定選項</button><Toggle checked={settings[key]} disabled={key === "collision"} onChange={() => setSettings({ ...settings, [key]: !settings[key] })} /></div>
            </div>
          </article>;
        })}
      </div>
      {activeRow && document.querySelector<HTMLElement>(".mobile-page") ? createPortal(<div className="filter-sheet-backdrop notification-modal-backdrop" role="presentation" onClick={() => setActiveSettings(null)}><section className="filter-sheet notification-modal" role="dialog" aria-modal="true" aria-labelledby="notification-settings-title" onClick={(event) => event.stopPropagation()}><header><h2 id="notification-settings-title">{activeRow[1]}</h2><button type="button" onClick={() => setActiveSettings(null)} aria-label="關閉"><Cross2Icon /></button></header><div className="notification-modal-content">{renderSettings(activeRow[0], activeRow[1], activeRow[2])}</div><button type="button" className="notification-modal-done" onClick={() => setActiveSettings(null)}>完成</button></section></div>, document.querySelector<HTMLElement>(".mobile-page")!) : null}
    </FeatureShell>
  );
}

export function ProfilePage({ onNavigate }: { onNavigate: Navigate }) {
  const menuGroups: Array<{ title: string; items: Array<[string, ScreenId]> }> = [
    { title: "會員相關", items: [["付款紀錄", "payment-history"]] },
    { title: "客服與支援", items: [["聯絡客服", "merchant-info"], ["問題回報", "problem-report"], ["商務合作", "business-cooperation"]] },
    { title: "推廣相關", items: [["我的推薦碼/啟動碼", "activation-code"], ["優惠活動", "promotions"]] },
    { title: "系統相關", items: [["版本資訊", "version-info"], ["更新紀錄", "update-history"]] },
    { title: "法律資訊", items: [["關於 樂彩 Matrix", "about-matrix"], ["服務內容與使用說明", "service-info"], ["會員服務條例", "member-terms"], ["隱私權政策", "privacy-policy"], ["退款規範", "refund-policy"], ["聲明與免責事項", "disclaimer"]] },
  ];

  return (
    <FeatureShell title="我的" onNavigate={onNavigate} active="我的" className="profile-screen" compactHeader>
      <section className="panel profile-card">
        <div className="profile-avatar"><span>LINE</span></div>
        <div className="profile-copy"><h2>樂彩玩家</h2><p>LINE ID：lottery_matrix</p></div>
        <div className="profile-watermark" aria-hidden="true">M</div>
        <button type="button" className="profile-logout">登出</button>
      </section>
      <section className="panel subscription-status-card">
        <SectionTitle>目前訂閱狀態</SectionTitle>
        <div className="subscription-status-content">
          <div className="subscription-crown">♛</div>
          <div><span>目前方案</span><strong>Matrix Pro 年方案</strong><p>享有所有 Matrix Pro 功能</p></div>
          <div><span>訂閱到期日</span><strong>2027/07/23</strong><p>剩餘 365 天</p></div>
        </div>
        <button type="button" className="subscription-entry" onClick={() => onNavigate("pro-plans")}>
          <span>會員方案／收費標準</span><ChevronRightIcon />
        </button>
      </section>
      {menuGroups.map((group) => <ProfileMenu title={group.title} items={group.items} onNavigate={onNavigate} key={group.title} />)}
    </FeatureShell>
  );
}

function ProfileMenu({ title, items, onNavigate }: { title: string; items: Array<[string, ScreenId]>; onNavigate: Navigate }) {
  return (
    <section className="panel profile-menu">
      {title ? <SectionTitle>{title}</SectionTitle> : null}
      <div className="profile-menu-rows">
        {items.map(([label, screen]) => (
          <button type="button" key={screen} onClick={() => onNavigate(screen)}>
            <span>{label}</span><ChevronRightIcon />
          </button>
        ))}
      </div>
    </section>
  );
}

function ProfileDetailShell({ title, children, onNavigate, className = "", hidePageTitle = false }: { title: string; children?: React.ReactNode; onNavigate: Navigate; className?: string; hidePageTitle?: boolean }) {
  return (
    <FeatureShell title={title} onNavigate={onNavigate} active="我的" backTarget="profile" compactHeader className={`profile-detail-screen ${className}`.trim()} hidePageTitle={hidePageTitle}>
      {children}
    </FeatureShell>
  );
}

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="panel detail-card"><h2>{title}</h2><div>{children}</div></section>;
}

function DetailList({ items }: { items: string[] }) {
  return <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}

function SubscriptionManagementPage({ onNavigate }: { onNavigate: Navigate }) {
  return (
    <ProfileDetailShell title="管理訂閱" onNavigate={onNavigate}>
      <DetailCard title="目前方案"><p>Matrix Pro 年方案</p></DetailCard>
      <DetailCard title="訂閱到期日"><p>2027/07/23</p></DetailCard>
      <button type="button" className="confirm-payment" onClick={() => onNavigate("pro-plans")}>會員方案／收費標準</button>
    </ProfileDetailShell>
  );
}

function PaymentHistoryPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="付款紀錄" onNavigate={onNavigate}><DetailCard title="付款紀錄"><p>目前沒有付款紀錄。</p></DetailCard></ProfileDetailShell>;
}

function ProPlansPage({ onNavigate }: { onNavigate: Navigate }) {
  const plans = [
    { name: "月費方案", price: "$1,880", days: 30, icons: [], features: ["Matrix 狀態 - 進階資訊", "Matrix 狀態 - 自訂觸發條件", "Matrix 探索 - 十三期", "Matrix 探索 - 完整範圍", "Matrix Pro - 專屬推播通知"] },
    { name: "季費方案", price: "$4,580", days: 90, icons: [{ src: "/assets/matrix-explore/tianyan.jpg", alt: "天衍" }], features: ["Matrix 天衍 - 使用權限", "Matrix 狀態 - 進階資訊", "Matrix 狀態 - 自訂觸發條件", "Matrix 探索 - 十三期", "Matrix 探索 - 完整範圍", "Matrix Pro - 專屬推播通知"] },
    { name: "年費方案", price: "$16,800", days: 365, icons: [{ src: "/assets/matrix-explore/tianyan.jpg", alt: "天衍" }, { src: "/assets/matrix-explore/tiangong.jpg", alt: "天工" }], features: ["Matrix 天衍 - 使用權限", "Matrix 天工 - 使用權限", "Matrix 狀態 - 進階資訊", "Matrix 狀態 - 自訂觸發條件", "Matrix 探索 - 十三期", "Matrix 探索 - 完整範圍", "Matrix Pro - 專屬推播通知"] },
  ] as const;
  const carouselPlans = [plans[2], ...plans, plans[0]] as const;
  const carouselRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedPlan, setSelectedPlan] = useState(0);
  const [autoRenew, setAutoRenew] = useState(false);
  const selected = plans[selectedPlan];
  const scrollToCarouselPosition = (position: number, behavior: ScrollBehavior = "auto") => {
    const carousel = carouselRef.current;
    const card = carousel?.querySelector<HTMLElement>(`[data-carousel-position="${position}"]`);
    if (!carousel || !card) return;
    const left = card.offsetLeft - (carousel.clientWidth - card.clientWidth) / 2;
    carousel.scrollTo({ left, behavior });
  };
  useEffect(() => {
    const frame = requestAnimationFrame(() => scrollToCarouselPosition(1));
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => () => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
  }, []);
  const handleCarouselScroll = () => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const center = carousel.scrollLeft + carousel.clientWidth / 2;
    const cards = Array.from(carousel.querySelectorAll<HTMLElement>(".plan-card"));
    const nearest = cards.reduce((current, card) => {
      const cardCenter = card.offsetLeft + card.clientWidth / 2;
      const currentCenter = current.offsetLeft + current.clientWidth / 2;
      return Math.abs(cardCenter - center) < Math.abs(currentCenter - center) ? card : current;
    }, cards[0]);
    if (!nearest) return;
    setSelectedPlan(Number(nearest.dataset.planIndex));
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      const position = Number(nearest.dataset.carouselPosition);
      if (position === 0) scrollToCarouselPosition(plans.length);
      if (position === plans.length + 1) scrollToCarouselPosition(1);
    }, 140);
  };
  const renewedDate = useMemo(() => {
    const date = new Date("2027-07-23T00:00:00");
    date.setDate(date.getDate() + selected.days);
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
  }, [selected.days]);
  const handleAutoRenewChange = () => {
    const nextState = !autoRenew;
    if (!window.confirm(`確定${nextState ? "開啟" : "關閉"}自動續訂？`)) return;
    setAutoRenew(nextState);
  };
  const handlePayment = () => {
    if (!window.confirm(`確定以${selected.name}進行付款？`)) return;
  };
  return (
    <ProfileDetailShell title="Matrix Pro 會員方案與收費標準" onNavigate={onNavigate} className="pro-plans-screen">
      <div className="plan-carousel" aria-label="Matrix Pro 會員方案" ref={carouselRef} onScroll={handleCarouselScroll}>
        {carouselPlans.map((plan, position) => {
          const planIndex = position === 0 ? plans.length - 1 : position === plans.length + 1 ? 0 : position - 1;
          return <article className={`plan-card${plan.icons.length > 0 ? " plan-card--with-tools" : ""}`} data-current={selectedPlan === planIndex} data-plan-index={planIndex} data-carousel-position={position} key={`${plan.name}-${plan.days}-${position}`}>
          <div className="plan-card-heading">
            <span className="plan-name">{plan.name}</span>
            {plan.icons.length > 0 ? <div className={`plan-tool-icons${plan.icons.length > 1 ? " plan-tool-icons--stacked" : ""}`} aria-label={`${plan.name}開放工具`}>
              {plan.icons.map((icon) => <img src={icon.src} alt={icon.alt} key={icon.alt} />)}
            </div> : null}
          </div>
          <strong>{plan.price}<small>／{plan.days}天</small></strong>
          <h2>Matrix Pro 權限：</h2>
          <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
        </article>})}
      </div>
      <section className="panel renewal-card">
        <h2>管理訂閱／續訂方案</h2>
        <dl>
          <div><dt>已選方案：</dt><dd>{selected.name}</dd></div>
          <div><dt>付款金額：</dt><dd>{selected.price}</dd></div>
          <div><dt>新增效期：</dt><dd>{selected.days}天</dd></div>
          <div><dt>續訂後到期日：</dt><dd>{renewedDate}</dd></div>
        </dl>
        <div className="auto-renew-setting">
          <label>
            <input type="checkbox" checked={autoRenew} onChange={handleAutoRenewChange} />
            <span>自動續訂</span>
          </label>
          <strong data-active={autoRenew}>{autoRenew ? "目前狀態：開啟" : "目前狀態：關閉"}</strong>
        </div>
        <p className="auto-renew-note">到期後將依目前方案自動扣款續訂。</p>
      </section>
      <button type="button" className="confirm-payment" onClick={handlePayment}>確定付款</button>
      <p className="payment-note">點擊 確定付款 將跳轉付款頁面</p>
    </ProfileDetailShell>
  );
}

function AboutMatrixPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="關於 樂彩 Matrix" onNavigate={onNavigate}><section className="panel about-matrix-card"><p className="about-welcome">歡迎使用 樂彩 Matrix。</p><p>樂彩 Matrix 致力於提供清晰、直覺且易於使用的開獎資料查詢與分析服務，協助使用者快速查閱公開資訊、整理歷史數據，並透過多項分析功能，提升資料檢視效率。</p><p>我們持續優化介面設計與操作體驗，整合各項分析工具，讓不同需求的使用者都能以更簡單、更流暢的方式使用各項功能。</p><h2>我們的理念</h2><p>我們重視資料整理、操作效率與使用體驗，持續改善介面細節與功能品質，希望提供穩定、且容易使用的分析工具，讓每一次資料查詢都更加便利。</p><p className="about-thanks">感謝您對 樂彩 Matrix 的支持與使用！</p><div className="about-brand-info"><p><span>品牌名稱：</span>樂彩 Matrix</p><p>Copyright © 2026 樂彩 Matrix. All Rights Reserved.</p></div></section></ProfileDetailShell>;
}

function CollapsibleRuleCard({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  const contentId = `referral-rule-${title}`;
  return <section className="panel referral-rule-card"><button type="button" className="referral-rule-toggle" aria-expanded={open} aria-controls={contentId} onClick={onToggle}><span>{title}</span><ChevronRightIcon aria-hidden="true" /></button>{open ? <div className="referral-rule-content" id={contentId}>{children}</div> : null}</section>;
}

function ActivationCodePage({ onNavigate }: { onNavigate: Navigate }) {
  const [referralCode, setReferralCode] = useState("");
  const [activationCode, setActivationCode] = useState("");
  const [openRules, setOpenRules] = useState({ recognition: false, reward: false, supplement: false });
  const [activationInstructionsOpen, setActivationInstructionsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resultState, setResultState] = useState<"idle" | "success" | ActivationRedemptionErrorCode>("idle");
  const activationRequestRevision = useRef(0);
  const referralSuccessCount = 0;
  const myReferralCode = "—";

  function toggleRule(rule: keyof typeof openRules) {
    setOpenRules((current) => ({ ...current, [rule]: !current[rule] }));
  }

  function copyReferralCode() {
    if (myReferralCode !== "—") void navigator.clipboard.writeText(myReferralCode);
  }

  useEffect(() => () => {
    activationRequestRevision.current += 1;
  }, []);

  async function handleActivation() {
    if (submitting) return;

    const requestRevision = activationRequestRevision.current + 1;
    activationRequestRevision.current = requestRevision;

    setSubmitting(true);
    setResultState("idle");

    try {
      await redeemActivationCode(activationCode);
      if (activationRequestRevision.current !== requestRevision) return;
      setActivationCode("");
      setResultState("success");
    } catch (error) {
      if (activationRequestRevision.current !== requestRevision) return;
      setResultState(isActivationRedemptionError(error) ? error.code : "ACTIVATION_CODE_REDEMPTION_FAILED");
    } finally {
      if (activationRequestRevision.current === requestRevision) setSubmitting(false);
    }
  }

  return (
    <ProfileDetailShell title="我的推薦碼/啟動碼" onNavigate={onNavigate} className="activation-code-screen" hidePageTitle>
      <section className="panel referral-summary-card">
        <h2>我的推薦碼</h2>
        <p className="referral-code-label">推薦碼：<strong className="referral-code-value">{myReferralCode}</strong></p>
        <p className="referral-success-count">推薦成功 {referralSuccessCount} 人</p>
        <div className="referral-primary-actions"><button type="button" className="gold-button" onClick={copyReferralCode}>複製推薦碼</button><button type="button" className="gold-button">邀請好友</button></div>
      </section>
      <section className="panel referral-input-card"><h2>輸入推薦碼</h2><div className="code-entry-block"><label htmlFor="referral-code">輸入推薦碼</label><input id="referral-code" value={referralCode} onChange={(event) => setReferralCode(event.target.value)} aria-label="推薦碼" /><button type="button" className="gold-button">確認</button></div></section>
      <CollapsibleRuleCard title="推薦成功認定" open={openRules.recognition} onToggle={() => toggleRule("recognition")}><DetailList items={["每個 LINE 帳號，僅能輸入一次推薦碼。", "輸入推薦碼的帳號，完成訂閱 Matrix Pro 月方案、季方案或年方案任一方案後，該筆推薦即計為「推薦成功」。", "若該筆訂閱後續發生退款、刷退或交易取消，該筆推薦成功將失效，推薦成功人數同步扣除，相關獎勵資格，將依最新推薦成功人數重新計算。"]} /></CollapsibleRuleCard>
      <CollapsibleRuleCard title="推薦成功獎勵" open={openRules.reward} onToggle={() => toggleRule("reward")}><DetailList items={["推薦成功滿 10 人：Matrix 探索期數 (七期) 開放日：每週二、五開放變為每週一、二、四、五。", "推薦成功滿 15 人：Matrix 探索期數 (七期)：永久開放。", "推薦成功滿 30 人：Matrix 探索範圍 (完整範圍)：由不開放變為每週二、五開放。", "推薦成功滿 50 人：Matrix 探索範圍 (完整範圍)：永久開放。"]} /></CollapsibleRuleCard>
      <CollapsibleRuleCard title="推薦獎勵補充規則" open={openRules.supplement} onToggle={() => toggleRule("supplement")}><DetailList items={["推薦獎勵不需本人訂閱 Matrix Pro。", "當達成對應的推薦成功人數門檻後，即可使用已解鎖的 Matrix 探索權限。", "若因退款、刷退或交易取消等情況，導致推薦成功人數低於原獎勵門檻：已取得的對應獎勵將同步取消。並依最新的推薦成功人數，重新計算資格與獎勵。", "樂彩 Matrix 保留活動內容、參加資格、獎勵內容、活動規則、資格認定、發放方式、終止、修改、解釋及最終決定之權利。"]} /></CollapsibleRuleCard>
      <section className="panel activation-card"><h2>啟動碼</h2><div className="code-entry-block" data-result-state={resultState} aria-busy={submitting}><label htmlFor="activation-code">輸入啟動碼</label><input id="activation-code" value={activationCode} onChange={(event) => setActivationCode(event.target.value)} aria-label="啟動碼" /><button type="button" className="gold-button" onClick={handleActivation} disabled={submitting}>確認</button></div></section>
      <CollapsibleRuleCard title="啟動碼使用說明" open={activationInstructionsOpen} onToggle={() => setActivationInstructionsOpen((current) => !current)}><ul><li>啟動碼以增加 Matrix Pro 訂閱天數為主要功能。</li><li>每組啟動碼只能成功使用一次。</li><li>啟動成功後，該組啟動碼立即標記為已使用。</li></ul></CollapsibleRuleCard>
    </ProfileDetailShell>
  );
}

function InviteFriendsPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="邀請好友" onNavigate={onNavigate}><DetailCard title="邀請好友"><p>推薦碼/邀請碼尚未提供。</p></DetailCard></ProfileDetailShell>;
}

function PromotionsPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="優惠活動" onNavigate={onNavigate}><DetailCard title="優惠活動"><p>目前沒有優惠活動。</p></DetailCard></ProfileDetailShell>;
}

function ServiceInfoPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="服務內容與使用說明" onNavigate={onNavigate}><DetailCard title="一、服務名稱"><p>樂彩 Matrix</p></DetailCard><DetailCard title="二、服務形式"><p>樂彩 Matrix 為可安裝於手機桌面的 PWA 服務。</p></DetailCard><DetailCard title="三、主要功能"><DetailList items={["Matrix Core", "　Matrix 探索", "　Matrix 天衍", "　Matrix 天工", "Matrix 狀態", "Matrix 同星", "號碼對照單", "連碰立柱計算機", "Matrix 牌單", "Matrix 指南", "歷史開獎號碼", "Matrix 筆記本"]} /></DetailCard><DetailCard title="四、支援彩種"><DetailList items={["今彩539", "天天樂", "六合彩", "大樂透"]} /></DetailCard><DetailCard title="五、使用方式"><p>使用者透過 LINE 登入後，可查看會員資訊、訂閱資訊及目前帳號可使用的功能。</p><p>不同會員狀態可使用的功能及權限，依目前帳號顯示為準。</p></DetailCard><DetailCard title="六、探索結果說明"><p>探索結果依歷史資料與所選條件產生，僅供參考，不代表中獎、獲利或任何結果之保證。</p></DetailCard><DetailCard title="七、Matrix Pro 說明"><p>Matrix Pro 為樂彩 Matrix 的付費訂閱方案，提供月方案、季方案及年方案。</p><p>使用者可自行選擇是否開啟自動續訂。</p><p>實際方案價格、訂閱期間、功能權限及目前可使用內容，依「Matrix Pro 方案與收費標準」及帳號顯示為準。</p></DetailCard></ProfileDetailShell>;
}

function RefundPolicyPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="退款規範" onNavigate={onNavigate}><DetailCard title="一、適用範圍"><p>本退款規範適用於樂彩 Matrix 提供的 Matrix Pro 付費方案。</p><p>Matrix Pro 提供單次訂閱及自動續訂方式，實際付款方式，依使用者訂閱時的選擇為準。</p></DetailCard><DetailCard title="二、自動續訂"><p>使用者可自行選擇是否開啟自動續訂。</p><p>開啟自動續訂後，系統將於目前訂閱方案到期時，依原訂閱方案及續訂當時顯示的價格自動扣款，並延長相對應的 Matrix Pro 訂閱期間。</p><p>使用者可於下一次扣款前，先行關閉自動續訂。關閉自動續訂後，已付款的訂閱期間仍可使用至到期日，期滿後不再自動扣款或續訂。</p><p>關閉自動續訂僅停止下一期扣款，不等同取消目前訂閱或申請退款。</p><p>自動續訂扣款成功後，視為一筆新的 Matrix Pro 訂閱交易；如需申請退款，依本退款規範辦理。</p></DetailCard><DetailCard title="三、七日解除權與數位服務"><p>Matrix Pro 為付款後，提供使用權限的數位服務。</p><p>若付款流程已事先告知，並取得使用者同意立即提供數位內容或線上服務，且服務已開始提供，依法得排除七日解除權，不適用七日無條件解除。</p></DetailCard><DetailCard title="四、可申請退款情形"><DetailList items={["重複付款。", "付款成功但 Matrix Pro 權限未開通。", "因 樂彩 Matrix 系統異常，致已購買的主要服務無法使用。", "其他依法應辦理退款的情形。"]} /></DetailCard><DetailCard title="五、不予退款情形"><DetailList items={["使用者已事先同意立即提供數位服務，且 Matrix Pro 權限已開通並開始使用，依法得排除七日解除權的情形。", "非屬本規範或法律規定應退款的情形。", "關閉自動續訂僅停止下一期扣款，不溯及已完成的當期訂閱交易。"]} /></DetailCard><DetailCard title="六、退款申請方式"><p>請寄送電子郵件至 <a href="mailto:Matrix1150801@gmail.com">Matrix1150801@gmail.com</a>，並提供會員帳號、付款日期、付款金額、訂單或交易資料及退款原因。</p></DetailCard><DetailCard title="七、退款處理"><p>收到申請後，將依付款紀錄、權限開通狀態及服務使用情形進行核對。</p><p>符合退款條件者，退款方式及實際入帳時間，將依原付款方式與金流服務商作業時間辦理。</p></DetailCard><DetailCard title="八、其他"><p>本規範如與中華民國法令的強制或禁止規定不同，依相關法令辦理。</p><p>樂彩 Matrix 保留退款申請資料核對、交易狀態確認及退款資格認定之權利；退款處理仍依中華民國相關法令及本退款規範辦理。</p></DetailCard></ProfileDetailShell>;
}

function MerchantInfoPage({ onNavigate }: { onNavigate: Navigate }) {
  return (
    <ProfileDetailShell title="聯絡客服" onNavigate={onNavigate}>
      <section className="panel support-contact-card">
        <h2>電子郵件</h2>
        <a href="mailto:Matrix1150801@gmail.com">Matrix1150801@gmail.com</a>
      </section>
    </ProfileDetailShell>
  );
}

function ProblemReportPage({ onNavigate }: { onNavigate: Navigate }) {
  return (
    <ProfileDetailShell title="問題回報" onNavigate={onNavigate}>
      <DetailCard title="回報方式"><p>請透過電子郵件回報使用時遇到的問題。</p><a href="mailto:Matrix1150801@gmail.com">Matrix1150801@gmail.com</a></DetailCard>
    </ProfileDetailShell>
  );
}

function BusinessCooperationPage({ onNavigate }: { onNavigate: Navigate }) {
  return (
    <ProfileDetailShell title="商務合作" onNavigate={onNavigate}>
      <DetailCard title="聯絡方式"><p>商務合作請透過電子郵件聯絡。</p><a href="mailto:Matrix1150801@gmail.com">Matrix1150801@gmail.com</a></DetailCard>
    </ProfileDetailShell>
  );
}

function VersionInfoPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="版本資訊" onNavigate={onNavigate}><DetailCard title="目前版本"><p>0.1.0</p></DetailCard></ProfileDetailShell>;
}

function UpdateHistoryPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="更新紀錄" onNavigate={onNavigate}><DetailCard title="2026/08/04"><p>調整「我的」頁面分類與排列順序。</p></DetailCard></ProfileDetailShell>;
}

function MemberTermsPage({ onNavigate }: { onNavigate: Navigate }) {
  const sections: Array<[string, React.ReactNode]> = [
    ["一、服務範圍", <p>樂彩 Matrix 提供 Matrix 分析、歷史資料查詢、號碼紀錄、計算工具、牌單及通知等功能。</p>],
    ["二、會員登入", <p>使用者透過 LINE 登入後使用會員功能。</p>],
    ["三、Matrix Pro 訂閱", <><p>Matrix Pro 提供月方案、季方案及年方案。</p><p>使用者可自行選擇是否開啟自動續訂。</p><p>開啟自動續訂後，系統將於目前方案到期時，依原訂閱方案自動續訂並扣款。</p><p>使用者可於方案到期前，先行關閉自動續訂；關閉之後，已付款的 Matrix Pro 仍可使用至到期日，期滿後不再自動續訂。</p></>],
    ["四、訂閱方案", <><DetailList items={["月方案：30 天，NT$1,880", "季方案：90 天，NT$4,580", "年方案：365 天，NT$16,800"]} /><p>以上價格，均為新臺幣含稅價格。</p></>],
    ["五、啟動碼", <><p>啟動碼用於增加 Matrix Pro 訂閱天數。</p><p>每組啟動碼只能成功使用一次。</p><p>啟動碼有效期限與訂閱期間分開計算。</p></>],
    ["六、服務內容", <p>不同會員狀態，可使用的功能及權限，依目前帳號顯示及系統判定為準。</p>],
    ["七、探索結果", <p>探索結果依歷史資料與所選條件產生，僅供參考，不代表中獎、獲利或任何結果之保證。</p>],
    ["八、退款", <p>退款申請及審核方式，依「退款規範」頁面公告內容辦理。</p>],
    ["九、個人資料", <p>會員資料的使用方式依「隱私權政策」頁面內容辦理。</p>],
    ["十、其他", <p>樂彩 Matrix 保留服務內容、功能權益、訂閱方案、活動內容、獎勵內容、活動規則、資格認定、發放方式、終止、修改、解釋及最終決定之權利。</p>],
  ];
  return <ProfileDetailShell title="會員服務條例" onNavigate={onNavigate}>{sections.map(([title, content]) => <DetailCard title={title} key={title}>{content}</DetailCard>)}</ProfileDetailShell>;
}

function PrivacyPolicyPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="隱私權政策" onNavigate={onNavigate}><DetailCard title="一、蒐集的資料"><DetailList items={["登入 LINE 所提供的帳號識別資料", "Matrix Pro 訂閱狀態", "訂閱到期日", "啟動碼使用紀錄", "推薦碼使用紀錄", "推薦成功人數", "通知設定"]} /></DetailCard><DetailCard title="二、使用目的"><DetailList items={["會員登入與帳號識別", "顯示會員及訂閱狀態", "Matrix Pro 啟用、續訂及權限管理", "提供使用者已選擇的功能", "推薦活動資格與獎勵管理", "系統通知與服務通知"]} /></DetailCard><DetailCard title="三、第三方服務"><p>目前已確認使用 LINE 登入。</p><p>實際金流服務商尚未確認，不得自行填寫藍新、綠界或其他業者名稱。</p></DetailCard><DetailCard title="四、資料使用範圍"><p>蒐集之資料，僅用於本政策所載之使用目的及提供樂彩 Matrix 服務，不會於未經使用者同意或法律另有規定之情況下，提供予第三方。</p></DetailCard><DetailCard title="五、資料安全"><p>樂彩 Matrix 將採取合理之安全措施保護會員資料，避免未經授權之存取、使用、修改或洩漏。</p></DetailCard><DetailCard title="六、隱私權政策調整"><p>樂彩 Matrix 保留修改本隱私權政策之權利，更新後將公布於本頁面，並自公告日起生效。</p></DetailCard></ProfileDetailShell>;
}

function DisclaimerPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="聲明與免責事項" onNavigate={onNavigate}><DetailCard title="一、服務性質"><p>樂彩 Matrix 提供公開的開獎資料查詢、歷史資料整理、比對、計算及分析工具。</p><p>本服務不提供任何中獎、獲利或特定結果之保證。</p></DetailCard><DetailCard title="二、資訊用途"><p>服務內呈現的資料、分析結果及探索結果僅供參考，不代表任何中獎、獲利或結果之保證。</p><p>使用者應自行判斷是否採用服務所提供的資訊。</p></DetailCard><DetailCard title="三、使用者決定"><p>使用者應自行決定如何使用服務內提供的資料、功能及分析結果，並自行承擔相關決定所產生的結果。</p></DetailCard><DetailCard title="四、資料差異"><p>如服務內資料與官方公布資料不同，請以官方公布資料為準。</p></DetailCard><DetailCard title="五、系統與服務"><p>樂彩 Matrix 不保證服務持續不中斷、完全無錯誤，或所有功能於任何時間皆可正常使用。</p><p>如因系統維護、更新、網路異常、第三方服務或其他原因造成服務中斷、延遲或資料顯示異常，將依實際情況處理。</p></DetailCard><DetailCard title="六、第三方服務"><p>本服務使用 LINE 登入、金流服務或其他第三方服務。</p><p>第三方服務之使用方式、資料處理及服務狀態，依各第三方服務提供者之規定辦理。</p></DetailCard><DetailCard title="七、責任範圍"><p>因使用或無法使用樂彩 Matrix 所提供的資料、功能、分析結果或第三方服務所產生的影響，應依實際情況及相關法令認定。</p></DetailCard><DetailCard title="八、內容調整"><p>樂彩 Matrix 得依服務實際運作需要調整功能、內容及相關說明。</p><p>如涉及會員權益或重要內容調整，將於服務內公告。</p></DetailCard><DetailCard title="九、最終說明"><p>本聲明與免責事項如與中華民國法令的強制或禁止規定不同，依相關法令辦理。</p><p>樂彩 Matrix 保留服務內容、功能說明、資料呈現、規則內容、修改、解釋及最終決定之權利。</p></DetailCard></ProfileDetailShell>;
}

export function MatrixStatusPage({ onNavigate }: { onNavigate: Navigate }) {
  const [lottery, setLottery] = useState<LotteryId>("今彩539");
  const [open, setOpen] = useState("臨界");
  const [openRoad, setOpenRoad] = useState<number | null>(null);
  const statuses = [
    ["臨界", "CRITICAL", "2 組", "極為罕見版路狀態", "orange"],
    ["共振", "RESONANCE", "3 組", "具備強烈共振效應", "purple"],
    ["聚合", "FOCUS", "1 組", "具備明顯規律集中性", "blue"],
    ["啟動", "ACTIVE", "2 組", "具備基本參考價值", "green"],
  ] as const;
  const statusRoads = [
    { position: 1, number: "05", period: 1, consecutive: "準7進8", prediction: "08", road: "加減" },
    { position: 2, number: "24", period: 3, consecutive: "準7進8", prediction: "08", road: "加減" },
    { position: 1, number: "03", period: 2, consecutive: "準6進7", prediction: "08", road: "合值" },
    { position: 3, number: "11", period: 4, consecutive: "準6進7", prediction: "08", road: "合值" },
    { position: 5, number: "33", period: 5, consecutive: "準7進8", prediction: "08", road: "拖牌" },
  ] as const;
  return (
    <FeatureShell title="Matrix 狀態" onNavigate={onNavigate} className="matrix-status-screen">
      <LotterySwitcher selected={lottery} onChange={setLottery} className="matrix-status-lottery-switcher" />
      <div className="status-list">
        {statuses.map(([title, titleEn, count, description, tone]) => (
          <section className="status-block" data-tone={tone} key={title}>
            <button type="button" onClick={() => { setOpen(open === title ? "" : title); setOpenRoad(null); }}>
              <span><strong><i />{title}<small>{titleEn}</small></strong><small>{description}</small></span><em>{count}</em><ChevronRightIcon data-open={open === title} />
            </button>
            {open === title ? <div className="status-detail">
              <div className="status-road-table">
                <div className="status-road-table-head" aria-hidden="true">
                  <span>位置</span><span>號碼</span><span>預測期</span><span>連準次數</span><span>預測</span><span>類型</span>
                </div>
                {statusRoads.map((road, index) => (
                  <article key={`${title}-${road.number}-${index}`}>
                    <button type="button" className="status-road-table-row" aria-expanded={openRoad === index} onClick={() => setOpenRoad(openRoad === index ? null : index)}>
                      <span>順球{road.position}</span><span>{road.number}</span><span>下{road.period}期</span><span>{road.consecutive}</span><strong>{road.prediction}</strong><span>{road.road}<ChevronDownIcon data-open={openRoad === index} /></span>
                    </button>
                    {openRoad === index ? <RoadValidationProcess number={road.number} position={road.position} predictionPeriod={road.period} consecutive={road.consecutive} prediction={road.prediction} /> : null}
                  </article>
                ))}
              </div>
            </div> : null}
          </section>
        ))}
      </div>
    </FeatureShell>
  );
}

export function FeaturePageRouter({
  screen,
  onNavigate,
  historyReturnScreen = "home",
}: {
  screen: ScreenId;
  onNavigate: Navigate;
  historyReturnScreen?: ScreenId;
}) {
  if (screen === "matrix-core") return <MatrixExplorePage onNavigate={onNavigate} />;
  if (screen === "explore") return <MatrixExplorePage onNavigate={onNavigate} />;
  if (screen === "tianyan") return <MatrixExplorePage onNavigate={onNavigate} title="Matrix 天衍" roadTypes={["複合版路"]} />;
  if (screen === "tiangong") return <MatrixTiangongPage onNavigate={onNavigate} />;
  if (screen === "tongxing") return <TongXingPage onNavigate={onNavigate} />;
  if (screen === "history") return <DrawHistoryPage onNavigate={onNavigate} backTarget={historyReturnScreen} />;
  if (screen === "reference") return <NumberReferencePage onNavigate={onNavigate} />;
  if (screen === "calculator") return <CalculatorPage onNavigate={onNavigate} />;
  if (screen === "matrix-card") return <MatrixCardPage onNavigate={onNavigate} />;
  if (screen === "guide") return <MatrixGuidePage onNavigate={onNavigate} />;
  if (screen === "notes") return <NotesPage onNavigate={onNavigate} />;
  if (screen === "notebook") return <MatrixNotebookPage onNavigate={onNavigate} />;
  if (screen === "notifications") return <NotificationsPage onNavigate={onNavigate} />;
  if (screen === "profile") return <ProfilePage onNavigate={onNavigate} />;
  if (screen === "subscription-management") return <SubscriptionManagementPage onNavigate={onNavigate} />;
  if (screen === "payment-history") return <PaymentHistoryPage onNavigate={onNavigate} />;
  if (screen === "pro-plans") return <ProPlansPage onNavigate={onNavigate} />;
  if (screen === "about-matrix") return <AboutMatrixPage onNavigate={onNavigate} />;
  if (screen === "activation-code") return <ActivationCodePage onNavigate={onNavigate} />;
  if (screen === "service-info") return <ServiceInfoPage onNavigate={onNavigate} />;
  if (screen === "refund-policy") return <RefundPolicyPage onNavigate={onNavigate} />;
  if (screen === "merchant-info") return <MerchantInfoPage onNavigate={onNavigate} />;
  if (screen === "problem-report") return <ProblemReportPage onNavigate={onNavigate} />;
  if (screen === "business-cooperation") return <BusinessCooperationPage onNavigate={onNavigate} />;
  if (screen === "invite-friends") return <InviteFriendsPage onNavigate={onNavigate} />;
  if (screen === "promotions") return <PromotionsPage onNavigate={onNavigate} />;
  if (screen === "version-info") return <VersionInfoPage onNavigate={onNavigate} />;
  if (screen === "update-history") return <UpdateHistoryPage onNavigate={onNavigate} />;
  if (screen === "member-terms") return <MemberTermsPage onNavigate={onNavigate} />;
  if (screen === "privacy-policy") return <PrivacyPolicyPage onNavigate={onNavigate} />;
  if (screen === "disclaimer") return <DisclaimerPage onNavigate={onNavigate} />;
  return <MatrixStatusPage onNavigate={onNavigate} />;
}
