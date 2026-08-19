import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarIcon,
  ChevronRightIcon,
  ClockIcon,
  CountdownTimerIcon,
} from "@radix-ui/react-icons";
import { MobileScroll, useMobileDevice } from "./mobile";
import { FeaturePageRouter, QuickNavigationProvider, type ScreenId } from "./FeaturePages";
import { BottomNavigation } from "./BottomNavigation";
import { PRIMARY_BRAND_LOGO } from "./BrandLogo";
import { useLatestLotteryDraw } from "./useLatestLotteryDraw";
import { NumberBall as LotteryNumberBall, normalizeBallNumber } from "./NumberBall";
import type { LotteryDrawRecord } from "./lottery-api";
import { formatCountdown, formatNextDrawAt, nextCountdownSeconds, parseCountdown, secondsUntil } from "./countdown.mjs";

export type LotteryId = "今彩539" | "天天樂" | "六合彩" | "大樂透";
export type DrawOrder = "順球" | "落球";

type LotteryOption = {
  id: LotteryId;
  logo: string;
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
  status: "啟動" | "聚合" | "共振" | "臨界";
  statusEn: "ACTIVE" | "FOCUS" | "RESONANCE" | "CRITICAL";
  artwork: string;
  count: number;
  description: string;
  tone: "green" | "blue" | "purple" | "orange";
};

export type MatrixStatusMap = Record<LotteryId, MatrixStatusData>;

const LOTTERIES: LotteryOption[] = [
  { id: "今彩539", logo: "/assets/lottery/jincai-539-logo.png" },
  { id: "天天樂", logo: "/assets/lottery/fantasy-5-logo.png" },
  { id: "六合彩", logo: "/assets/lottery/mark-six-logo.png" },
  { id: "大樂透", logo: "/assets/lottery/lotto-649-logo.png" },
];

const HOME_ASSET_BASE = "/assets/lottery/functions";
const STATUS_ASSET_BASE = "/assets/lottery/status";

const HOME_ASSETS = {
  logo: PRIMARY_BRAND_LOGO,
  lotterySwitcher: `${STATUS_ASSET_BASE}/Matrixbba.png`,
  drawCard: `${HOME_ASSET_BASE}/開獎資訊卡.png`,
  matrixStatus: `${STATUS_ASSET_BASE}/matrixAA.png`,
  matrixCore: `${HOME_ASSET_BASE}/matrixcore.png`,
  tongxing: `${HOME_ASSET_BASE}/同星.png`,
  reference: `${HOME_ASSET_BASE}/對照單.png`,
  calculator: `${HOME_ASSET_BASE}/計算機.png`,
  matrixCard: `${HOME_ASSET_BASE}/牌單.png`,
  guide: `${HOME_ASSET_BASE}/指南.png`,
} as const;

