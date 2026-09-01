Warning: truncated output (original token count: 62417)
Total output lines: 4497

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
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
import { QUICK_SETTINGS_DOUBLE_TAP_MS } from "./BottomNavigation";
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
import {
  fetchExploreList,
  fetchExploreValidation,
  fetchTianyanList,
  fetchTianyanValidation,
  fetchTiangongList,
  fetchTiangongValidation,
  type ExploreListResponse,
  type ExploreValidation,
  type TianyanListResponse,
  type TianyanValidation,
  type TiangongListResponse,
  type TiangongValidation,
} from "./matrix-algorithm-api";
import {
  fetchMatrixStatus,
  listCustomStatusSettings,
  resetCustomStatusSetting,
  saveCustomStatusSetting,
  type CustomConditionGroup,
  type CustomConditionRow,
  type CustomMatrixStatusCode,
  type CustomStatusConfig,
  type MatrixStatusResponse,
} from "./matrix-status-api";
import {
  bootstrapMember,
  fetchMemberPaymentHistory,
  fetchMemberProfile,
  fetchPendingTransferRequest,
  submitTransferRequest,
  type MemberPaymentHistoryItem,
  type MemberProfileResponse,
  type MemberTransferRequest,
  type ManualTransferPlanCode,
} from "./member-api";
import { readManualTransferPlan, saveManualTransferPlan } from "./manual-transfer-selection";
import { signInWithLine, signOutFromMatrix } from "./auth/line-auth";
import { getSupabaseClient } from "./lib/supabase";
import { downloadMatrixTicket } from "./matrix-ticket-download";
import { getExploreEntryDefaults } from "./explore-defaults";
import { useAppDialog } from "./dialog/AppDialog";
import { useDoubleClickAction } from "./useDoubleClickAction";
import "./explore-validation-protection.css";

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
  | "manual-transfer"
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
  | "status"
  | "status-settings";

type Navigate = (screen: ScreenId) => void;

type QuickNavigationContextValue = {
  onQuickOpen?: () => void;
  onQuickConfigure?: () => void;
  onQuickBack?: () => void;
  currentScreen?: ScreenId;
  quickTarget?: ScreenId | null;
  quickActive?: boolean;
};

const QuickNavigationContext = createContext<QuickNavigationContextValue>({});

export function QuickNavigationProvider({
  children,
  onQuickOpen,
  onQuickConfigure,
  onQuickBack,
  currentScreen,
  quickTarget,
  quickActive,
}: QuickNavigationContextValue & { children: React.ReactNode }) {
  return (
    <QuickNavigationContext.Provider value={{ onQuickOpen, onQuickConfigure, onQuickBack, currentScreen, quickTarget, quickActive }}>
      {children}
    </QuickNavigationContext.Provider>
  );
}

export function useQuickNavigation() {
  return useContext(QuickNavigationContext);
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

function updateLookupInputValues(values: string[], index: number, rawValue: string) {
  const candidate = sanitizeReferenceNumber(rawValue);
  if (candidate.length === 2 && isDuplicateLookupNumber(values.map(formatReferenceNumber), index, candidate)) {
    return values;
  }
  return values.map((value, valueIndex) => valueIndex === index ? candidate : value);
}

function finalizeLookupInputValues(values: string[], index: number) {
  const formatted = formatReferenceNumber(values[index]);
  const nextValue = isDuplicateLookupNumber(values.map(formatReferenceNumber), index, formatted) ? "" : formatted;
  return values.map((value, valueIndex) => valueIndex === index ? nextValue : value);
}

const MATRIX_PAGE_ITEMS = [
  { screen: "explore", label: "Matrix 探索", image: "/assets/lottery/functions/Matrix探索.png" },
  { screen: "tianyan", label: "Matrix 天衍", image: "/assets/lottery/functions/Matrix天衍.png" },
  { screen: "tiangong", label: "Matrix 天工", image: "/assets/lottery/functions/Matrix天工.png" },
] as const;

const MATRIX_LOOP_ITEMS = [MATRIX_PAGE_ITEMS[2], ...MATRIX_PAGE_ITEMS, MATRIX_PAGE_ITEMS[0]] as const;

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
  "Matrix Pro 會員方案與收費標準": "/assets/lottery/functions/會員方案標題K.png",
  "Matrix 自訂觸發狀態": "/assets/lottery/functions/自訂觸發標題K.png",
};

