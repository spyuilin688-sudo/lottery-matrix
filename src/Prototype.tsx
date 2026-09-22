import { DAILY_SORTED_ONLY_DESCRIPTION, supportsDrawOrder, useLotteryOrder } from "./use-lottery-order";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import "./feature-pages.css";
import {
  CalendarIcon,
  ChevronRightIcon,
  ClockIcon,
  CountdownTimerIcon,
} from "@radix-ui/react-icons";
import { MobileScroll, useMobileDevice } from "./mobile";
import { QuickNavigationProvider, type ScreenId } from "./features/navigation";
import "./explore-validation-protection.css";
import "./pro-plans-layout.css";
import "./pro-plans-carousel-peek.css";
import "./activation-code-layout.css";
import "./tianyan-expanded-layout-patch.css";
import { FeaturePageRouter } from "./FeaturePagesPatched";
import { BottomNavigation, HomeQuickSettingsButton } from "./BottomNavigation";
import { FeaturePageLoadBoundary } from "./FeaturePageLoadBoundary";
import { useLatestLotteryDraw } from "./useLatestLotteryDraw";
import { NumberBall as LotteryNumberBall, normalizeBallNumber } from "./NumberBall";
import { fetchLatestLotteryResultState, type LatestLotteryResult, type LotteryDrawRecord } from "./lottery-api";
import { formatCountdown, formatNextDrawAt, nextCountdownSeconds, parseCountdown, secondsUntil } from "./countdown.mjs";
import { fetchMatrixStatusSummaries, type MatrixStatusSummary } from "./matrix-status-api";
import { subscribeMatrixDataRevision } from "./matrix-data-revision";
import { subscribeAlgorithmCacheScope } from "./auth/algorithm-cache-scope";
import { withDeadline } from "./lib/api-resilience";
import { HOME_REFRESH_INTERVAL_MS, homepageRefreshCycleAt, homepageRefreshCycleKey, millisecondsUntilNextHomepageRefreshWindow } from "./homepage-refresh-policy";
import { FirstVisitGuide } from "./onboarding/FirstVisitGuide";
import { useLinePageEntry } from "./auth/LinePageGuard";

export type LotteryId = "今彩539" | "天天樂" | "六合彩" | "大樂透";
export type DrawOrder = "順球" | "落球";

type LotteryOption = {
  id: LotteryId;
  logo: string;
  logoSize: [number, number];
  logoViewBox: string;
};

export type DrawResultData = {
  issue?: string;
  date?: string;
  numbers: string[];
  drawOrderNumbers?: string[];
  specialNumber?: string;
  drawOrderSpecialNumber?: string;
};

export type NextDrawInfoData = {
  nextDraw: string;
  remainingTime: string;
  nextDrawAt?: string;
};

export type MatrixStatusData = {
  status: "啟動" | "聚合" | "共振" | "臨界" | "沉寂";
  statusEn: "ACTIVE" | "FOCUS" | "RESONANCE" | "CRITICAL" | "DORMANT";
  artwork: string;
  count: number;
  description: string;
  tone: "green" | "blue" | "purple" | "orange" | "dormant";
};

export type MatrixStatusMap = Record<LotteryId, MatrixStatusData>;

const LOTTERIES: LotteryOption[] = [
  {
    id: "今彩539",
    logo: "/assets/lottery/jincai-539-logo.png",
    logoSize: [1774, 887],
    logoViewBox: "276 138 1276 583",
  },
  {
    id: "天天樂",
    logo: "/assets/lottery/fantasy-5-logo.png",
    logoSize: [1536, 1024],
    logoViewBox: "263 157 1036 626",
  },
  {
    id: "六合彩",
    logo: "/assets/lottery/mark-six-logo.png",
    logoSize: [1254, 1254],
    logoViewBox: "243 293 796 566",
  },
  {
    id: "大樂透",
    logo: "/assets/lottery/lotto-649-logo.png",
    logoSize: [1672, 941],
    logoViewBox: "331 160 1086 579",
  },
];

const HOME_ASSET_BASE = "/assets/lottery/functions";
const HOME_PREMIUM_ASSET_BASE = "/assets/lottery/home-premium";
const STATUS_ASSET_BASE = "/assets/lottery/status";

const HOME_ASSETS = {
  logo: "/assets/lottery/functions/MatrixLogo.png",
  drawCard: `${HOME_ASSET_BASE}/開獎資訊卡.png`,
  tongxing: `${HOME_PREMIUM_ASSET_BASE}/tongxing.webp`,
  reference: `${HOME_PREMIUM_ASSET_BASE}/reference.webp`,
  matrixCard: `${HOME_PREMIUM_ASSET_BASE}/matrix-card.webp`,
  guide: `${HOME_PREMIUM_ASSET_BASE}/guide.webp`,
} as const;

const HOME_ANNOUNCEMENT_TEXT = "【新會員限時體驗】立即使用 LINE 註冊登入，即可免費體驗 Matrix 探索、天衡、天樞十三期及完整範圍，體驗期限 2 天。";

