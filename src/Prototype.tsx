import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronRightIcon,
  ClockIcon,
  CountdownTimerIcon,
  DotFilledIcon,
  Pencil2Icon,
} from "@radix-ui/react-icons";
import { MobileScroll, useMobileDevice } from "./mobile";
import { FeaturePageRouter, QuickNavigationProvider, type ScreenId } from "./FeaturePages";
import { BottomNavigation } from "./BottomNavigation";

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

const EMPTY_DRAW_CARD_IMAGE = "data:image/png;base64,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";

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
  { label: 'Matrix 同星', image: '/resources/matrix-tongxing.png' },
  { label: '號碼對照單', image: '/resources/number-reference.png' },
  { label: '連碰立柱計算機', image: '/resources/collision-column-calculator.png' },
  { label: 'Matrix 牌單', image: '/resources/matrix-card.png' },
  { label: 'Matrix 指南', image: '/resources/matrix-guide.png' },
] as const;

const QUICK_OPTIONS = [
  { label: "Matrix 同星", screen: "tongxing" as const, image: "/assets/quick/settings/matrix-tongxing-v2.png" },
  { label: "號碼對照單", screen: "reference" as const, image: "/assets/quick/settings/number-reference-v2.png" },
  { label: "連碰立柱計算機", screen: "calculator" as const, image: "/assets/quick/settings/collision-column-calculator-v2.png" },
  { label: "歷史開獎號碼", screen: "history" as const, image: "/assets/quick/settings/draw-history-v2.png" },
  { label: "Matrix 筆記本", screen: "notebook" as const, image: "/assets/quick/settings/matrix-notebook-v2.png" },
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
  六合彩: {
    issue: "5896",
    date: "2026/06/23（二）",
    numbers: ["21", "18", "07", "44", "13", "38"],
    specialNumber: "03",
  },
  大樂透: {
    issue: "5896",
    date: "2026/06/23（二）",
    numbers: ["21", "18", "07", "44", "13", "38"],
    specialNumber: "03",
  },
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
  六合彩: {
    nextDraw: "06/24 (三) 20:30",
    remainingTime: "18:30:00",
  },
  大樂透: {
    nextDraw: "06/24 (三) 20:30",
    remainingTime: "18:30:00",
  },
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
  "03",
  "04",
  "09",
  "10",
  "14",
  "15",
  "20",
  "25",
  "26",
  "31",
  "36",
  "37",
  "41",
  "42",
  "47",
  "48",
]);

const MARK_SIX_RED = new Set([
  "01",
  "02",
  "07",
  "08",
  "12",
  "13",
  "18",
  "19",
  "23",
  "24",
  "29",
  "30",
  "34",
  "35",
  "40",
  "45",
  "46",
]);

export type LotterySwitcherProps = {
  selected: LotteryId;
  onChange: (lottery: LotteryId) => void;
  className?: string;
};

export function LotterySwitcher({
  selected,
  onChange,
  className = "",
}: LotterySwitcherProps) {
  return (
    <div data-lottery-switcher=""
      className={`lottery-switcher ${className}`.trim()}
      role="radiogroup"
      aria-label="選擇彩種"
      data-testid="lottery-switcher"
    >
      {LOTTERIES.map((lottery) => {
        const isSelected = lottery.id === selected;

        return (
          <button data-lottery-card=""
            className="lottery-card"
            data-lottery={lottery.id}
            data-selected={isSelected}
            key={lottery.id}
            onClick={() => onChange(lottery.id)}
            role="radio"
            aria-checked={isSelected}
            type="button"
          >
            <span className="lottery-logo" aria-hidden="true">
              <img src={lottery.logo} alt="" draggable={false} />
            </span>
            <span className="lottery-label">{lottery.id}</span>
          </button>
        );
      })}
    </div>
  );
}

function getBallTone(
  lottery: LotteryId,
  number: string,
): "orange" | "white" | "red" | "green" | "blue" {
  if (lottery === "今彩539") return "orange";
  if (lottery === "天天樂") return "white";
  if (lottery === "大樂透") return "red";
  if (MARK_SIX_BLUE.has(number)) return "blue";
  if (MARK_SIX_RED.has(number)) return "red";
  return "green";
}

