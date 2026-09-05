import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { type LotteryId, type DrawOrder } from "../Prototype";
import { BottomNavigation } from "../BottomNavigation";
import { NumberBall as LotteryNumberBall, normalizeBallNumber } from "../NumberBall";
import { fetchLotteryHistory, type LotteryDrawRecord } from "../lottery-api";
import { BrandLogo } from "../BrandLogo";
import { isNearHistoryWeekBoundary } from "../history-week-groups";
import { formatReferenceNumber, sanitizeReferenceNumber } from "../reference-number-input";
import { isDuplicateLookupNumber } from "../feature-tool-logic";
import { Navigate, QuickNavigationContext, ScreenId, useQuickNavigation } from "./navigation";

export const QUICK_CACHE_MS = 30 * 60 * 1000;

export function useTimedState<T>(key: string, initialValue: T) {
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

export const LOTTERIES: LotteryId[] = ["今彩539", "天天樂", "六合彩", "大樂透"];

export function updateLookupInputValues(values: string[], index: number, rawValue: string) {
  const candidate = sanitizeReferenceNumber(rawValue);
  if (candidate.length === 2 && isDuplicateLookupNumber(values.map(formatReferenceNumber), index, candidate)) {
    return values;
  }
  return values.map((value, valueIndex) => valueIndex === index ? candidate : value);
}

export function finalizeLookupInputValues(values: string[], index: number) {
  const formatted = formatReferenceNumber(values[index]);
  const nextValue = isDuplicateLookupNumber(values.map(formatReferenceNumber), index, formatted) ? "" : formatted;
  return values.map((value, valueIndex) => valueIndex === index ? nextValue : value);
}

export const MATRIX_PAGE_ITEMS = [
  { screen: "explore", label: "Matrix 探索", image: "/assets/lottery/functions/Matrix探索-icon.png" },
  { screen: "tianyan", label: "Matrix 天衍", image: "/assets/lottery/functions/Matrix天衍-icon.png" },
  { screen: "tiangong", label: "Matrix 天工", image: "/assets/lottery/functions/Matrix天工-icon.png" },
] as const;

export const MATRIX_LOOP_ITEMS = [MATRIX_PAGE_ITEMS[2], ...MATRIX_PAGE_ITEMS, MATRIX_PAGE_ITEMS[0]] as const;

export const MATRIX_TITLE_ARTWORK: Partial<Record<string, string>> = {
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
  "Matrix Pro 訂閱方案與收費標準": "/assets/lottery/functions/訂閱方案標題K.png",
  "Matrix 自訂觸發狀態": "/assets/lottery/functions/自訂觸發標題K.png",
};

export function MatrixPageSwitcher({ current, onNavigate }: {
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

export const ROAD_VALIDATION_SAMPLE_HISTORY = [
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

export function BrandHeader({
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

export function FeatureBottomNavigationPortal({
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

export function MobilePagePortal({ active, children }: { active: boolean; children: React.ReactNode }) {
  if (!active || typeof document === "undefined") return children;
  const host = document.querySelector<HTMLElement>(".mobile-page");
  return host ? createPortal(children, host) : children;
}

export function FeatureShell({
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

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="section-title"><span />{children}</h2>;
}

export function SettingLabelIcon({
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

export function LotteryTabs({
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

export const LOTTERY_LOGOS: Record<LotteryId, string> = {
  "今彩539": "/assets/lottery/jincai-539-logo.png",
  "天天樂": "/assets/lottery/fantasy-5-logo.png",
  "六合彩": "/assets/lottery/mark-six-logo.png",
  "大樂透": "/assets/lottery/lotto-649-logo.png",
};

export function LotteryLogoTabs({ selected, onChange }: {
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

export function MiniBall({ number, tone = "gold" }: { number: string; tone?: string }) {
  return <span className="mini-ball" data-tone={tone}>{number}</span>;
}

export type HistoryDrawNumbers = {
  main: string[];
  special?: string;
};

export function getHistoryRecordKey(record: LotteryDrawRecord) {
  const issue = getDrawIssue(record);
  const date = getDrawDate(record);
  const numbers = record.numbers.map(normalizeBallNumber).join("-");
  return `${issue}|${date}|${numbers}`;
}

export function useLotteryHistory(lottery: LotteryId, limit?: number) {
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

export function getHistoryLimit(range: string) {
  const value = Number(range.replace(/\D/g, ""));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function getHistoryOrder(numberOrder: string): DrawOrder {
  return numberOrder.includes("實際") ? "落球" : "順球";
}

export function getHistoryDrawNumbers(
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

export function HistoryDate({ value }: { value: string }) {
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

export function getDrawIssue(record: LotteryDrawRecord) {
  return record.period ?? record.issue ?? "";
}

export function getDrawDate(record: LotteryDrawRecord) {
  return record.drawDate ?? record.date ?? "";
}

export function HistoryList({
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