const HOME_SHORTCUTS = [
  { label: "Matrix 同星", image: HOME_ASSETS.tongxing },
  { label: "號碼對照單", image: HOME_ASSETS.reference },
  { label: "連碰立柱計算機", image: HOME_ASSETS.calculator },
  { label: "Matrix 牌單", image: HOME_ASSETS.matrixCard },
  { label: "Matrix 指南", image: HOME_ASSETS.guide },
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

const MATRIX_STATUS_BY_LOTTERY: MatrixStatusMap = {
  今彩539: { status: "啟動", statusEn: "ACTIVE", artwork: "/assets/lottery/status/active.png", count: 2, description: "具備基本參考價值", tone: "green" },
  天天樂: { status: "聚合", statusEn: "FOCUS", artwork: "/assets/lottery/status/focus.png", count: 1, description: "具備明顯規律集中性", tone: "blue" },
  "六合彩": { status: "共振", statusEn: "RESONANCE", artwork: "/assets/lottery/status/resonance.png", count: 3, description: "具備強烈共振效應", tone: "purple" },
  大樂透: { status: "臨界", statusEn: "CRITICAL", artwork: "/assets/lottery/status/critical.png", count: 4, description: "極為罕見版路狀態", tone: "orange" },
};

export type LotterySwitcherProps = {
  selected: LotteryId;
  onChange: (lottery: LotteryId) => void;
  className?: string;
};

export function LotterySwitcher({ selected, onChange, className = "" }: LotterySwitcherProps) {
  return (
    <div data-lottery-switcher="" className={`lottery-switcher ${className}`.trim()} data-selected-lottery={selected} data-testid="lottery-switcher">
      <img className="home-asset-image" src={HOME_ASSETS.lotterySwitcher} alt="" draggable={false} />
      <div className="lottery-switcher-hit-grid" role="radiogroup" aria-label="選擇彩種">
        {LOTTERIES.map((lottery) => {
          const isSelected = lottery.id === selected;
          return (
            <button data-lottery-card="" className="lottery-card" data-lottery={lottery.id} data-selected={isSelected} key={lottery.id} onClick={() => onChange(lottery.id)} role="radio" aria-checked={isSelected} aria-label={lottery.id} type="button">
              <span className="clean-hit-label">{lottery.id}</span>
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
    return { numbers: normalized.slice(0, 6), specialNumber: normalized[6] };
  }
  return { numbers: normalized.slice(0, 5), specialNumber: undefined };
}

function toDrawResult(lottery: LotteryId, record: LotteryDrawRecord): DrawResultData {
  const sorted = splitDrawNumbers(lottery, record.sortedNumbers?.length ? record.sortedNumbers : record.numbers);
  const drawOrder = splitDrawNumbers(lottery, record.drawOrderNumbers?.length ? record.drawOrderNumbers : record.numbers);
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

export function LatestDrawCard({ lottery, result, nextDrawInfo, order, onOrderChange, onOpenHistory, className = "" }: LatestDrawCardProps) {
  const displayedNumbers = order === "順球" ? result.numbers : result.drawOrderNumbers ?? result.numbers;
  const displayedSpecialNumber = order === "順球" ? result.specialNumber : result.drawOrderSpecialNumber ?? result.specialNumber;
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
          <button type="button" role="radio" aria-checked={order === option} data-selected={order === option} onClick={() => onOrderChange(option)} key={option}>{option}</button>
        ))}
      </div>
      <button className="history-link" type="button" onClick={onOpenHistory} aria-label="查看更多紀錄"><span>查看更多紀錄</span><span aria-hidden="true">&gt;</span></button>
      <div className="draw-balls" data-has-special={hasSpecial}>
        <div className="main-balls">
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
  const [remainingSeconds, setRemainingSeconds] = useState(() => nextDrawAt ? secondsUntil(nextDrawAt) : parseCountdown(remainingTime));
  useEffect(() => {
    setRemainingSeconds(nextDrawAt ? secondsUntil(nextDrawAt) : parseCountdown(remainingTime));
    const timer = window.setInterval(() => {
      setRemainingSeconds((currentSeconds) => nextDrawAt ? secondsUntil(nextDrawAt) : nextCountdownSeconds(currentSeconds));
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

export type MatrixStatusSectionProps = { statuses?: MatrixStatusMap; onOpen?: () => void };
export function MatrixStatusSection({ onOpen }: MatrixStatusSectionProps = {}) {
  return (
    <section className="matrix-status-section home-status-box" aria-label="Matrix 狀態" data-testid="matrix-status-section">
      <img className="home-asset-image" src={HOME_ASSETS.matrixStatus} alt="" draggable={false} />
      <div className="matrix-status-hit-grid" aria-label="Matrix 四種狀態">
        {["啟動", "聚合", "共振", "臨界"].map((label) => (
          <button type="button" aria-label={label} key={label} onClick={onOpen}><span className="clean-hit-label">{label}</span></button>
        ))}
      </div>
    </section>
  );
}

export function MatrixCoreBanner({ onOpen }: { onOpen?: () => void }) {
  return <button type="button" className="matrix-core-banner home-core-box" aria-label="Matrix Core" data-testid="matrix-core-banner" onClick={onOpen}><img className="home-asset-image" src={HOME_ASSETS.matrixCore} alt="Matrix Core｜分析核心・智慧運算" draggable={false} /></button>;
}

export function HomeShortcutRow({ onNavigate }: { onNavigate?: (screen: ScreenId) => void }) {
  const screens: Record<(typeof HOME_SHORTCUTS)[number]["label"], ScreenId> = { "Matrix 同星": "tongxing", "號碼對照單": "reference", "連碰立柱計算機": "calculator", "Matrix 牌單": "matrix-card", "Matrix 指南": "guide" };
  return <nav className="home-shortcut-row home-features-box" aria-label="五大功能" data-testid="home-shortcut-row">{HOME_SHORTCUTS.map((item) => <button className="home-shortcut" type="button" aria-label={item.label} key={item.label} onClick={() => onNavigate?.(screens[item.label])}><img src={item.image} alt="" draggable={false} /></button>)}</nav>;
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
  const [startupVisible, setStartupVisible] = useState(isLoading);
  const [selected, setSelected] = useState<LotteryId>("今彩539");
  const [order, setOrder] = useState<DrawOrder>("順球");
  const [screen, setScreen] = useState<ScreenId>("home");
  const [historyReturnScreen, setHistoryReturnScreen] = useState<ScreenId>("home");
  const [quickReturnScreen, setQuickReturnScreen] = useState<ScreenId>("home");
  const [quickActive, setQuickActive] = useState(false);
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
  const [quickSettingsHost, setQuickSettingsHost] = useState<HTMLElement | null>(null);
  const [quickTarget, setQuickTarget] = useState<ScreenId | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = window.localStorage.getItem("matrix-quick-target") as ScreenId | null;
    return QUICK_OPTIONS.some((option) => option.screen === stored) ? stored : null;
  });
  const { deviceId, setDeviceId } = useMobileDevice();
  const { data: latestDraw } = useLatestLotteryDraw(selected);
  const nextDrawInfo: NextDrawInfoData = latestDraw?.nextDrawAt ? { nextDraw: formatNextDrawAt(latestDraw.nextDrawAt), remainingTime: "00:00:00", nextDrawAt: latestDraw.nextDrawAt } : NEXT_DRAW_INFO[selected];
  const drawResult: DrawResultData = latestDraw ? toDrawResult(selected, latestDraw) : DRAW_RESULTS[selected];
  useEffect(() => { setDeviceId("pixel-10"); }, [setDeviceId]);
  useEffect(() => { setQuickSettingsHost(document.querySelector<HTMLElement>(".mobile-page")); }, []);
  useEffect(() => { if (!startupVisible) return; const fallback = window.setTimeout(() => setStartupVisible(false), 6500); return () => window.clearTimeout(fallback); }, [startupVisible]);
  useEffect(() => { const activeElement = document.activeElement; if (activeElement instanceof HTMLElement) activeElement.blur(); const deviceScreen = document.querySelector<HTMLElement>(".device-screen"); const mobileScroll = document.querySelector<HTMLElement>(".mobile-scroll"); if (deviceScreen) deviceScreen.scrollTop = 0; if (mobileScroll) mobileScroll.scrollTop = 0; }, [screen]);
  const navigate = (next: ScreenId) => { if (next === "history") setHistoryReturnScreen(screen); setQuickActive(false); setScreen(next); };
  const openQuick = () => { if (quickActive) { setQuickActive(false); setScreen(quickReturnScreen); return; } if (!quickTarget) return; setQuickReturnScreen(screen); if (quickTarget === "history") setHistoryReturnScreen(screen); setQuickActive(true); setScreen(quickTarget); };
  const selectQuickTarget = (next: ScreenId) => { setQuickTarget(next); window.localStorage.setItem("matrix-quick-target", next); setQuickSettingsOpen(false); setQuickReturnScreen(screen); if (next === "history") setHistoryReturnScreen(screen); setQuickActive(true); setScreen(next); };
  const quickSettings = quickSettingsOpen && quickSettingsHost ? createPortal(<div className="quick-settings-backdrop" role="presentation" onClick={() => setQuickSettingsOpen(false)}><section className="quick-settings-dialog" role="dialog" aria-modal="true" aria-label="快捷設定" onClick={(event) => event.stopPropagation()}><h2>快捷設定</h2><div>{QUICK_OPTIONS.map((option) => <button type="button" data-selected={quickTarget === option.screen} onClick={() => selectQuickTarget(option.screen)} key={option.screen}><img src={option.image} alt="" /><strong>{option.label}</strong>{quickTarget === option.screen ? <span className="quick-selected-dot" /> : null}</button>)}</div></section></div>, quickSettingsHost) : null;
  if (screen !== "home") {
    return <QuickNavigationProvider onQuickOpen={openQuick} onQuickConfigure={() => setQuickSettingsOpen(true)} currentScreen={screen} quickTarget={quickTarget} quickActive={quickActive}><MobileScroll className="app-screen"><FeaturePageRouter screen={screen} onNavigate={navigate} historyReturnScreen={historyReturnScreen} />{quickSettings}</MobileScroll></QuickNavigationProvider>;
  }
  return (
    <MobileScroll className="app-screen home-screen">
      <BrandLoading visible={startupVisible} onComplete={() => setStartupVisible(false)} />
      <div className="home-layout">
        <main className="screen-content lottery-screen" data-testid="lottery-screen" aria-label="首頁彩種切換元件預覽">
          <header className="brand-header home-logo-box"><img className="home-logo-image" src={HOME_ASSETS.logo} alt="樂彩 Matrix" draggable={false} /></header>
          <LotterySwitcher selected={selected} onChange={setSelected} className="home-switcher-box" />
          <LatestDrawCard lottery={selected} result={drawResult} nextDrawInfo={nextDrawInfo} order={order} onOrderChange={setOrder} onOpenHistory={() => navigate("history")} className="home-draw-box" />
          <MatrixStatusSection onOpen={() => navigate("status")} />
        </main>
        <div className="home-bottom-group">
          <MatrixCoreBanner onOpen={() => navigate("explore")} />
          <HomeShortcutRow onNavigate={navigate} />
        </div>
        <BottomNavigation active="首頁" onNavigate={navigate} onQuickOpen={openQuick} onQuickConfigure={() => setQuickSettingsOpen(true)} />
      </div>
      {quickSettings}
    </MobileScroll>
  );
}
