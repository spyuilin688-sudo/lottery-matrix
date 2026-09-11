import { useContext, useEffect, useMemo, useState, type ReactNode } from "react";
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

export { QUICK_CACHE_MS, useTimedState } from "../use-timed-state";

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
  { screen: "tianheng", label: "Matrix 天衡", image: "/assets/lottery/functions/天衡.png" },
  { screen: "tianyan", label: "Matrix 天衍", image: "/assets/lottery/functions/Matrix天衍-icon.png" },
  { screen: "tiangong", label: "Matrix 天工", image: "/assets/lottery/functions/Matrix天工-icon.png" },
] as const;

export const MATRIX_TITLE_ARTWORK: Partial<Record<string, string>> = {
  "Matrix 探索": "/assets/lottery/functions/探索標題K.png",
  "Matrix 天衡": "/assets/lottery/functions/天衡標題K.png",
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
  current: "explore" | "tianheng" | "tianyan" | "tiangong";
  onNavigate: Navigate;
}) {
  return (
    <nav className="matrix-page-switcher" aria-label="Matrix Core 功能切換">
      {MATRIX_PAGE_ITEMS.map((item) => (
        <button type="button" aria-label={item.label} aria-current={item.screen === current ? "page" : undefined} title={item.label} onClick={() => onNavigate(item.screen)} key={item.screen}>
          <img
            className={item.screen === "tianheng" ? "matrix-page-switcher-image--tianheng" : undefined}
            src={item.image}
            alt=""
            draggable={false}
          />
        </button>
      ))}
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


  useEffect(() => {
    let active = true;
    setData([]);

    const refreshLotteryHistory = () => {
      fetchLotteryHistory(lottery, limit)
        .then((records) => {