const HOME_SHORTCUTS = [
  { label: "Matrix 同星", screen: "tongxing", image: HOME_ASSETS.tongxing },
  { label: "Matrix 對照", screen: "reference", image: HOME_ASSETS.reference },
  { label: "Matrix 牌單", screen: "matrix-card", image: HOME_ASSETS.matrixCard },
  { label: "Matrix 指南", screen: "guide", image: HOME_ASSETS.guide },
] as const;

const QUICK_OPTIONS = [
  { label: "Matrix 同星", screen: "tongxing" as const, image: "/assets/lottery/functions/快捷同星.png" },
  { label: "號碼對照單", screen: "reference" as const, image: "/assets/lottery/functions/快捷對照單.png" },
  { label: "連碰立柱計算機", screen: "calculator" as const, image: "/assets/lottery/functions/快捷計算機.png" },
  { label: "歷史開獎號碼", screen: "history" as const, image: "/assets/lottery/functions/快捷歷史號碼.png" },
  { label: "Matrix 筆記本", screen: "notebook" as const, image: "/assets/lottery/functions/快捷筆記本.png" },
] as const;

const DRAW_RESULTS: Record<LotteryId, DrawResultData> = {
  今彩539: { numbers: [] },
  天天樂: { numbers: [] },
  "六合彩": { numbers: [] },
  大樂透: { numbers: [] },
};

const NEXT_DRAW_INFO: Record<LotteryId, NextDrawInfoData> = {
  今彩539: { nextDraw: "", remainingTime: "00:00:00" },
  天天樂: { nextDraw: "", remainingTime: "00:00:00" },
  "六合彩": { nextDraw: "", remainingTime: "00:00:00" },
  大樂透: { nextDraw: "", remainingTime: "00:00:00" },
};

const MATRIX_STATUS_PRESENTATIONS: Record<
  MatrixStatusData["statusEn"],
  Pick<MatrixStatusData, "status" | "artwork" | "tone">
> = {
  ACTIVE: { status: "啟動", artwork: `${STATUS_ASSET_BASE}/啟動.png`, tone: "green" },
  FOCUS: { status: "聚合", artwork: `${STATUS_ASSET_BASE}/聚合.png`, tone: "blue" },
  RESONANCE: { status: "共振", artwork: `${STATUS_ASSET_BASE}/共振.png`, tone: "purple" },
  CRITICAL: { status: "臨界", artwork: `${STATUS_ASSET_BASE}/臨界.png`, tone: "orange" },
  DORMANT: { status: "沉寂", artwork: `${STATUS_ASSET_BASE}/沉寂.png`, tone: "dormant" },
};

function createDormantMatrixStatus(): MatrixStatusData {
  return {
    ...MATRIX_STATUS_PRESENTATIONS.DORMANT,
    statusEn: "DORMANT",
    count: 0,
    description: "本期尚無符合條件的狀態。",
  };
}

function toHomepageMatrixStatus(summary: MatrixStatusSummary): MatrixStatusData {
  return {
    ...MATRIX_STATUS_PRESENTATIONS[summary.status],
    statusEn: summary.status,
    count: summary.count,
    description: summary.message,
  };
}

export const MATRIX_STATUS_BY_LOTTERY: MatrixStatusMap = {
  今彩539: createDormantMatrixStatus(),
  天天樂: createDormantMatrixStatus(),
  "六合彩": createDormantMatrixStatus(),
  大樂透: createDormantMatrixStatus(),
};

export type LotterySwitcherProps = {
  selected: LotteryId;
  onChange: (lottery: LotteryId) => void;
  className?: string;
};