function NumberBall({
  lottery,
  number,
  isSpecial = false,
}: {
  lottery: LotteryId;
  number: string;
  isSpecial?: boolean;
}) {
  const tone = getBallTone(lottery, number);
  const usesDarkText =
    lottery === "今彩539" ||
    lottery === "天天樂" ||
    lottery === "六合彩";

  return (
    <span
      className="number-ball"
      data-lottery={lottery}
      data-special={isSpecial}
      data-tone={tone}
      data-dark-text={usesDarkText}
      aria-label={`${isSpecial ? "特別號" : "號碼"} ${number}`}
    >
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

export function LatestDrawCard({
  className = "",
}: LatestDrawCardProps) {
  return (
    <section
      className={`latest-draw-card latest-draw-card--empty ${className}`.trim()}
      aria-hidden="true"
      data-testid="latest-draw-card"
    >
      <img
        className="latest-draw-card-empty-artwork"
        src={EMPTY_DRAW_CARD_IMAGE}
        alt=""
        draggable={false}
      />
    </section>
  );
}

export type NextDrawInfoBarProps = NextDrawInfoData & {
  className?: string;
};

export function NextDrawInfoBar({
  nextDraw,
  remainingTime,
  className = "",
}: NextDrawInfoBarProps) {
  return (
    <section
      className={`next-draw-info ${className}`.trim()}
      aria-label="下次開獎資訊"
      data-testid="next-draw-info"
    >
      <div className="next-draw-item">
        <ClockIcon className="next-draw-icon" aria-hidden="true" />
        <span className="next-draw-label">下次開獎</span>
        <span className="next-draw-value">{nextDraw}</span>
      </div>
      <div className="next-draw-item">
        <CountdownTimerIcon className="next-draw-icon" aria-hidden="true" />
        <span className="next-draw-label">剩餘時間</span>
        <span className="next-draw-value">{remainingTime}</span>
      </div>
    </section>
  );
}

export type MatrixStatusSectionProps = {
  statuses?: MatrixStatusMap;
  onOpen?: () => void;
};

export function MatrixStatusSection({
  statuses = MATRIX_STATUS_BY_LOTTERY,
  onOpen,
}: MatrixStatusSectionProps = {}) {
  return (
    <section
      className="matrix-status-section"
      aria-labelledby="matrix-status-title"
      data-testid="matrix-status-section"
    >
      <header className="matrix-status-header">
        <h2 id="matrix-status-title">Matrix 狀態</h2>
        <button type="button" className="matrix-status-more" onClick={onOpen}>
          <span>查看更多狀態</span>
          <ChevronRightIcon aria-hidden="true" />
        </button>
      </header>

      <div className="matrix-status-grid">
        {LOTTERIES.map((lottery) => {
          const item = statuses[lottery.id];

          return (
            <article
              className="matrix-status-card"
              data-lottery={lottery.id}
              data-tone={item.tone}
              key={lottery.id}
              onClick={onOpen}
            >
              <img
                className="matrix-status-artwork"
                src={item.artwork}
                alt={`${item.status} ${item.statusEn}`}
                draggable={false}
              />
              <div className="matrix-status-lottery-center">
                <div className="matrix-status-lottery">{lottery.id}</div>
                <img
                  className="matrix-status-logo"
                  src={lottery.logo}
                  alt=""
                  draggable={false}
                />
              </div>
              <div className="matrix-status-overlay">
                <div className="matrix-status-found">本期發現</div>
                <div className="matrix-status-count">
                  <strong>{item.count}</strong>
                  <span>組</span>
                </div>
                <p>{item.description}</p>
              </div>
              <ChevronRightIcon
                className="matrix-status-card-arrow"
                aria-hidden="true"
              />
            </article>
          );
        })}
      </div>

      <div className="matrix-status-indicators" aria-hidden="true">
        {LOTTERIES.map((lottery) => (
          <DotFilledIcon
            data-tone={statuses[lottery.id].tone}
            key={lottery.id}
          />
        ))}
      </div>
    </section>
  );
}

export function MatrixCoreBanner({ onOpen }: { onOpen?: () => void }) {
  return (
    <button
      type="button"
      className="matrix-core-banner"
      aria-label="Matrix Core"
      data-testid="matrix-core-banner"
      onClick={onOpen}
    >
      <img
        src="/assets/lottery/matrix-core-banner.jpg"
        alt="Matrix Core｜分析核心・智慧運算"
        draggable={false}
      />
    </button>
  );
}

export function HomeShortcutRow({ onNavigate }: { onNavigate?: (screen: ScreenId) => void }) {
  const screens: Record<(typeof HOME_SHORTCUTS)[number]["label"], ScreenId> = {
    "Matrix 同星": "tongxing",
    "號碼對照單": "reference",
    "連碰立柱計算機": "calculator",
    "Matrix 牌單": "matrix-card",
    "Matrix 指南": "guide",
  };
  return (
    <nav
      className="home-shortcut-row"
      aria-label="五大功能"
      data-testid="home-shortcut-row"
    >
      {HOME_SHORTCUTS.map((item) => (
        <button
          className="home-shortcut"
          type="button"
          aria-label={item.label}
          key={item.label}
          onClick={() => onNavigate?.(screens[item.label])}
        >
          <img src={item.image} alt="" draggable={false} />
        </button>
      ))}
    </nav>
  );
}

export type BrandLoadingProps = {
  visible: boolean;
  onComplete?: () => void;
  className?: string;
};

export function BrandLoading({
  visible,
  onComplete,
  className = "",
}: BrandLoadingProps) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.querySelector<HTMLElement>(".mobile-page"));
  }, []);

  if (!visible || !host) return null;

  return createPortal(
    <section
      className={`brand-loading ${className}`.trim()}
      role="status"
      aria-label="Loading"
      aria-live="polite"
      data-testid="brand-loading"
    >
      <video
        className="brand-loading-video"
        src="/assets/lottery/matrix-startup.mp4"
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={onComplete}
        onError={onComplete}
        aria-label="樂彩 Matrix 啟動畫面"
      />
    </section>,
    host,
  );
}

