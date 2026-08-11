import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronRightIcon,
  ClockIcon,
  CountdownTimerIcon,
  Pencil2Icon,
} from "@radix-ui/react-icons";
import { MobileScroll, useMobileDevice } from "./mobile";
import { BrandLogo } from "./BrandLogo";
import { FeaturePageRouter, QuickNavigationProvider, type ScreenId } from "./FeaturePages";
import { BottomNavigation } from "./BottomNavigation";
import { useLatestLotteryDraw } from "./useLatestLotteryDraw";

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
  specialNumber?: string;
};

export type NextDrawInfoData = {
  nextDraw: string;
  remainingTime: string;
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
  {
    id: "今彩539",
    logo: "/assets/lottery/jincai-539-logo.png",
  },
  {
    id: "天天樂",
    logo: "/assets/lottery/fantasy-5-logo.png",
  },
  {
    id: "六合彩",
    logo: "/assets/lottery/mark-six-logo.png",
  },
  {
    id: "大樂透",
    logo: "/assets/lottery/lotto-649-logo.png",
  },
];

const HOME_SHORTCUTS = [
  { label: 'Matrix 同星', image: '/assets/lottery/functions/matrix-tongxing.svg' },
  { label: '號碼對照單', image: '/assets/lottery/functions/number-reference.svg' },
  { label: '連碰立柱計算機', image: '/assets/lottery/functions/collision-column-calculator.svg' },
  { label: 'Matrix 牌單', image: '/assets/lottery/functions/matrix-card.svg' },
  { label: 'Matrix 指南', image: '/assets/lottery/functions/matrix-guide.svg' },
] as const;

const QUICK_OPTIONS = [
  { label: "Matrix 同星", screen: "tongxing" as const, image: "/assets/quick/settings/matrix-tongxing.png" },
  { label: "號碼對照單", screen: "reference" as const, image: "/assets/quick/settings/number-reference.png" },
  { label: "連碰立柱計算機", screen: "calculator" as const, image: "/assets/quick/settings/collision-column-calculator.png" },
  { label: "歷史開獎號碼", screen: "history" as const, image: "/assets/quick/settings/draw-history.png" },
  { label: "Matrix 筆記本", screen: "notebook" as const, image: "/assets/quick/settings/matrix-notebook.png" },
] as const;

const DRAW_RESULTS: Record<LotteryId, DrawResultData> = {
  今彩539: {
    issue: "5896",
    date: "2026/06/23（二）",
    numbers: ["02", "14", "25", "29", "36"],
  },
  天天樂: {
    issue: "5896",
    date: "2026/06/23（二）",
    numbers: ["03", "12", "18", "27", "34"],
  },
  六合彩票: {
    issue: "5896",
    date: "2026/06/23（二）",
    numbers: ["21", "18", "07", "44", "13", "38"],
    specialNumber: "03",
  } as DrawResultData,
  大樂透: {
    issue: "5896",
    date: "2026/06/23（二）",
    numbers: ["21", "18", "07", "44", "13", "38"],
    specialNumber: "03",
  },
} as unknown as Record<LotteryId, DrawResultData>;
DRAW_RESULTS["六合彩"] = {
  issue: "5896",
  date: "2026/06/23（二）",
  numbers: ["21", "18", "07", "44", "13", "38"],
  specialNumber: "03",
};

const NEXT_DRAW_INFO: Record<LotteryId, NextDrawInfoData> = {
  今彩539: {
    nextDraw: "06/24 (三) 20:30",
    remainingTime: "18:30:00",
  },
  天天樂: {
    nextDraw: "06/24 (三) 20:30",
    remainingTime: "18:30:00",
  },
  六合彩票: {
    nextDraw: "06/24 (三) 20:30",
    remainingTime: "18:30:00",
  } as NextDrawInfoData,
  大樂透: {
    nextDraw: "06/24 (三) 20:30",
    remainingTime: "18:30:00",
  },
} as unknown as Record<LotteryId, NextDrawInfoData>;
NEXT_DRAW_INFO["六合彩"] = {
  nextDraw: "06/24 (三) 20:30",
  remainingTime: "18:30:00",
};