export function LotterySwitcher({ selected, onChange, className = "" }: LotterySwitcherProps) {
  return (
    <div
      data-lottery-switcher=""
      className={`lottery-switcher ${className}`.trim()}
      data-selected-lottery={selected}
      data-testid="lottery-switcher"
    >
      <div className="lottery-switcher-hit-grid" role="radiogroup" aria-label="選擇彩種">
        {LOTTERIES.map((lottery, index) => {
          const isSelected = lottery.id === selected;
          return (
            <button
              data-lottery-card=""
              className="lottery-card"
              data-lottery={lottery.id}
              data-selected={isSelected}
              key={lottery.id}
              onClick={() => onChange(lottery.id)}
              tabIndex={isSelected ? 0 : -1}
              onKeyDown={(event) => {
                const nextIndex = event.key === "Home" ? 0
                  : event.key === "End" ? LOTTERIES.length - 1
                  : event.key === "ArrowRight" || event.key === "ArrowDown" ? (index + 1) % LOTTERIES.length
                  : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (index + LOTTERIES.length - 1) % LOTTERIES.length
                  : null;
                if (nextIndex === null) return;
                event.preventDefault();
                onChange(LOTTERIES[nextIndex].id);
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[nextIndex]?.focus();
              }}
              role="radio"
              aria-checked={isSelected}
              aria-label={lottery.id}
              type="button"
            >
              {/* Intrinsic alpha bounds remove empty asset margins without changing the Logo. */}
              <svg className="lottery-selector-logo" viewBox={lottery.logoViewBox} aria-hidden="true" focusable="false">
                <image href={lottery.logo} width={lottery.logoSize[0]} height={lottery.logoSize[1]} />
              </svg>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function splitDrawNumbers(lottery: LotteryId, values: Array<string | number>) {
  const normalized = values.map(normalizeBallNumber);
  if (lottery === "六合彩" || lottery === "大樂透") {
    return {
      numbers: normalized.slice(0, 6),
      specialNumber: normalized[6],
    };
  }
  return {
    numbers: normalized.slice(0, 5),
    specialNumber: undefined,
  };
}

function toDrawResult(lottery: LotteryId, record: LotteryDrawRecord): DrawResultData {
  const sorted = splitDrawNumbers(lottery, record.sortedNumbers?.length ? record.sortedNumbers : record.numbers);
  const drawOrder = splitDrawNumbers(lottery, record.drawOrderNumbers ?? []);

  return {
    issue: record.period ?? record.issue,
    date: record.drawDate ?? record.date,
    numbers: sorted.numbers,
    drawOrderNumbers: drawOrder.numbers,
    specialNumber: sorted.specialNumber,
    drawOrderSpecialNumber: drawOrder.specialNumber,
  };
}

export type LatestDrawCardProps = {
  lottery: LotteryId;
  result: DrawResultData;
  nextDrawInfo: NextDrawInfoData;
  order: DrawOrder;
  onOrderChange: (order: DrawOrder) => void;
  onOpenHistory?: () => void;
  className?: string;
};

export function LatestDrawCard({ lottery, result, nextDrawInfo, order: requestedOrder, onOrderChange, onOpenHistory, className = "" }: LatestDrawCardProps) {
  const order = useLotteryOrder(lottery, requestedOrder, onOrderChange, "順球");
  const displayedNumbers = order === "順球" ? result.numbers : result.drawOrderNumbers ?? [];
  const displayedSpecialNumber = order === "順球" ? result.specialNumber : result.drawOrderSpecialNumber;
  const hasMeta = Boolean(result.issue || result.date);
  const hasSpecial = Boolean(displayedSpecialNumber);
  return (
    <section className={`latest-draw-card ${className}`.trim()} data-lottery={lottery} aria-label={`${lottery}最新開獎資訊`} data-testid="latest-draw-card">
      <div className="draw-meta" data-empty={!hasMeta}>
        {result.issue ? <div className="draw-issue"><span>第</span><strong>{result.issue}</strong><span>期</span></div> : null}
        {result.date ? <div className="draw-date"><CalendarIcon className="draw-date-icon" aria-hidden="true" />{result.date}</div> : null}
      </div>
      <div className="draw-order" role="radiogroup" aria-label="號碼排列">
        {(["順球", "落球"] as DrawOrder[]).map((option) => (
          <button type="button" role="radio" aria-checked={order === option} data-selected={order === option} disabled={option === "落球" && !supportsDrawOrder(lottery)} aria-description={option === "落球" && !supportsDrawOrder(lottery) ? DAILY_SORTED_ONLY_DESCRIPTION : undefined} onClick={() => onOrderChange(option)} key={option}>{option}</button>
        ))}
      </div>
      <button className="history-link" type="button" onClick={onOpenHistory} aria-label="查看更多紀錄"><span>查看更多紀錄</span><span aria-hidden="true">&gt;</span></button>
      <div className="draw-balls" data-has-special={hasSpecial}>
        <div className="main-balls">
          {order === "落球" && hasMeta && !displayedNumbers.length ? <span role="status">實際落球順序待公布</span> : null}
          {displayedNumbers.map((number, index) => <LotteryNumberBall lottery={lottery} number={number} key={`${number}-${index}`} />)}
        </div>
        {displayedSpecialNumber ? <><span className="special-ball-separator" aria-hidden="true" /><div className="special-ball-group"><span className="special-label">特別號</span><LotteryNumberBall lottery={lottery} number={displayedSpecialNumber} isSpecial /></div></> : null}
      </div>
      <NextDrawInfoBar {...nextDrawInfo} className="next-draw-info--embedded" />
    </section>
  );
}

export type NextDrawInfoBarProps = NextDrawInfoData & { className?: string };
export function NextDrawInfoBar({ nextDraw, nextDrawAt, remainingTime, className = "" }: NextDrawInfoBarProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    nextDrawAt ? secondsUntil(nextDrawAt) : parseCountdown(remainingTime),
  );

  useEffect(() => {
    setRemainingSeconds(
      nextDrawAt ? secondsUntil(nextDrawAt) : parseCountdown(remainingTime),
    );
    const timer = window.setInterval(() => {
      setRemainingSeconds((currentSeconds) =>
        nextDrawAt ? secondsUntil(nextDrawAt) : nextCountdownSeconds(currentSeconds),
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, [nextDrawAt, remainingTime]);

  return (
    <section className={`next-draw-info ${className}`.trim()} aria-label="下次開獎資訊" data-testid="next-draw-info">
      <div className="next-draw-item"><ClockIcon className="next-draw-icon" aria-hidden="true" /><span className="next-draw-label">下次開獎</span><span className="next-draw-value">{nextDraw}</span></div>
      <div className="next-draw-item"><CountdownTimerIcon className="next-draw-icon" aria-hidden="true" /><span className="next-draw-label">剩餘時間</span><span className="next-draw-value">{formatCountdown(remainingSeconds)}</span></div>
    </section>
  );
}

type StatusLoadState = "loading" | "error" | "ready";
type StatusLoadStates = Record<LotteryId, StatusLoadState>;
const loadingStatusStates = (): StatusLoadStates => ({ 今彩539: "loading", 天天樂: "loading", 六合彩: "loading", 大樂透: "loading" });

export type MatrixStatusSectionProps = {
  statuses?: MatrixStatusMap;
  loadStates?: StatusLoadStates;
  onOpen?: (lottery: LotteryId) => void;
};

export function MatrixStatusSection({
  statuses = MATRIX_STATUS_BY_LOTTERY,
  loadStates,
  onOpen,
}: MatrixStatusSectionProps = {}) {
  return (
    <section
      className="matrix-status-section home-status-box"
      aria-label="Matrix 狀態"
      data-testid="matrix-status-section"
    >
      <div className="matrix-status-card-grid" aria-label="四個彩種 Matrix 狀態">
        {LOTTERIES.map((lottery) => {
          const status = statuses[lottery.id];
          const loadState = loadStates?.[lottery.id] ?? "ready";
          const message = loadState === "loading" ? "讀取中" : loadState === "error" ? "讀取失敗" : null;
          return (
            <button
              type="button"
              className="matrix-status-card"
              aria-label={`${lottery.id} ${message ?? status.status}`}
              data-lottery={lottery.id}
              data-status={message ? undefined : status.statusEn}
              data-load-state={loadState}
              aria-busy={loadState === "loading"}
              key={lottery.id}
              onClick={() => onOpen?.(lottery.id)}
            >
              <img
                className="matrix-status-artwork"
                src={status.artwork}
                alt=""
                draggable={false}
              />
              {message ? <span className="matrix-status-message" role="status">{message}</span> : null}
              <img
                className="matrix-status-lottery-logo"
                src={lottery.logo}
                alt={lottery.id}
                draggable={false}
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function MatrixCoreBanner({ onOpen }: { onOpen?: () => void }) {
  return (
    <button type="button" className="matrix-core-banner home-core-box" aria-label="Matrix Core" data-testid="matrix-core-banner" onClick={onOpen}>
      <span className="matrix-core-energy-loop" aria-hidden="true" />
      <span className="matrix-core-node-frame" aria-hidden="true">
        <span className="matrix-core-node" />
        <span className="matrix-core-node" />
        <span className="matrix-core-node" />
        <span className="matrix-core-node" />
        <span className="matrix-core-node" />
        <span className="matrix-core-node" />
        <span className="matrix-core-node" />
        <span className="matrix-core-node" />
      </span>
      <svg className="matrix-core-symbol-energy" viewBox="0 0 1536 414" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="matrix-core-symbol-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(203, 146, 36, .08)" />
            <stop offset="34%" stopColor="rgba(244, 190, 73, .96)" />
            <stop offset="68%" stopColor="rgba(255, 241, 190, 1)" />
            <stop offset="100%" stopColor="rgba(203, 146, 36, .08)" />
          </linearGradient>
        </defs>
        <ellipse className="matrix-core-energy-path matrix-core-energy-path--ring" cx="1163" cy="207" rx="212" ry="144" pathLength="100" />
        <path className="matrix-core-energy-path matrix-core-energy-path--m" d="M1099 340V111H1129L1163 222L1197 111H1226V340" pathLength="100" />
      </svg>
      <span className="matrix-core-description">進入更深層的演算法</span>
      <ChevronRightIcon className="matrix-core-chevron" aria-hidden="true" />
    </button>
  );
}

const HOME_ANNOUNCEMENT_SPEED_PX_PER_SECOND = 60;

export function HomeAnnouncement({ latestResults = [] }: { latestResults?: LatestLotteryResult[] } = {}) {
  const marqueeItems = [
    { key: "new-member", text: HOME_ANNOUNCEMENT_TEXT, lottery: null as string | null },
    ...latestResults.map((result) => ({
      key: `lottery-${result.lottery}`,
      text: "最新一期開獎資料、Matrix 分析結果已更新。",
      lottery: result.lottery,
    })),
  ];
  const marqueeContentKey = marqueeItems.map((item) => item.key).join("|");
  const [marqueeState, setMarqueeState] = useState(() => ({
    contentKey: marqueeContentKey,
    index: 0,
    cycle: 0,
  }));
  const [marqueeTiming, setMarqueeTiming] = useState<{ itemKey: string; durationMs: number } | null>(null);
  const announcementRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const contentChanged = marqueeState.contentKey !== marqueeContentKey;
  const activeIndex = contentChanged ? 0 : marqueeState.index % marqueeItems.length;
  const activeItem = marqueeItems[activeIndex];
  const activeItemKey = `${marqueeContentKey}:${activeItem.key}:${marqueeState.cycle}`;
  const activeDurationMs = marqueeTiming?.itemKey === activeItemKey ? marqueeTiming.durationMs : null;
  const marqueeStyle = activeDurationMs === null
    ? undefined
    : ({ "--home-announcement-duration": `${activeDurationMs}ms` } as CSSProperties);

  useEffect(() => {
    if (!contentChanged) return;
    setMarqueeState((current) => ({
      contentKey: marqueeContentKey,
      index: 0,
      cycle: current.cycle + 1,
    }));
  }, [contentChanged, marqueeContentKey]);

  useEffect(() => {
    const announcement = announcementRef.current;
    const track = trackRef.current;
    if (!announcement || !track) return undefined;

    const updateTiming = () => {
      const viewportWidth = announcement.clientWidth;
      const contentWidth = track.scrollWidth;
      if (viewportWidth <= 0 || contentWidth <= 0) return;

      setMarqueeTiming({
        itemKey: activeItemKey,
        durationMs: Math.round(((viewportWidth + contentWidth) / HOME_ANNOUNCEMENT_SPEED_PX_PER_SECOND) * 1000),
      });
    };

    const advanceMarquee = (event: AnimationEvent) => {
      if (event.target !== track) return;
      setMarqueeState((current) => ({
        contentKey: marqueeContentKey,
        index: (current.index + 1) % marqueeItems.length,
        cycle: current.cycle + 1,
      }));
    };

    updateTiming();
    track.addEventListener("animationend", advanceMarquee);
    window.addEventListener("resize", updateTiming);
    return () => {
      track.removeEventListener("animationend", advanceMarquee);
      window.removeEventListener("resize", updateTiming);
    };
  }, [activeItemKey, marqueeContentKey, marqueeItems.length]);

  return (
    <section ref={announcementRef} className="home-announcement" aria-label="公告" data-testid="home-announcement">
      <div
        ref={trackRef}
        className="home-announcement-track"
        key={activeItemKey}
        data-marquee-ready={activeDurationMs === null ? "false" : "true"}
        style={marqueeStyle}
      >
        <span className="home-announcement-text">
          {activeItem.lottery === null ? (
            activeItem.text
          ) : (
            <>【<span className="home-announcement-lottery-name" data-testid={`home-announcement-lottery-${activeItem.lottery}`}>{activeItem.lottery}</span>】{activeItem.text}</>
          )}
        </span>
      </div>
    </section>
  );
}

export function HomeShortcutRow({ onNavigate }: { onNavigate?: (screen: ScreenId) => void }) {
  return (
    <nav className="home-shortcut-row home-features-box" aria-label="四大功能" data-testid="home-shortcut-row">
      {HOME_SHORTCUTS.map((item) => (
        <button className="home-shortcut" type="button" key={item.screen} onClick={() => onNavigate?.(item.screen)}>
          <img src={item.image} alt="" width={1254} height={1254} draggable={false} />
          <span className="home-shortcut-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export type BrandLoadingProps = { visible: boolean; onComplete?: () => void; className?: string };
export function BrandLoading({ visible, onComplete, className = "" }: BrandLoadingProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => { setHost(document.querySelector<HTMLElement>(".mobile-page")); }, []);
  if (!visible || !host) return null;
  return createPortal(<section className={`brand-loading ${className}`.trim()} role="status" aria-label="Loading" aria-live="polite" data-testid="brand-loading"><video className="brand-loading-video" src="/assets/lottery/matrix-startup.mp4" autoPlay muted playsInline preload="auto" onEnded={onComplete} onError={onComplete} aria-label="樂彩 Matrix 啟動畫面" /></section>, host);
}

export type PrototypeProps = { isLoading?: boolean };
export default function Prototype({ isLoading = false }: PrototypeProps) {
  const enterPage = useLinePageEntry();
  const [startupVisible, setStartupVisible] = useState(isLoading);
  const [selected, setSelected] = useState<LotteryId>("今彩539");
  const [order, setOrder] = useState<DrawOrder>("順球");
  const [screen, setScreen] = useState<ScreenId>("home");
  const [historyReturnScreen, setHistoryReturnScreen] = useState<ScreenId>("home");
  const [quickReturnScreen, setQuickReturnScreen] = useState<ScreenId>("home");
  const [quickActive, setQuickActive] = useState(false);
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
  const [quickTarget, setQuickTarget] = useState<ScreenId | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = window.localStorage.getItem("matrix-quick-target") as ScreenId | null;
      return QUICK_OPTIONS.some((option) => option.screen === stored) ? stored : null;
    } catch {
      return null;
    }
  });
  const { deviceId, setDeviceId } = useMobileDevice();
  const { data: latestDraw, refresh: refreshLatestDraw } = useLatestLotteryDraw(selected, {
    subscribeToRefresh: false,
    initialFetch: false,
  });
  const [latestAnnouncementResults, setLatestAnnouncementResults] = useState<LatestLotteryResult[]>([]);
  const [matrixStatuses, setMatrixStatuses] = useState<MatrixStatusMap>(MATRIX_STATUS_BY_LOTTERY);
  const [matrixStatusLoads, setMatrixStatusLoads] = useState<StatusLoadStates>(loadingStatusStates);
  const [statusLottery, setStatusLottery] = useState<LotteryId>("今彩539");
  const selectedRef = useRef<LotteryId>(selected);
  const latestDrawRefreshRef = useRef(refreshLatestDraw);
  const selectedRefreshMounted = useRef(false);
  const completedHomeRefreshCycles = useRef(new Set<string>());
  const homepageSessionInvalidator = useRef<(() => void) | null>(null);
  selectedRef.current = selected;
  latestDrawRefreshRef.current = refreshLatestDraw;

  const nextDrawInfo: NextDrawInfoData = latestDraw?.nextDrawAt
    ? {
        nextDraw: formatNextDrawAt(latestDraw.nextDrawAt),
        remainingTime: "00:00:00",
        nextDrawAt: latestDraw.nextDrawAt,
      }
    : NEXT_DRAW_INFO[selected];
  const drawResult: DrawResultData = latestDraw ? toDrawResult(selected, latestDraw) : DRAW_RESULTS[selected];

  useEffect(() => { setDeviceId("pixel-10"); }, [setDeviceId]);
  useEffect(() => subscribeAlgorithmCacheScope(() => {
    setMatrixStatuses(MATRIX_STATUS_BY_LOTTERY);
    setMatrixStatusLoads(loadingStatusStates());
    homepageSessionInvalidator.current?.();
  }, { notifyOnInitialize: true }), []);
  useEffect(() => {
    if (!selectedRefreshMounted.current) {
      selectedRefreshMounted.current = true;
      return;
    }
    void refreshLatestDraw();
  }, [refreshLatestDraw, selected]);

  useEffect(() => {
    if (screen !== "home") return;
    let active = true;
    let generation = 0;
    let request: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let queued: ReturnType<typeof setTimeout> | undefined;
    let firstRefresh = true;
    const allLotteries = LOTTERIES.map(({ id }) => id);

    const clearTimer = () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    };

    const drawMatchesCycle = (record: LotteryDrawRecord | null | undefined, cycleDate: string) => {
      const rawDate = String(record?.drawDate ?? record?.date ?? "").slice(0, 10).replaceAll("/", "-");
      return record?.resultStatus === "confirmed" && rawDate === cycleDate;
    };

    const scheduleNext = () => {
      if (!active) return;
      clearTimer();
      const now = new Date();
      const cycle = homepageRefreshCycleAt(now);
      const pending = cycle
        ? !completedHomeRefreshCycles.current.has(homepageRefreshCycleKey(cycle))
        : false;
      const delay = pending
        ? HOME_REFRESH_INTERVAL_MS
        : millisecondsUntilNextHomepageRefreshWindow(now);
      timer = setTimeout(() => {
        timer = undefined;
        if (!active) return;
        const currentCycle = homepageRefreshCycleAt(new Date());
        if (currentCycle
          && !completedHomeRefreshCycles.current.has(homepageRefreshCycleKey(currentCycle))) {
          void refresh(false);
        } else {
          scheduleNext();
        }
      }, delay);
    };

    const applyStatusBatch = async (
      lotteries: LotteryId[],
      signal: AbortSignal,
      current: number,
    ): Promise<Set<LotteryId>> => {
      if (!lotteries.length) return new Set();
      const result = await withDeadline(
        (requestSignal) => fetchMatrixStatusSummaries(lotteries, requestSignal),
        { signal },
      );
      if (!active || current !== generation) return new Set();
      const items = new Map(result.items.map((item) => [item.lottery, item] as const));
      const ready = new Set<LotteryId>();
      for (const lottery of lotteries) {
        const item = items.get(lottery);
        if (!item || item.status !== 200 || !("kind" in item.body) || item.body.kind !== "status-summary" || !("summary" in item.body)) {
          setMatrixStatusLoads((previous) => ({ ...previous, [lottery]: "error" }));
          continue;
        }
        const summary = (item.body as { summary: MatrixStatusSummary }).summary;
        ready.add(lottery);
        setMatrixStatuses((previous) => ({
          ...previous,
          [lottery]: toHomepageMatrixStatus(summary),
        }));
        setMatrixStatusLoads((previous) => ({ ...previous, [lottery]: "ready" }));
      }
      return ready;
    };

    const readStatuses = async (
      lotteries: LotteryId[],
      signal: AbortSignal,
      current: number,
    ): Promise<Set<LotteryId>> => {
      try {
        return await applyStatusBatch(lotteries, signal, current);
      } catch {
        if (active && current === generation) {
          for (const lottery of lotteries) {
            setMatrixStatusLoads((previous) => ({ ...previous, [lottery]: "error" }));
          }
        }
        return new Set();
      }
    };

    const refresh = async (forceAll: boolean) => {
      if (!active || document.visibilityState === "hidden") {
        scheduleNext();
        return;
      }
      const current = ++generation;
      request?.abort();
      request = new AbortController();
      const signal = request.signal;
      const cycle = homepageRefreshCycleAt(new Date());
      const hydrateAll = forceAll || firstRefresh;

      try {
        let state: Awaited<ReturnType<typeof fetchLatestLotteryResultState>> | null = null;
        let readyStatuses = new Set<LotteryId>();
        let refreshedDraw: LotteryDrawRecord | null | undefined;

        if (hydrateAll) {
          const [stateResult, statusResult, drawResult] = await Promise.all([
            fetchLatestLotteryResultState(cycle?.cycleDate, signal).catch(() => null),
            readStatuses(allLotteries, signal, current),
            latestDrawRefreshRef.current(),
          ]);
          if (!active || current !== generation) return;
          state = stateResult;
          readyStatuses = statusResult;
          refreshedDraw = drawResult;
        } else {
          state = await fetchLatestLotteryResultState(cycle?.cycleDate, signal);
          if (!active || current !== generation) return;
        }

        if (state) setLatestAnnouncementResults(state.items);

        const dueLotteries = cycle && state
          ? state.dueLotteries.filter((lottery): lottery is LotteryId => (
              cycle.lotteries.some((candidate) => candidate === lottery)
            ))
          : [];

        if (!hydrateAll) {
          readyStatuses = await readStatuses(dueLotteries, signal, current);
          if (!active || current !== generation) return;
          if (dueLotteries.includes(selectedRef.current)) {
            refreshedDraw = await latestDrawRefreshRef.current();
            if (!active || current !== generation) return;
          }
        }

        if (cycle && state) {
          const key = homepageRefreshCycleKey(cycle);
          const completedLotteries = state.drawDate === cycle.cycleDate
            ? new Set(state.items.map(({ lottery }) => lottery))
            : new Set<LotteryId>();
          const backendComplete = dueLotteries.length === 0
            || dueLotteries.every((lottery) => completedLotteries.has(lottery));
          const statusComplete = dueLotteries.length === 0
            || dueLotteries.every((lottery) => readyStatuses.has(lottery));
          const selectedIsDue = dueLotteries.includes(selectedRef.current);
          const drawComplete = !selectedIsDue
            || drawMatchesCycle(refreshedDraw, cycle.cycleDate);

          if (backendComplete && statusComplete && drawComplete) {
            completedHomeRefreshCycles.current.add(key);
          } else {
            completedHomeRefreshCycles.current.delete(key);
          }
        }

        firstRefresh = false;
      } catch {
        // Keep the last valid UI snapshot. Active pending windows retry on the
        // shared ten-minute fallback; outside a window no network poll runs.
      } finally {
        if (active && current === generation) scheduleNext();
      }
    };

    const queueRefresh = (forceAll = false) => {
      if (!active || document.visibilityState === "hidden") return;
      if (!forceAll) {
        const cycle = homepageRefreshCycleAt(new Date());
        if (!cycle || completedHomeRefreshCycles.current.has(homepageRefreshCycleKey(cycle))) {
          return;
        }
      }
      if (queued !== undefined) return;
      queued = setTimeout(() => {
        queued = undefined;
        void refresh(forceAll);
      }, 0);
    };

    const invalidate = () => {
      const cycle = homepageRefreshCycleAt(new Date());
      if (cycle) completedHomeRefreshCycles.current.delete(homepageRefreshCycleKey(cycle));
      generation += 1;
      request?.abort();
      setMatrixStatuses(MATRIX_STATUS_BY_LOTTERY);
      setMatrixStatusLoads(loadingStatusStates());
      queueRefresh(true);
    };

    homepageSessionInvalidator.current = invalidate;
    void refresh(true);
    const unsubscribe = subscribeMatrixDataRevision(invalidate);
    const wake = () => queueRefresh(false);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);

    return () => {
      active = false;
      generation += 1;
      request?.abort();
      clearTimer();
      if (queued !== undefined) clearTimeout(queued);
      unsubscribe();
      if (homepageSessionInvalidator.current === invalidate) homepageSessionInvalidator.current = null;
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [screen]);
  useEffect(() => { if (!startupVisible) return; const fallback = window.setTimeout(() => setStartupVisible(false), 6500); return () => window.clearTimeout(fallback); }, [startupVisible]);
  useEffect(() => { const activeElement = document.activeElement; if (activeElement instanceof HTMLElement) activeElement.blur(); const deviceScreen = document.querySelector<HTMLElement>(".device-screen"); const mobileScroll = document.querySelector<HTMLElement>(".mobile-scroll"); if (deviceScreen) deviceScreen.scrollTop = 0; if (mobileScroll) mobileScroll.scrollTop = 0; }, [screen]);

  const navigate = (next: ScreenId) => enterPage(next, () => { if (next === "history") setHistoryReturnScreen(screen); setQuickActive(false); setScreen(next); });
  const closeQuick = () => { if (!quickActive) return; enterPage(quickReturnScreen, () => { setQuickActive(false); setScreen(quickReturnScreen); }); };
  const openQuick = () => { if (quickActive) { closeQuick(); return; } if (!quickTarget) { setQuickSettingsOpen(true); return; } enterPage(quickTarget, () => { setQuickReturnScreen(screen); if (quickTarget === "history") setHistoryReturnScreen(screen); setQuickActive(true); setScreen(quickTarget); }); };
  const selectQuickTarget = (next: ScreenId) => enterPage(next, () => { setQuickTarget(next); try { window.localStorage.setItem("matrix-quick-target", next); } catch {} setQuickSettingsOpen(false); setQuickReturnScreen(screen); if (next === "history") setHistoryReturnScreen(screen); setQuickActive(true); setScreen(next); });

  const quickSettings = quickSettingsOpen
    ? (
        <div className="quick-settings-backdrop" role="presentation" onClick={() => setQuickSettingsOpen(false)}>
          <section className="quick-settings-dialog" role="dialog" aria-modal="true" aria-label="快捷設定" onClick={(event) => event.stopPropagation()}>
            <h2>快捷設定</h2>
            <div>
              {QUICK_OPTIONS.map((option) => (
                <button type="button" data-selected={quickTarget === option.screen} onClick={() => selectQuickTarget(option.screen)} key={option.screen}>
                  <img src={option.image} alt="" />
                  <strong>{option.label}</strong>
                  {quickTarget === option.screen ? <span className="quick-selected-dot" /> : null}
                </button>
              ))}
            </div>
          </section>
        </div>
      )
    : null;

  if (screen !== "home") {
    return <><FirstVisitGuide enabled={false} onNavigate={navigate} /><QuickNavigationProvider onQuickOpen={openQuick} onQuickConfigure={() => setQuickSettingsOpen(true)} onQuickBack={closeQuick} currentScreen={screen} quickTarget={quickTarget} quickActive={quickActive}><MobileScroll className="app-screen"><FeaturePageLoadBoundary resetKey={screen} onHome={() => navigate("home")}><FeaturePageRouter screen={screen} onNavigate={navigate} historyReturnScreen={historyReturnScreen} statusLottery={statusLottery} onQuickOpen={openQuick} onQuickConfigure={() => setQuickSettingsOpen(true)} quickActive={quickActive} /></FeaturePageLoadBoundary>{quickSettings}</MobileScroll></QuickNavigationProvider></>;
  }

  return (
    <>
    <FirstVisitGuide enabled={!startupVisible} onNavigate={navigate} />
    <section className="home-screen">
      <BrandLoading visible={startupVisible} onComplete={() => setStartupVisible(false)} />
      <header className="brand-header home-logo-box">
        <div className="home-brand-frame">
          <img className="home-logo-image" src={HOME_ASSETS.logo} alt="樂彩 Matrix" width={2154} height={634} draggable={false} />
          <HomeQuickSettingsButton onOpen={() => setQuickSettingsOpen(true)} />
        </div>
      </header>
      <MobileScroll className="app-screen home-content">
        <div className="home-layout">
          <main className="screen-content lottery-screen" data-testid="lottery-screen" aria-label="首頁彩種切換元件預覽">
            <HomeAnnouncement latestResults={latestAnnouncementResults} />
            <LotterySwitcher selected={selected} onChange={setSelected} className="lottery-switcher--home-style home-switcher-box" />
            <LatestDrawCard lottery={selected} result={drawResult} nextDrawInfo={nextDrawInfo} order={order} onOrderChange={setOrder} onOpenHistory={() => navigate("history")} className="home-draw-box" />
            <MatrixStatusSection statuses={matrixStatuses} loadStates={matrixStatusLoads} onOpen={(lottery) => { setStatusLottery(lottery); navigate("status"); }} />
          </main>
          <div className="home-bottom-group">
            <MatrixCoreBanner onOpen={() => navigate("explore")} />
            <HomeShortcutRow onNavigate={navigate} />
          </div>
          <BottomNavigation active="首頁" onNavigate={navigate} onQuickOpen={openQuick} />
        </div>
        {quickSettings}
      </MobileScroll>
    </section>
    </>
  );
}