function MatrixPageSwitcher({ current, onNavigate }: {
  current: "explore" | "tianyan" | "tiangong";
  onNavigate: Navigate;
}) {
  const switcherRef = useRef<HTMLElement>(null);
  const scrollSettleRef = useRef<number | null>(null);
  const currentIndex = MATRIX_PAGE_ITEMS.findIndex((item) => item.screen === current) + 1;

  useEffect(() => {
    const switcher = switcherRef.current;
    if (!switcher) return;
    switcher.scrollTo({ top: currentIndex * switcher.clientHeight, behavior: "auto" });
  }, [currentIndex]);

  useEffect(() => () => {
    if (scrollSettleRef.current !== null) window.clearTimeout(scrollSettleRef.current);
  }, []);

  const settleScrolledPage = () => {
    if (scrollSettleRef.current !== null) window.clearTimeout(scrollSettleRef.current);
    scrollSettleRef.current = window.setTimeout(() => {
      const switcher = switcherRef.current;
      if (!switcher || switcher.clientHeight === 0) return;
      const rawIndex = Math.max(0, Math.min(MATRIX_LOOP_ITEMS.length - 1, Math.round(switcher.scrollTop / switcher.clientHeight)));
      const normalizedIndex = rawIndex === 0
        ? MATRIX_LOOP_ITEMS.length - 2
        : rawIndex === MATRIX_LOOP_ITEMS.length - 1
          ? 1
          : rawIndex;
      if (normalizedIndex !== rawIndex) {
        switcher.scrollTo({ top: normalizedIndex * switcher.clientHeight, behavior: "auto" });
      }
      const target = MATRIX_LOOP_ITEMS[rawIndex].screen;
      if (target !== current) onNavigate(target);
    }, 120);
  };

  return (
    <nav ref={switcherRef} className="matrix-page-switcher" aria-label="Matrix Core 功能切換" onScroll={settleScrolledPage}>
      {MATRIX_LOOP_ITEMS.map((item, index) => {
        const isLoopClone = index === 0 || index === MATRIX_LOOP_ITEMS.length - 1;
        return (
          <button type="button" aria-label={item.label} aria-hidden={isLoopClone || undefined} tabIndex={isLoopClone ? -1 : 0} aria-current={!isLoopClone && item.screen === current ? "page" : undefined} data-loop-clone={isLoopClone || undefined} data-selected={!isLoopClone && item.screen === current} onClick={() => onNavigate(item.screen)} key={`${item.screen}-${index}`}>
            <img src={item.image} alt="" draggable={false} />
          </button>
        );
      })}
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
  artwork,
}: {
  title: string;
  onBack: () => void;
  action?: React.ReactNode;
  compact?: boolean;
  hideTitle?: boolean;
  showBack?: boolean;
  artwork?: string;
}) {
  const integratedArtwork = artwork ?? MATRIX_TITLE_ARTWORK[title];
  if (integratedArtwork && (!hideTitle || Boolean(artwork))) {
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
  headerArtwork,
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
  headerArtwork?: string;
}) {
  const { onQuickBack, quickActive } = useQuickNavigation();
  const logoOnlyHeader = compactHeader || active !== "首頁";
  const hideTitle = hidePageTitle || compactHeader;
  return (
    <main className={`feature-screen ${logoOnlyHeader ? "compact-feature-screen bottom-nav-brand-screen" : ""} ${className}`.trim()}>
      <BrandHeader
        title={title}
        onBack={() => quickActive && onQuickBack ? onQuickBack() : onNavigate(backTarget)}
        action={headerAction}
        compact={logoOnlyHeader}
        hideTitle={hideTitle}
        showBack={(Boolean(headerArtwork ?? MATRIX_TITLE_ARTWORK[title]) && !(active === "我的" && backTarget === "home")) || !logoOnlyHeader || (active === "我的" && backTarget === "profile")}
        artwork={headerArtwork}
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
    <img
      className="setting-label-icon matrix-explore-setting-icon"
      src={`/assets/matrix-explore/${type}.png`}
      alt=""
      aria-hidden="true"
    />
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
  const requestLimit = typeof limit === "number"
    ? Math.max(limit * 3, limit <= 10 ? 50 : 30)
    : undefined;

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
  collapseControl = "title",
  showOrderText = true,
  expanded: controlledExpanded,
  onExpandedChange,
}: {
  lottery: LotteryId;
  numberOrder: string;
  onOpenHistory: () => void;
  collapsible?: boolean;
  collapseControl?: "title" | "action";
  showOrderText?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const history = useLotteryHistory(lottery, 10);
  const displayedHistory = useMemo(() => [...history].reverse(), [history]);
  const order = getHistoryOrder(numberOrder);
  const [internalExpanded, setInternalExpanded] = useState(!collapsible);
  const expanded = controlledExpanded ?? internalExpanded;
  const historyTableId = showOrderText ? "tongxing-history-table" : "matrix-explore-history-table";
  const toggleExpanded = () => {
    const nextExpanded = !expanded;
    if (controlledExpanded === undefined) setInternalExpanded(nextExpanded);
    onExpandedChange?.(nextExpanded);
  };
  const historyHeading = (
    <div className="history-panel-title">
      <SectionTitle>近10期開獎號碼</SectionTitle>
      {showOrderText ? <span className="history-panel-order">（{numberOrder}）</span> : null}
    </div>
  );
  const historyToggleHeading = (
    <span className="history-panel-title">
      <span className="section-title"><span aria-hidden="true" />近10期開獎號碼</span>
      {showOrderText ? <span className="history-panel-order">（{numberOrder}）</span> : null}
    </span>
  );

  return (
    <div className="matrix-explore-main-screen matrix-explore-history-scope">
    <section className="panel history-panel matrix-explore-history-panel" data-lottery={lottery}>
      <header className="panel-heading">
        {collapsible && collapseControl === "title" ? (
          <button
            type="button"
            className="history-panel-toggle"
            aria-label={expanded ? "收合近10期開獎號碼" : "展開近10期開獎號碼"}
            aria-expanded={expanded}
            aria-controls={historyTableId}
            onClick={toggleExpanded}
          >
            {historyToggleHeading}
            <ChevronDownIcon data-open={expanded} aria-hidden="true" />
          </button>
        ) : (
          historyHeading
        )}
        {collapsible && collapseControl === "action" ? (
          <div className="history-panel-actions">
            <button
              type="button"
              className="history-panel-collapse-button"
              aria-label={expanded ? "收合近10期開獎號碼" : "展開近10期開獎號碼"}
              aria-expanded={expanded}
              aria-controls={historyTableId}
              onClick={toggleExpanded}
            >
              <ChevronDownIcon data-open={expanded} aria-hidden="true" />
            </button>
            <button type="button" onClick={onOpenHistory}>查看更多紀錄 <ChevronRightIcon /></button>
          </div>
        ) : (
          <button type="button" onClick={onOpenHistory}>查看更多紀錄 <ChevronRightIcon /></button>
        )}
      </header>
      <div
        id={collapsible ? historyTableId : undefined}
        className="history-table"
        hidden={collapsible && !expanded}
      >
        <div className="history-row history-head">
          <span>期數</span><span>日期</span><span>開獎號碼</span>
        </div>
        {displayedHistory.map((record, index) => {
          const draw = getHistoryDrawNumbers(lottery, record, order);
          const issue = record.period ?? record.issue ?? "";
          const date = record.drawDate ?? record.date ?? "";
          const previousDate = index > 0 ? getDrawDate(displayedHistory[index - 1]) : undefined;

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
    </div>
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


function RoadValidationProcess({
  number,
  position,
  predictionPeriod,
  consecutive,
  prediction,
  roadType,
}: {
  number: string;
  position: number;
  predictionPeriod: number;
  consecutive: string;
  prediction: string;
  roadType?: string;
}) {
  const sourceGroups = [ROAD_VALIDATION_SAMPLE_HISTORY.slice(0, 3), ROAD_VALIDATION_SAMPLE_HISTORY.slice(3, 6)];
  const validationGroups = Array.from({ length: 8 }, (_, index) => sourceGroups[index % sourceGroups.length]);
  return (
    <section className="road-validation-process" aria-label="驗證過程">
      <header className="validation-summary-card">
        <span>
          開 <i className="validation-summary-primary">{number}</i>
          第 <i className="validation-summary-position">{position}</i> 顆｜上 <i className="validation-summary-lookback">2</i> 期｜
          第 <i className="validation-summary-position">3</i> 顆｜<i className="validation-summary-formula">{roadType === "合值版路" ? "合值14.24" : "+14.24"}</i>｜
          下 <i className="validation-summary-future">{predictionPeriod}</i> 期開
        </span>
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

function ExploreValidationProcess({
  item,
  validation,
  loading,
}: {
  item: {
    number: string;
    position: number;
    predictionPeriod: number;
    algorithmType: string;
    referenceOffset?: number;
    referencePosition?: number;
  };
  validation?: ExploreValidation;
  loading: boolean;
}) {
  const contentProtected = useExploreValidationProtection();

  if (loading) return <p className="empty-result">驗證資料載入中</p>;
  if (!validation || validation.ruleSets.length === 0) {
    return <p className="empty-result">無驗證資料</p>;
  }

  type ValidationDisplayRow = {
    key: string;
    period: string;
    numbers: Array<string | number>;
    formula?: string;
  };

  const values = (numbers: Array<string | number>) => numbers.map((value) => String(value).padStart(2, "0"));
  const relation = item.referenceOffset === undefined || item.referenceOffset === 0
    ? "同期"
    : `${item.referenceOffset < 0 ? "上" : "下"} ${Math.abs(item.referenceOffset)} 期`;

  const validationGroup = (key: string, rows: ValidationDisplayRow[]) => (
    <div className="validation-period-block explore-validation-group" key={key}>
      <div className="explore-validation-issues">
        {rows.map((row) => <span className="validation-issue" key={`${row.key}-period`}>{row.period}</span>)}
      </div>
      <div className="explore-validation-numbers-card">
        {rows.map((row) => (
          <span className="validation-full-numbers explore-validation-numbers" data-count={values(row.numbers).length} key={`${row.key}-numbers`}>
            {values(row.numbers).map((value, index) => <i key={`${value}-${index}`}>{value}</i>)}
          </span>
        ))}
      </div>
      <div className="explore-validation-formulas">
        {rows.map((row) => <span className="validation-formula" key={`${row.key}-formula`}>{row.formula ? <b>{row.formula}</b> : null}</span>)}
      </div>
    </div>
  );

  return (
    <section
      className="road-validation-process explore-validation-card"
      aria-label="驗證過程"
      data-content-protected={contentProtected ? "true" : "false"}
      onCopy={(event) => event.preventDefault()}
      onCut={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
    >
      {validation.ruleSets.map((ruleSet, ruleSetIndex) => {
        const ruleDisplays = (matchedRules?: ExploreValidation["ruleSets"][number]["historicalValidation"][number]["matchedRules"]) => {
          if (!matchedRules) return ruleSet.rules.map((rule) => rule.display).join("、");
          const displays = matchedRules.map((matched) => {
            if (typeof matched !== "number") {
              return ruleSet.rules.find((rule) => (
                rule.value === matched.value && rule.algorithmType === matched.algorithmType
              ))?.display ?? matched.display;
            }
            const valueMatches = ruleSet.rules.filter((rule) => rule.value === matched);
            if…42417 tokens truncated… <div><dt>銀行</dt><dd>連線銀行</dd></div>
          <div><dt>銀行代碼</dt><dd>824</dd></div>
          <div className="manual-transfer-bank-row"><dt>帳號</dt><dd className="manual-transfer-account">111023004501</dd><button type="button" className="manual-transfer-copy" onClick={() => void navigator.clipboard.writeText("111023004501")}>複製帳號</button></div>
          <div><dt>戶名</dt><dd>黎小姐</dd></div>
        </dl>
      </section>
      <section className="panel detail-card manual-transfer-form-card">
        <h2>回報轉帳</h2>
        <label htmlFor="manual-transfer-last-five">帳號末五碼</label>
        <input
          id="manual-transfer-last-five"
          className="manual-transfer-last-five"
          inputMode="numeric"
          maxLength={5}
          value={lastFive}
          onChange={(event) => setLastFive(event.target.value.replace(/\D/g, "").slice(0, 5))}
          disabled={Boolean(pending)}
        />
        {loading ? <p role="status">申請狀態載入中</p> : null}
        {pending ? <p className="manual-transfer-pending"><strong>{pending.status === "pending" ? "待確認" : transferStatusLabels[pending.status]}</strong><span>已有待確認申請</span></p> : null}
        {error ? <p role="alert">{error}</p> : null}
        <button type="button" className="confirm-payment manual-transfer-submit" disabled={loading || submitting || Boolean(pending) || lastFive.length !== 5} onClick={() => void submit()}>{submitting ? "提交中" : "提交"}</button>
      </section>
    </ProfileDetailShell>
  );
}

function AboutMatrixPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="關於 樂彩 Matrix" onNavigate={onNavigate} className="profile-info-screen"><section className="panel detail-card about-matrix-card"><p className="about-welcome">歡迎使用 樂彩 Matrix。</p><p>樂彩 Matrix 致力於提供清晰、直覺且易於使用的開獎資料查詢與分析服務，協助使用者快速查閱公開資訊、整理歷史數據，並透過多項分析功能，提升資料檢視效率。</p><p>我們持續優化介面設計與操作體驗，整合各項分析工具，讓不同需求的使用者都能以更簡單、更流暢的方式使用各項功能。</p><h2>我們的理念</h2><p>我們重視資料整理、操作效率與使用體驗，持續改善介面細節與功能品質，希望提供穩定、且容易使用的分析工具，讓每一次資料查詢都更加便利。</p><p className="about-thanks">感謝您對 樂彩 Matrix 的支持與使用！</p><div className="about-brand-info"><p><span>品牌名稱：</span>樂彩 Matrix</p><p>Copyright © 2026 樂彩 Matrix. All Rights Reserved.</p></div></section></ProfileDetailShell>;
}

function CollapsibleRuleCard({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  const contentId = `referral-rule-${title}`;
  return <section className="referral-rule-card"><button type="button" className="referral-rule-toggle" aria-expanded={open} aria-controls={contentId} onClick={onToggle}><span>{title}</span><ChevronRightIcon aria-hidden="true" /></button>{open ? <div className="referral-rule-content" id={contentId}>{children}</div> : null}</section>;
}

function ActivationCodePage({ onNavigate }: { onNavigate: Navigate }) {
  const [referralCode, setReferralCode] = useState("");
  const [activationCode, setActivationCode] = useState("");
  const [openRules, setOpenRules] = useState({ recognition: false, reward: false, supplement: false });
  const [activationInstructionsOpen, setActivationInstructionsOpen] = useState(false);
  const [activationOpen, setActivationOpen] = useState(false);
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
      <section className="panel referral-code-section" aria-label="推薦碼">
        <div className="referral-summary-card">
          <div className="referral-summary-heading">
            <h2>我的推薦碼</h2>
            <p className="referral-success-count">推薦成功 <strong className="referral-success-value">{referralSuccessCount}</strong> 人</p>
          </div>
          <p className="referral-code-label">推薦碼：<strong className="referral-code-value">{myReferralCode}</strong></p>
          <div className="referral-primary-actions">
            <button type="button" className="gold-button" onClick={copyReferralCode}>複製推薦碼</button>
            <button type="button" className="gold-button" onClick={() => onNavigate("invite-friends")}>邀請好友</button>
          </div>
        </div>
        <div className="referral-input-card">
          <h2>輸入推薦碼</h2>
          <div className="code-entry-block">
            <input id="referral-code" value={referralCode} onChange={(event) => setReferralCode(event.target.value)} aria-label="推薦碼" />
            <button type="button" className="primary-action branded-explore-action" disabled><span>確認</span></button>
          </div>
        </div>
        <CollapsibleRuleCard title="推薦成功認定" open={openRules.recognition} onToggle={() => toggleRule("recognition")}><DetailList items={["每個 LINE 帳號，僅能輸入一次推薦碼。", "輸入推薦碼的帳號，完成訂閱 Matrix Pro 月方案、季方案或年方案任一方案後，該筆推薦即計為「推薦成功」。", "若該筆訂閱後續發生退款、刷退或交易取消，該筆推薦成功將失效，推薦成功人數同步扣除，相關獎勵資格，將依最新推薦成功人數重新計算。"]} /></CollapsibleRuleCard>
        <CollapsibleRuleCard title="推薦成功獎勵" open={openRules.reward} onToggle={() => toggleRule("reward")}><DetailList items={["推薦成功滿 10 人：Matrix 探索期數 (七期) 開放日：每週二、五開放變為每週一、二、四、五。", "推薦成功滿 15 人：Matrix 探索期數 (七期)：永久開放。", "推薦成功滿 30 人：Matrix 探索範圍 (完整範圍)：由不開放變為每週二、五開放。", "推薦成功滿 50 人：Matrix 探索範圍 (完整範圍)：永久開放。"]} /></CollapsibleRuleCard>
        <CollapsibleRuleCard title="推薦獎勵補充規則" open={openRules.supplement} onToggle={() => toggleRule("supplement")}><DetailList items={["推薦獎勵不需本人訂閱 Matrix Pro。", "當達成對應的推薦成功人數門檻後，即可使用已解鎖的 Matrix 探索權限。", "若因退款、刷退或交易取消等情況，導致推薦成功人數低於原獎勵門檻：已取得的對應獎勵將同步取消。並依最新的推薦成功人數，重新計算資格與獎勵。", "樂彩 Matrix 保留活動內容、參加資格、獎勵內容、活動規則、資格認定、發放方式、終止、修改、解釋及最終決定之權利。"]} /></CollapsibleRuleCard>
      </section>
      <section className="panel activation-code-section" aria-label="啟動碼">
        <div className="activation-card">
          <button
            type="button"
            className="activation-card-toggle"
            aria-expanded={activationOpen}
            aria-controls="activation-code-panel"
            onClick={() => setActivationOpen((current) => !current)}
          >
            <span>啟動碼</span>
            <ChevronRightIcon data-open={activationOpen} aria-hidden="true" />
          </button>
          <div id="activation-code-panel" className="activation-code-panel" hidden={!activationOpen}>
            <div className="code-entry-block" data-result-state={resultState} aria-busy={submitting}>
              <input id="activation-code" value={activationCode} onChange={(event) => setActivationCode(event.target.value)} aria-label="啟動碼" />
              <button type="button" className="primary-action branded-explore-action" onClick={handleActivation} disabled={submitting}><span>確認</span></button>
            </div>
          </div>
        </div>
        <CollapsibleRuleCard title="啟動碼使用說明" open={activationInstructionsOpen} onToggle={() => setActivationInstructionsOpen((current) => !current)}><ul><li>啟動碼以增加 Matrix Pro 訂閱天數為主要功能。</li><li>每組啟動碼只能成功使用一次。</li><li>啟動成功後，該組啟動碼立即標記為已使用。</li></ul></CollapsibleRuleCard>
      </section>
    </ProfileDetailShell>
  );
}

function InviteFriendsPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="邀請好友" onNavigate={onNavigate}><DetailCard title="邀請好友"><p>推薦碼/邀請碼尚未提供。</p></DetailCard></ProfileDetailShell>;
}

function PromotionsPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="優惠活動" onNavigate={onNavigate} className="profile-info-screen"><DetailCard title="優惠活動"><p>目前沒有優惠活動。</p></DetailCard></ProfileDetailShell>;
}

function ServiceInfoPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="服務內容與使用說明" onNavigate={onNavigate} className="profile-info-screen"><DetailCard title="一、服務名稱"><p>樂彩 Matrix</p></DetailCard><DetailCard title="二、服務形式"><p>樂彩 Matrix 為可安裝於手機桌面的 PWA 服務。</p></DetailCard><DetailCard title="三、主要功能"><DetailList items={["Matrix Core", "　Matrix 探索", "　Matrix 天衍", "　Matrix 天工", "Matrix 狀態", "Matrix 同星", "號碼對照單", "連碰立柱計算機", "Matrix 牌單", "Matrix 指南", "歷史開獎號碼", "Matrix 筆記本"]} /></DetailCard><DetailCard title="四、支援彩種"><DetailList items={["今彩539", "天天樂", "六合彩", "大樂透"]} /></DetailCard><DetailCard title="五、使用方式"><p>使用者透過 LINE 登入後，可查看會員資訊、訂閱資訊及目前帳號可使用的功能。</p><p>不同會員狀態可使用的功能及權限，依目前帳號顯示為準。</p></DetailCard><DetailCard title="六、探索結果說明"><p>探索結果依歷史資料與所選條件產生，僅供參考，不代表中獎、獲利或任何結果之保證。</p></DetailCard><DetailCard title="七、Matrix Pro 說明"><p>Matrix Pro 為樂彩 Matrix 的付費訂閱方案，提供月方案、季方案及年方案。</p><p>使用者可自行選擇是否開啟自動續訂。</p><p>實際方案價格、訂閱期間、功能權限及目前可使用內容，依「Matrix Pro 方案與收費標準」及帳號顯示為準。</p></DetailCard></ProfileDetailShell>;
}

function RefundPolicyPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="退款規範" onNavigate={onNavigate} className="profile-info-screen"><DetailCard title="一、適用範圍"><p>本退款規範適用於樂彩 Matrix 提供的 Matrix Pro 付費方案。</p><p>Matrix Pro 提供單次訂閱及自動續訂方式，實際付款方式，依使用者訂閱時的選擇為準。</p></DetailCard><DetailCard title="二、自動續訂"><p>使用者可自行選擇是否開啟自動續訂。</p><p>開啟自動續訂後，系統將於目前訂閱方案到期時，依原訂閱方案及續訂當時顯示的價格自動扣款，並延長相對應的 Matrix Pro 訂閱期間。</p><p>使用者可於下一次扣款前，先行關閉自動續訂。關閉自動續訂後，已付款的訂閱期間仍可使用至到期日，期滿後不再自動扣款或續訂。</p><p>關閉自動續訂僅停止下一期扣款，不等同取消目前訂閱或申請退款。</p><p>自動續訂扣款成功後，視為一筆新的 Matrix Pro 訂閱交易；如需申請退款，依本退款規範辦理。</p></DetailCard><DetailCard title="三、七日解除權與數位服務"><p>Matrix Pro 為付款後，提供使用權限的數位服務。</p><p>若付款流程已事先告知，並取得使用者同意立即提供數位內容或線上服務，且服務已開始提供，依法得排除七日解除權，不適用七日無條件解除。</p></DetailCard><DetailCard title="四、可申請退款情形"><DetailList items={["重複付款。", "付款成功但 Matrix Pro 權限未開通。", "因 樂彩 Matrix 系統異常，致已購買的主要服務無法使用。", "其他依法應辦理退款的情形。"]} /></DetailCard><DetailCard title="五、不予退款情形"><DetailList items={["使用者已事先同意立即提供數位服務，且 Matrix Pro 權限已開通並開始使用，依法得排除七日解除權的情形。", "非屬本規範或法律規定應退款的情形。", "關閉自動續訂僅停止下一期扣款，不溯及已完成的當期訂閱交易。"]} /></DetailCard><DetailCard title="六、退款申請方式"><p>請寄送電子郵件至 <a href="mailto:Matrix1150801@gmail.com">Matrix1150801@gmail.com</a>，並提供會員帳號、付款日期、付款金額、訂單或交易資料及退款原因。</p></DetailCard><DetailCard title="七、退款處理"><p>收到申請後，將依付款紀錄、權限開通狀態及服務使用情形進行核對。</p><p>符合退款條件者，退款方式及實際入帳時間，將依原付款方式與金流服務商作業時間辦理。</p></DetailCard><DetailCard title="八、其他"><p>本規範如與中華民國法令的強制或禁止規定不同，依相關法令辦理。</p><p>樂彩 Matrix 保留退款申請資料核對、交易狀態確認及退款資格認定之權利；退款處理仍依中華民國相關法令及本退款規範辦理。</p></DetailCard></ProfileDetailShell>;
}

function MerchantInfoPage({ onNavigate }: { onNavigate: Navigate }) {
  return (
    <ProfileDetailShell title="聯絡客服" onNavigate={onNavigate} className="profile-info-screen">
      <DetailCard title="電子郵件"><a href="mailto:Matrix1150801@gmail.com">Matrix1150801@gmail.com</a></DetailCard>
    </ProfileDetailShell>
  );
}

function ProblemReportPage({ onNavigate }: { onNavigate: Navigate }) {
  return (
    <ProfileDetailShell title="問題回報" onNavigate={onNavigate} className="profile-info-screen">
      <DetailCard title="回報方式"><p>請透過電子郵件回報使用時遇到的問題。</p><a href="mailto:Matrix1150801@gmail.com">Matrix1150801@gmail.com</a></DetailCard>
    </ProfileDetailShell>
  );
}

function BusinessCooperationPage({ onNavigate }: { onNavigate: Navigate }) {
  return (
    <ProfileDetailShell title="商務合作" onNavigate={onNavigate} className="profile-info-screen">
      <DetailCard title="聯絡方式"><p>商務合作請透過電子郵件聯絡。</p><a href="mailto:Matrix1150801@gmail.com">Matrix1150801@gmail.com</a></DetailCard>
    </ProfileDetailShell>
  );
}

function VersionInfoPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="版本資訊" onNavigate={onNavigate} className="profile-info-screen"><DetailCard title="目前版本"><p>0.1.0</p></DetailCard></ProfileDetailShell>;
}

function UpdateHistoryPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="更新紀錄" onNavigate={onNavigate} className="profile-info-screen"><DetailCard title="2026/08/04"><p>調整「我的」頁面分類與排列順序。</p></DetailCard></ProfileDetailShell>;
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
  return <ProfileDetailShell title="會員服務條例" onNavigate={onNavigate} className="profile-info-screen">{sections.map(([title, content]) => <DetailCard title={title} key={title}>{content}</DetailCard>)}</ProfileDetailShell>;
}

function PrivacyPolicyPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="隱私權政策" onNavigate={onNavigate} className="profile-info-screen"><DetailCard title="一、蒐集的資料"><DetailList items={["登入 LINE 所提供的帳號識別資料", "Matrix Pro 訂閱狀態", "訂閱到期日", "啟動碼使用紀錄", "推薦碼使用紀錄", "推薦成功人數", "通知設定"]} /></DetailCard><DetailCard title="二、使用目的"><DetailList items={["會員登入與帳號識別", "顯示會員及訂閱狀態", "Matrix Pro 啟用、續訂及權限管理", "提供使用者已選擇的功能", "推薦活動資格與獎勵管理", "系統通知與服務通知"]} /></DetailCard><DetailCard title="三、第三方服務"><p>目前已確認使用 LINE 登入。</p></DetailCard><DetailCard title="四、資料使用範圍"><p>蒐集之資料，僅用於本政策所載之使用目的及提供樂彩 Matrix 服務，不會於未經使用者同意或法律另有規定之情況下，提供予第三方。</p></DetailCard><DetailCard title="五、資料安全"><p>樂彩 Matrix 將採取合理之安全措施保護會員資料，避免未經授權之存取、使用、修改或洩漏。</p></DetailCard><DetailCard title="六、隱私權政策調整"><p>樂彩 Matrix 保留修改本隱私權政策之權利，更新後將公布於本頁面，並自公告日起生效。</p></DetailCard></ProfileDetailShell>;
}

function DisclaimerPage({ onNavigate }: { onNavigate: Navigate }) {
  return <ProfileDetailShell title="聲明與免責事項" onNavigate={onNavigate} className="profile-info-screen"><DetailCard title="一、服務性質"><p>樂彩 Matrix 提供公開的開獎資料查詢、歷史資料整理、比對、計算及分析工具。</p><p>本服務不提供任何中獎、獲利或特定結果之保證。</p></DetailCard><DetailCard title="二、資訊用途"><p>服務內呈現的資料、分析結果及探索結果僅供參考，不代表任何中獎、獲利或結果之保證。</p><p>使用者應自行判斷是否採用服務所提供的資訊。</p></DetailCard><DetailCard title="三、使用者決定"><p>使用者應自行決定如何使用服務內提供的資料、功能及分析結果，並自行承擔相關決定所產生的結果。</p></DetailCard><DetailCard title="四、資料差異"><p>如服務內資料與官方公布資料不同，請以官方公布資料為準。</p></DetailCard><DetailCard title="五、系統與服務"><p>樂彩 Matrix 不保證服務持續不中斷、完全無錯誤，或所有功能於任何時間皆可正常使用。</p><p>如因系統維護、更新、網路異常、第三方服務或其他原因造成服務中斷、延遲或資料顯示異常，將依實際情況處理。</p></DetailCard><DetailCard title="六、第三方服務"><p>本服務使用 LINE 登入、金流服務或其他第三方服務。</p><p>第三方服務之使用方式、資料處理及服務狀態，依各第三方服務提供者之規定辦理。</p></DetailCard><DetailCard title="七、責任範圍"><p>因使用或無法使用樂彩 Matrix 所提供的資料、功能、分析結果或第三方服務所產生的影響，應依實際情況及相關法令認定。</p></DetailCard><DetailCard title="八、內容調整"><p>樂彩 Matrix 得依服務實際運作需要調整功能、內容及相關說明。</p><p>如涉及會員權益或重要內容調整，將於服務內公告。</p></DetailCard><DetailCard title="九、最終說明"><p>本聲明與免責事項如與中華民國法令的強制或禁止規定不同，依相關法令辦理。</p><p>樂彩 Matrix 保留服務內容、功能說明、資料呈現、規則內容、修改、解釋及最終決定之權利。</p></DetailCard></ProfileDetailShell>;
}

export function MatrixStatusPage({ onNavigate, initialLottery = "今彩539" }: { onNavigate: Navigate; initialLottery?: LotteryId }) {
  const [lottery, setLottery] = useState<LotteryId>(initialLottery);
  const [open, setOpen] = useState<MatrixStatusResponse['summary']['status'] | "">("");
  const [result, setResult] = useState<MatrixStatusResponse | null>(null);
  const [requestError, setRequestError] = useState("");
  const handleStatusSettingsClick = useDoubleClickAction<HTMLButtonElement>(
    () => onNavigate("status-settings"),
    QUICK_SETTINGS_DOUBLE_TAP_MS,
  );
  const statuses = [
    ["臨界", "CRITICAL", "極為罕見版路狀態", "orange"],
    ["共振", "RESONANCE", "具備強烈共振效應", "purple"],
    ["聚合", "FOCUS", "具備明顯規律集中性", "blue"],
    ["啟動", "ACTIVE", "具備基本參考價值", "green"],
  ] as const;

  useEffect(() => {
    let active = true;
    setResult(null);
    setRequestError("");
    void fetchMatrixStatus(lottery)
      .then((response) => {
        if (!active) return;
        setResult(response);
        setOpen(response.summary.status === "DORMANT" ? "" : response.summary.status);
      })
      .catch((cause) => {
        if (!active) return;
        setRequestError((cause as { code?: string })?.code === "ANALYSIS_NOT_READY" ? "分析中，請稍後再試" : "Matrix 狀態讀取失敗");
      });
    return () => { active = false; };
  }, [lottery]);

  return (
    <FeatureShell title="Matrix 狀態" onNavigate={onNavigate} className="matrix-status-screen">
      <LotterySwitcher selected={lottery} onChange={setLottery} className="lottery-switcher--home-style matrix-status-lottery-switcher" />
      {requestError ? <p role="alert" className="matrix-api-state">{requestError}</p> : null}
      {result?.summary.status === "DORMANT" ? <p className="matrix-api-state">{result.summary.message}</p> : null}
      <div className="status-list">
        {statuses.map(([title, titleEn, description, tone]) => {
          const cards = result?.cards.filter((card) => card.status === titleEn) ?? [];
          const count = result?.counts[titleEn] ?? 0;
          return (
          <section className="status-block" data-tone={tone} key={title}>
            <button type="button" onClick={() => setOpen(open === titleEn ? "" : titleEn)}>
              <span><strong><i />{title}<small>{titleEn}</small></strong><small>{description}</small></span><em>{count} 組</em><ChevronRightIcon data-open={open === titleEn} />
            </button>
            {open === titleEn ? <div className="status-detail">
              {result?.detailLocked ? <p className="matrix-api-state"><LockClosedIcon />目前顯示公開版路；Matrix Pro 可查看十三期版路</p> : null}
              <div className="status-road-table">
                <div className="status-road-table-head" aria-hidden="true">
                  <span>位置</span><span>號碼</span><span>預測期</span><span>連準次數</span><span>預測</span><span>類型</span>
                </div>
                {cards.flatMap((card) => card.roads.map((road) => (
                  <article key={`${card.id}-${road.id}`}>
                    <div className="status-road-table-row">
                      <span>{road.numberOrder === "依實際開獎順序排序" ? "落球" : "順球"}{road.position}</span><span>{road.lockedNumber}</span><span>下{road.predictionDistance}期</span><span>準{road.streak}進{road.streak + 1}</span><strong>{road.result.join("、")}</strong><span>{road.algorithmType}</span>
                    </div>
                  </article>
                )))}
              </div>
            </div> : null}
          </section>
        );})}
      </div>
      <button type="button" className="bottom-navigation-quick-settings matrix-status-settings-entry" aria-label="自訂觸發條件，連續點擊兩下開啟" onClick={handleStatusSettingsClick}>
        <span className="bottom-navigation-quick-settings-visual">
          <GearIcon aria-hidden="true" />
        </span>
      </button>
    </FeatureShell>
  );
}

const CUSTOM_STATUS_OPTIONS: Array<[CustomMatrixStatusCode, string, string]> = [
  ["ACTIVE", "啟動", "green"], ["FOCUS", "聚合", "blue"],
  ["RESONANCE", "共振", "purple"], ["CRITICAL", "臨界", "orange"],
];
const ONE_CODE_STREAKS = ["準4進5", "準5進6", "準6進7", "準7進8"];
const TWO_CODE_STREAKS = ["準5進6", "準6進7", "準7進8", "準9進10", "準11進12"];

function defaultCustomRow(hitType: "one" | "two"): CustomConditionRow {
  return {
    consecutive: hitType === "one" ? "準4進5" : "準5進6",
    roadType: "加減",
    numberOrder: "依號碼由小到大排序",
    sameCodeQuantity: 1,
  };
}

function duplicateCustomRows(groups: CustomConditionGroup[]) {
  return groups.some((group) => {
    const keys = group.rows.map((row) => [row.consecutive, row.roadType, row.numberOrder, row.sameCodeQuantity].join("|"));
    return new Set(keys).size !== keys.length;
  });
}

function CustomConditionSection({
  title, hitType, groups, setGroups, compositeEnabled,
}: {
  title: string;
  hitType: "one" | "two";
  groups: CustomConditionGroup[];
  setGroups: React.Dispatch<React.SetStateAction<CustomConditionGroup[]>>;
  compositeEnabled: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const streaks = hitType === "one" ? ONE_CODE_STREAKS : TWO_CODE_STREAKS;
  const updateRow = (groupIndex: number, rowIndex: number, patch: Partial<CustomConditionRow>) => {
    setGroups((current) => current.map((group, index) => index === groupIndex
      ? { ...group, rows: group.rows.map((row, itemIndex) => itemIndex === rowIndex ? { ...row, ...patch } : row) }
      : group));
  };
  const removeRow = (groupIndex: number, rowIndex: number) => setGroups((current) => current.map((group, index) => index === groupIndex
    ? { ...group, rows: group.rows.filter((_, itemIndex) => itemIndex !== rowIndex) }
    : group));
  return <section className="custom-status-hit-section">
    <button type="button" className="custom-status-hit-header" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
      <strong>{title}</strong><span>觸發條件組合（{groups.length} 組）</span><ChevronDownIcon data-open={expanded} />
    </button>
    {expanded ? <div className="custom-status-groups">
      {groups.map((group, groupIndex) => <article className="custom-status-group" key={group.id}>
        <header><strong>組合 {groupIndex + 1}</strong><button type="button" aria-label={`刪除組合 ${groupIndex + 1}`} onClick={() => setGroups((current) => current.filter((item) => item.id !== group.id))}><TrashIcon /></button></header>
        {group.rows.map((condition, rowIndex) => <div className="custom-status-condition-row" key={`${group.id}-${rowIndex}`}>
          <label>連準次數<select aria-label={`組合 ${groupIndex + 1} 條件 ${rowIndex + 1} 連準次數`} value={condition.consecutive} onChange={(event) => updateRow(groupIndex, rowIndex, { consecutive: event.target.value })}>{streaks.map((streak) => <option key={streak}>{streak}</option>)}</select></label>
          <label>版路類型<select aria-label={`組合 ${groupIndex + 1} 條件 ${rowIndex + 1} 版路類型`} value={condition.roadType} onChange={(event) => updateRow(groupIndex, rowIndex, { roadType: event.target.value as CustomConditionRow['roadType'] })}>{["加減", "合值", "拖牌", "複合"].map((road) => <option key={road} value={road} disabled={road === "複合" && !compositeEnabled}>{road}{road === "複合" && !compositeEnabled ? "（季費以上）" : ""}</option>)}</select></label>
          <label>號碼順序<select aria-label={`組合 ${groupIndex + 1} 條件 ${rowIndex + 1} 號碼順序`} value={condition.numberOrder} onChange={(event) => updateRow(groupIndex, rowIndex, { numberOrder: event.target.value as CustomConditionRow['numberOrder'] })}><option>依號碼由小到大排序</option><option>依實際開獎順序排序</option></select></label>
          <label>同碼數量<input aria-label="同碼數量" type="number" min={1} max={99} value={condition.sameCodeQuantity} onChange={(event) => updateRow(groupIndex, rowIndex, { sameCodeQuantity: Math.min(99, Math.max(1, Number(event.target.value) || 1)) })} /></label>
          {group.rows.length > 1 ? <button type="button" aria-label={`組合 ${groupIndex + 1} 刪除條件 ${rowIndex + 1}`} onClick={() => removeRow(groupIndex, rowIndex)}><TrashIcon /></button> : null}
        </div>)}
        <button type="button" className="custom-status-add-button" aria-label={`組合 ${groupIndex + 1} 新增條件`} disabled={group.rows.length >= 10} onClick={() => setGroups((current) => current.map((item) => item.id === group.id ? { ...item, rows: [...item.rows, defaultCustomRow(hitType)] } : item))}><PlusIcon />新增條件（最多 10 條）</button>
      </article>)}
      <button type="button" className="custom-status-add-button" aria-label={`新增${hitType === "one" ? "一碼" : "二碼"}觸發條件組合`} disabled={groups.length >= 20} onClick={() => setGroups((current) => [...current, { id: `${hitType}-${Date.now()}-${current.length}`, rows: [defaultCustomRow(hitType)] }])}><PlusIcon />新增觸發條件組合（最多 20 組）</button>
    </div> : null}
  </section>;
}

export function MatrixCustomStatusPage({ onNavigate }: { onNavigate: Navigate }) {
  const [lottery, setLottery] = useState<LotteryId>("今彩539");
  const [status, setStatus] = useState<CustomMatrixStatusCode>("ACTIVE");
  const [configs, setConfigs] = useState<CustomStatusConfig[]>([]);
  const [oneCodeGroups, setOneCodeGroups] = useState<CustomConditionGroup[]>([]);
  const [twoCodeGroups, setTwoCodeGroups] = useState<CustomConditionGroup[]>([]);
  const [compositeEnabled, setCompositeEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const selectedSlotRef = useRef({ lottery, status });
  selectedSlotRef.current = { lottery, status };

  useEffect(() => {
    let active = true;
    void listCustomStatusSettings().then((response) => {
      if (!active) return;
      setConfigs(response.items.map((item) => item.config));
      setCompositeEnabled(Boolean(response.entitlements?.canUseCompositeCustomRoad));
      setLoaded(true);
    }).catch(() => { if (active) { setMessage("自訂設定讀取失敗"); setLoaded(true); } });
    return () => { active = false; };
  }, []);

  useLayoutEffect(() => {
    if (!loaded) return;
    const selected = configs.find((config) => config.lottery === lottery && config.status === status);
    setOneCodeGroups(selected?.oneCodeGroups ?? []);
    setTwoCodeGroups(selected?.twoCodeGroups ?? []);
    setMessage("");
  }, [loaded, lottery, status]);

  const save = async () => {
    if (duplicateCustomRows([...oneCodeGroups, ...twoCodeGroups])) {
      setMessage("同一組合不能有完全相同的條件");
      return;
    }
    const requestedSlot = { lottery, status };
    const value: CustomStatusConfig = { ...requestedSlot, explorePeriods: 13, exploreRange: "完整範圍", oneCodeGroups, twoCodeGroups };
    try {
      const response = await saveCustomStatusSetting(value);
      setConfigs((current) => [...current.filter((item) => item.lottery !== requestedSlot.lottery || item.status !== requestedSlot.status), response.item]);
      if (selectedSlotRef.current.lottery === requestedSlot.lottery && selectedSlotRef.current.status === requestedSlot.status) {
        setMessage("設定已儲存並套用至首頁");
      }
    } catch {
      if (selectedSlotRef.current.lottery === requestedSlot.lottery && selectedSlotRef.current.status === requestedSlot.status) {
        setMessage("目前方案或設定內容無法儲存");
      }
    }
  };
  const reset = async () => {
    const requestedSlot = { lottery, status };
    try {
      await resetCustomStatusSetting(requestedSlot.lottery, requestedSlot.status);
      setConfigs((current) => current.filter((item) => item.lottery !== requestedSlot.lottery || item.status !== requestedSlot.status));
      if (selectedSlotRef.current.lottery === requestedSlot.lottery && selectedSlotRef.current.status === requestedSlot.status) {
        setOneCodeGroups([]); setTwoCodeGroups([]);
        setMessage("已恢復第15章預設");
      }
    } catch {
      if (selectedSlotRef.current.lottery === requestedSlot.lottery && selectedSlotRef.current.status === requestedSlot.status) setMessage("重置設定失敗");
    }
  };

  return <FeatureShell title="Matrix 自訂觸發狀態" onNavigate={onNavigate} backTarget="status" className="matrix-custom-status-screen">
    <LotterySwitcher selected={lottery} onChange={setLottery} className="lottery-switcher--home-style matrix-status-lottery-switcher" />
    <div className="custom-status-tabs" role="tablist" aria-label="選擇狀態">{CUSTOM_STATUS_OPTIONS.map(([code, label, tone]) => <button type="button" role="tab" aria-selected={status === code} data-tone={tone} onClick={() => setStatus(code)} key={code}><strong>{label}</strong><small>{code}</small></button>)}</div>
    <p className="custom-status-fixed-rule">探索期數均為十三期，探索範圍均為完整範圍。</p>
    {!loaded ? <p className="matrix-api-state">設定讀取中</p> : <>
      <CustomConditionSection title="準4+（鎖定1碼）" hitType="one" groups={oneCodeGroups} setGroups={setOneCodeGroups} compositeEnabled={compositeEnabled} />
      <CustomConditionSection title="準5+（鎖定2碼）" hitType="two" groups={twoCodeGroups} setGroups={setTwoCodeGroups} compositeEnabled={compositeEnabled} />
      {message ? <p role="alert" className="custom-status-message">{message}</p> : null}
      <div className="custom-status-actions"><button type="button" aria-label="重置設定" onClick={() => void reset()}><ReloadIcon />重置設定</button><button type="button" aria-label="儲存設定" onClick={() => void save()}><ReaderIcon />儲存設定</button></div>
    </>}
  </FeatureShell>;
}

export function FeaturePageRouter({
  screen,
  onNavigate,
  historyReturnScreen = "home",
  statusLottery,
}: {
  screen: ScreenId;
  onNavigate: Navigate;
  historyReturnScreen?: ScreenId;
  statusLottery?: LotteryId;
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
  if (screen === "manual-transfer") return <ManualTransferPage onNavigate={onNavigate} />;
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
  if (screen === "status-settings") return <MatrixCustomStatusPage onNavigate={onNavigate} />;
  return <MatrixStatusPage onNavigate={onNavigate} initialLottery={statusLottery} />;
}
