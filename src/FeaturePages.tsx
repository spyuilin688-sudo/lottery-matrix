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
  | "status"
  | "status-settings";

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

const LOTTERY...