const MATRIX_STATUS_BY_LOTTERY: MatrixStatusMap = {
  今彩539: {
    status: "啟動",
    statusEn: "ACTIVE",
    artwork: "/assets/lottery/status/active.png",
    count: 2,
    description: "具備基本參考價值",
    tone: "green",
  },
  天天樂: {
    status: "聚合",
    statusEn: "FOCUS",
    artwork: "/assets/lottery/status/focus.png",
    count: 1,
    description: "具備明顯規律集中性",
    tone: "blue",
  },
  "六合彩": {
    status: "共振",
    statusEn: "RESONANCE",
    artwork: "/assets/lottery/status/resonance.png",
    count: 3,
    description: "具備強烈共振效應",
    tone: "purple",
  },
  大樂透: {
    status: "臨界",
    statusEn: "CRITICAL",
    artwork: "/assets/lottery/status/critical.png",
    count: 4,
    description: "極為罕見版路狀態",
    tone: "orange",
  },
};

const MARK_SIX_BLUE = new Set([
  "03", "04", "09", "10", "14", "15", "20", "25", "26", "31", "36", "37", "41", "42", "47", "48",
]);

const MARK_SIX_RED = new Set([
  "01", "02", "07", "08", "12", "13", "18", "19", "23", "24", "29", "30", "34", "35", "40", "45", "46",
]);

export type LotterySwitcherProps = {
  selected: LotteryId;
  onChange: (lottery: LotteryId) => void;
  className?: string;
};

export function LotterySwitcher({ selected, onChange, className = "" }: LotterySwitcherProps) {
  return (
    <div data-lottery-switcher="" className={`lottery-switcher ${className}`.trim()} role="radiogroup" aria-label="選擇彩種" data-testid="lottery-switcher">
      {LOTTERIES.map((lottery) => {
        const isSelected = lottery.id === selected;
        return (
          <button data-lottery-card="" className="lottery-card" data-lottery={lottery.id} data-selected={isSelected} key={lottery.id} onClick={() => onChange(lottery.id)} role="radio" aria-checked={isSelected} type="button">
            <span className="lottery-logo" aria-hidden="true"><img src={lottery.logo} alt="" draggable={false} /></span>
            <span className="lottery-label">{lottery.id}</span>
          </button>
        );
      })}
    </div>
  );
}

function getBallTone(lottery: LotteryId, number: string): "orange" | "white" | "red" | "green" | "blue" {
  if (lottery === "今彩539") return "orange";
  if (lottery === "天天樂") return "white";
  if (lottery === "大樂透") return "red";
  if (MARK_SIX_BLUE.has(number)) return "blue";
  if (MARK_SIX_RED.has(number)) return "red";
  return "green";
}

function NumberBall({ lottery, number, isSpecial = false }: { lottery: LotteryId; number: string; isSpecial?: boolean }) {
  const tone = getBallTone(lottery, number);
  const usesDarkText = lottery === "今彩539" || lottery === "天天樂" || lottery === "六合彩";
  return (
    <span className="number-ball" data-lottery={lottery} data-special={isSpecial} data-tone={tone} data-dark-text={usesDarkText} aria-label={`${isSpecial ? "特別號" : "號碼"} ${number}`}>
      <span className="ball-surface" aria-hidden="true" />
      <span className="ball-number" aria-hidden="true">{number}</span>
    </span>
  );
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
  const displayedNumbers = order === "順球" ? [...result.numbers].sort((a, b) => Number(a) - Number(b)) : result.numbers;
  const hasMeta = Boolean(result.issue || result.date);
  const hasSpecial = Boolean(result.specialNumber);
  return (
    <section className={`latest-draw-card ${className}`.trim()} data-lottery={lottery} aria-label={`${lottery}最新開獎資訊`} data-testid="latest-draw-card">
      <div className="draw-toolbar">
        <div className="draw-meta" data-empty={!hasMeta}>
          {result.issue ? <div className="draw-issue"><span>第</span><strong>{result.issue}</strong><span>期</span></div> : null}
          {result.date ? <div className="draw-date">{result.date}</div> : null}
        </div>
        <div className="draw-order" role="radiogroup" aria-label="號碼排列">
          {(["順球", "落球"] as DrawOrder[]).map((option) => (
            <button type="button" role="radio" aria-checked={order === option} data-selected={order === option} onClick={() => onOrderChange(option)} key={option}>{option}</button>
          ))}
        </div>
        <button className="history-link" type="button" onClick={onOpenHistory} aria-label="全部紀錄"><span>全部紀錄</span><span aria-hidden="true">›</span></button>
      </div>
      <div className="draw-balls" data-has-special={hasSpecial}>
        <div className="main-balls">
          {displayedNumbers.map((number, index) => <NumberBall lottery={lottery} number={number} key={`${number}-${index}`} />)}
        </div>
        {result.specialNumber ? <><span className="special-ball-plus" aria-hidden="true">+</span><div className="special-ball-group"><span className="special-label">特別號</span><NumberBall lottery={lottery} number={result.specialNumber} isSpecial /></div></> : null}
      </div>
      <NextDrawInfoBar {...nextDrawInfo} className="next-draw-info--embedded" />
    </section>
  );
}