function BottomNavigationPortal({
  active,
  onNavigate,
  onQuickOpen,
  onQuickConfigure,
}: {
  active: "首頁" | "快捷" | "通知" | "我的";
  onNavigate: (screen: ScreenId) => void;
  onQuickOpen: () => void;
  onQuickConfigure: () => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.querySelector<HTMLElement>(".mobile-page"));
  }, []);

  return host
    ? createPortal(
        <BottomNavigation active={active} onNavigate={onNavigate} onQuickOpen={onQuickOpen} onQuickConfigure={onQuickConfigure} />,
        host,
      )
    : null;
}

// Build app-specific screens and flows in this file. The surrounding mobile
// runtime is template-owned and intentionally lives outside this component.
export type PrototypeProps = {
  isLoading?: boolean;
};

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

  useEffect(() => {
    setDeviceId("pixel-10");
  }, [setDeviceId]);

  useEffect(() => {
    if (!startupVisible) return;
    const fallback = window.setTimeout(() => setStartupVisible(false), 6500);
    return () => window.clearTimeout(fallback);
  }, [startupVisible]);

  useEffect(() => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) activeElement.blur();
    const deviceScreen = document.querySelector<HTMLElement>(".device-screen");
    const mobileScroll = document.querySelector<HTMLElement>(".mobile-scroll");
    if (deviceScreen) deviceScreen.scrollTop = 0;
    if (mobileScroll) mobileScroll.scrollTop = 0;
  }, [screen]);

  const navigate = (next: ScreenId) => {
    if (next === "history") setHistoryReturnScreen(screen);
    setQuickActive(false);
    setScreen(next);
  };

  const openQuick = () => {
    if (quickActive) {
      setQuickActive(false);
      setScreen(quickReturnScreen);
      return;
    }
    if (!quickTarget) return;
    setQuickReturnScreen(screen);
    if (quickTarget === "history") setHistoryReturnScreen(screen);
    setQuickActive(true);
    setScreen(quickTarget);
  };

  const selectQuickTarget = (next: ScreenId) => {
    setQuickTarget(next);
    window.localStorage.setItem("matrix-quick-target", next);
    setQuickSettingsOpen(false);
    setQuickReturnScreen(screen);
    if (next === "history") setHistoryReturnScreen(screen);
    setQuickActive(true);
    setScreen(next);
  };

  const quickSettings = quickSettingsOpen ? (
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
  ) : null;

  if (screen !== "home") {
    return (
      <QuickNavigationProvider onQuickOpen={openQuick} onQuickConfigure={() => setQuickSettingsOpen(true)} currentScreen={screen} quickTarget={quickTarget} quickActive={quickActive}>
        <MobileScroll className="app-screen">
          <FeaturePageRouter
            screen={screen}
            onNavigate={navigate}
            historyReturnScreen={historyReturnScreen}
          />
          {quickSettings}
        </MobileScroll>
      </QuickNavigationProvider>
    );
  }

  return (
    <MobileScroll className="app-screen home-screen">
      <BrandLoading visible={startupVisible} onComplete={() => setStartupVisible(false)} />
      <main
        className="screen-content lottery-screen"
        data-testid="lottery-screen"
        aria-label="首頁彩種切換元件預覽"
      >
        <header className="brand-header">
          <img
            className={`brand-logo${deviceId === "iphone" ? " brand-logo--iphone" : ""}`}
            src="/assets/lottery/brand-logo-transparent.png"
            alt="樂彩 Matrix"
            draggable={false}
          />
        </header>
        <LotterySwitcher selected={selected} onChange={setSelected} />
        <LatestDrawCard
          lottery={selected}
          result={DRAW_RESULTS[selected]}
          nextDrawInfo={nextDrawInfo}
          order={order}
          onOrderChange={setOrder}
          onOpenHistory={() => navigate("history")}
        />
        <MatrixStatusSection onOpen={() => navigate("status")} />
        <MatrixCoreBanner onOpen={() => navigate("explore")} />
        <HomeShortcutRow onNavigate={navigate} />
        <BottomNavigationPortal active="首頁" onNavigate={navigate} onQuickOpen={openQuick} onQuickConfigure={() => setQuickSettingsOpen(true)} />
        {quickSettings}
      </main>
    </MobileScroll>
  );
}