export type NextDrawInfoBarProps = NextDrawInfoData & { className?: string };
export function NextDrawInfoBar({ nextDraw, remainingTime, className = "" }: NextDrawInfoBarProps) {
  return (
    <section className={`next-draw-info ${className}`.trim()} aria-label="下次開獎資訊" data-testid="next-draw-info">
      <div className="next-draw-item"><ClockIcon className="next-draw-icon" aria-hidden="true" /><span className="next-draw-label">下次開獎</span><span className="next-draw-value">{nextDraw}</span></div>
      <div className="next-draw-item"><CountdownTimerIcon className="next-draw-icon" aria-hidden="true" /><span className="next-draw-label">剩餘時間</span><span className="next-draw-value">{remainingTime}</span></div>
    </section>
  );
}

export type MatrixStatusSectionProps = { statuses?: MatrixStatusMap; onOpen?: () => void };
export function MatrixStatusSection({ statuses = MATRIX_STATUS_BY_LOTTERY, onOpen }: MatrixStatusSectionProps = {}) {
  return (
    <section className="matrix-status-section" aria-labelledby="matrix-status-title" data-testid="matrix-status-section">
      <header className="matrix-status-header"><h2 id="matrix-status-title">Matrix 狀態</h2></header>
      <div className="matrix-status-grid">
        {LOTTERIES.map((lottery) => {
          const item = statuses[lottery.id];
          return (
            <article className="matrix-status-card" data-lottery={lottery.id} data-tone={item.tone} key={lottery.id} onClick={onOpen}>
              <img className="matrix-status-artwork" src={item.artwork} alt={`${item.status} ${item.statusEn}`} draggable={false} />
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function MatrixCoreBanner({ onOpen }: { onOpen?: () => void }) {
  return <button type="button" className="matrix-core-banner" aria-label="Matrix Core" data-testid="matrix-core-banner" onClick={onOpen}><img src="/assets/lottery/matrix-core-banner.jpg" alt="Matrix Core｜分析核心・智慧運算" draggable={false} /></button>;
}

export function HomeShortcutRow({ onNavigate }: { onNavigate?: (screen: ScreenId) => void }) {
  const screens: Record<(typeof HOME_SHORTCUTS)[number]["label"], ScreenId> = { "Matrix 同星": "tongxing", "號碼對照單": "reference", "連碰立柱計算機": "calculator", "Matrix 牌單": "matrix-card", "Matrix 指南": "guide" };
  return <nav className="home-shortcut-row" aria-label="五大功能" data-testid="home-shortcut-row">{HOME_SHORTCUTS.map((item) => <button className="home-shortcut" type="button" aria-label={item.label} key={item.label} onClick={() => onNavigate?.(screens[item.label])}><img src={item.image} alt="" draggable={false} /></button>)}</nav>;
}

export type BrandLoadingProps = { visible: boolean; onComplete?: () => void; className?: string };
export function BrandLoading({ visible, onComplete, className = "" }: BrandLoadingProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => { setHost(document.querySelector<HTMLElement>(".mobile-page")); }, []);
  if (!visible || !host) return null;
  return createPortal(<section className={`brand-loading ${className}`.trim()} role="status" aria-label="Loading" aria-live="polite" data-testid="brand-loading"><video className="brand-loading-video" src="/assets/lottery/matrix-startup.mp4" autoPlay muted playsInline preload="auto" onEnded={onComplete} onError={onComplete} aria-label="樂彩 Matrix 啟動畫面" /></section>, host);
}

function BottomNavigationPortal({ active, onNavigate, onQuickOpen, onQuickConfigure }: { active: "首頁" | "快捷" | "通知" | "我的"; onNavigate: (screen: ScreenId) => void; onQuickOpen: () => void; onQuickConfigure: () => void }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => { setHost(document.querySelector<HTMLElement>(".mobile-page")); }, []);
  return host ? createPortal(<BottomNavigation active={active} onNavigate={onNavigate} onQuickOpen={onQuickOpen} onQuickConfigure={onQuickConfigure} />, host) : null;
}

export type PrototypeProps = { isLoading?: boolean };
export default function Prototype({ isLoading = true }: PrototypeProps) {
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
    const stored = window.localStorage.getItem("matrix-quick-target") as ScreenId | null;
    return QUICK_OPTIONS.some((option) => option.screen === stored) ? stored : null;
  });
  const { deviceId, setDeviceId } = useMobileDevice();
  const nextDrawInfo = NEXT_DRAW_INFO[selected];
  const { data: latestDraw } = useLatestLotteryDraw(selected);
  const drawResult: DrawResultData = latestDraw ? {
    issue: latestDraw.period ?? latestDraw.issue,
    date: latestDraw.drawDate ?? latestDraw.date,
    numbers: latestDraw.numbers.map((number) => String(number).padStart(2, "0")),
    specialNumber: latestDraw.specialNumber != null ? String(latestDraw.specialNumber).padStart(2, "0") : undefined,
  } : DRAW_RESULTS[selected];

  useEffect(() => { setDeviceId("pixel-10"); }, [setDeviceId]);
  useEffect(() => { if (!startupVisible) return; const fallback = window.setTimeout(() => setStartupVisible(false), 6500); return () => window.clearTimeout(fallback); }, [startupVisible]);
  useEffect(() => { const activeElement = document.activeElement; if (activeElement instanceof HTMLElement) activeElement.blur(); const deviceScreen = document.querySelector<HTMLElement>(".device-screen"); const mobileScroll = document.querySelector<HTMLElement>(".mobile-scroll"); if (deviceScreen) deviceScreen.scrollTop = 0; if (mobileScroll) mobileScroll.scrollTop = 0; }, [screen]);

  const navigate = (next: ScreenId) => { if (next === "history") setHistoryReturnScreen(screen); setQuickActive(false); setScreen(next); };
  const openQuick = () => { if (quickActive) { setQuickActive(false); setScreen(quickReturnScreen); return; } if (!quickTarget) return; setQuickReturnScreen(screen); if (quickTarget === "history") setHistoryReturnScreen(screen); setQuickActive(true); setScreen(quickTarget); };
  const selectQuickTarget = (next: ScreenId) => { setQuickTarget(next); window.localStorage.setItem("matrix-quick-target", next); setQuickSettingsOpen(false); setQuickReturnScreen(screen); if (next === "history") setHistoryReturnScreen(screen); setQuickActive(true); setScreen(next); };

  const quickSettings = quickSettingsOpen ? <div className="quick-settings-backdrop" role="presentation" onClick={() => setQuickSettingsOpen(false)}><section className="quick-settings-dialog" role="dialog" aria-modal="true" aria-label="快捷設定" onClick={(event) => event.stopPropagation()}><h2>快捷設定</h2><div>{QUICK_OPTIONS.map((option) => <button type="button" data-selected={quickTarget === option.screen} onClick={() => selectQuickTarget(option.screen)} key={option.screen}><img src={option.image} alt="" /><strong>{option.label}</strong>{quickTarget === option.screen ? <span className="quick-selected-dot" /> : null}</button>)}</div></section></div> : null;

  if (screen !== "home") {
    return <QuickNavigationProvider onQuickOpen={openQuick} onQuickConfigure={() => setQuickSettingsOpen(true)} currentScreen={screen} quickTarget={quickTarget} quickActive={quickActive}><MobileScroll className="app-screen"><FeaturePageRouter screen={screen} onNavigate={navigate} historyReturnScreen={historyReturnScreen} />{quickSettings}</MobileScroll></QuickNavigationProvider>;
  }

  return (
    <MobileScroll className="app-screen home-screen">
      <BrandLoading visible={startupVisible} onComplete={() => setStartupVisible(false)} />
      <main className="screen-content lottery-screen" data-testid="lottery-screen" aria-label="首頁彩種切換元件預覽">
        <header className="brand-header"><BrandLogo className={deviceId === "iphone" ? "brand-logo--iphone" : ""} /></header>
        <LotterySwitcher selected={selected} onChange={setSelected} />
        <LatestDrawCard lottery={selected} result={drawResult} nextDrawInfo={nextDrawInfo} order={order} onOrderChange={setOrder} onOpenHistory={() => navigate("history")} />
        <MatrixStatusSection onOpen={() => navigate("status")} />
        <MatrixCoreBanner onOpen={() => navigate("explore")} />
        <HomeShortcutRow onNavigate={navigate} />
        <BottomNavigationPortal active="首頁" onNavigate={navigate} onQuickOpen={openQuick} onQuickConfigure={() => setQuickSettingsOpen(true)} />
        {quickSettings}
      </main>
    </MobileScroll>
  );
}
