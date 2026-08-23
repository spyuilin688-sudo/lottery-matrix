import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { BottomNavigation } from "./BottomNavigation";
import { BrandLogo } from "./BrandLogo";
import type { ScreenId } from "./FeaturePages";
import "./feature-page-adjustments.css";

type Navigate = (screen: ScreenId) => void;
type Props = {
  onNavigate: Navigate;
  onQuickOpen?: () => void;
  onQuickConfigure?: () => void;
  quickActive?: boolean;
};

const LOTTERIES = ["今彩539", "天天樂", "六合彩", "大樂透"] as const;
const MATRIX_STATUSES = ["啟動", "聚合", "共振", "臨界"] as const;

type Lottery = (typeof LOTTERIES)[number];
type SettingKey = "bet" | "result" | "win" | "status" | "card" | "collision" | "expiry" | "system";
type NotificationRow = readonly [SettingKey, string, string, string];

const BET_TIME_OPTIONS: Record<Lottery, string[]> = {
  "今彩539": ["16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "19:45", "20:00", "20:10", "20:20", "20:25"],
  "天天樂": ["05:00", "05:30", "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "08:45", "09:00", "09:10", "09:20", "09:25"],
  "六合彩": ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "20:45", "21:00", "21:10", "21:20", "21:25"],
  "大樂透": ["16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "19:45", "20:00", "20:10", "20:20", "20:25"],
};

const PRIMARY_ROWS: NotificationRow[] = [
  ["bet", "選號提醒", "", "/resources/notify-bet.png"],
  ["result", "開獎結果", "今彩539、天天樂、六合彩、大樂透", "/resources/notify-result.png"],
  ["win", "中獎通知", "彩種通知、獎金通知", "/resources/notify-win.png"],
];

const MATRIX_ROWS: NotificationRow[] = [
  ["status", "Matrix 狀態", "", "/resources/notify-status.png"],
  ["card", "Matrix 牌單", "今彩539、天天樂、六合彩、大樂透", "/resources/notify-card.png"],
  ["collision", "Matrix 摘星", "", "/resources/notify-collision.png"],
  ["expiry", "Matrix Pro", "提前1日、提前3日、提前7日", "/resources/notify-expiry.png"],
];

const SYSTEM_ROW: NotificationRow = ["system", "系統通知", "維護、更新", "/resources/notify-system.png"];

function Toggle({ checked, onChange, disabled = false }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return <button type="button" className="toggle" data-checked={checked} disabled={disabled} onClick={onChange}><span /></button>;
}

function NotificationBottomNavigation({ onNavigate, onQuickOpen, onQuickConfigure, quickActive }: Props) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => { setHost(document.querySelector<HTMLElement>(".mobile-page")); }, []);
  return host ? createPortal(
    <BottomNavigation active="通知" quickActive={Boolean(quickActive)} onNavigate={onNavigate} onQuickOpen={onQuickOpen} onQuickConfigure={onQuickConfigure} />,
    host,
  ) : null;
}

export function NotificationsPagePatched({ onNavigate, onQuickOpen, onQuickConfigure, quickActive }: Props) {
  const initialSettings = useMemo<Record<SettingKey, boolean>>(() => ({
    bet: true, result: true, win: true, status: true, card: true, collision: false, expiry: true, system: true,
  }), []);
  const [settings, setSettings] = useState(initialSettings);
  const [expandedKey, setExpandedKey] = useState<SettingKey | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({
    result: [...LOTTERIES],
    win: ["彩種通知"],
    card: [...LOTTERIES],
    expiry: ["提前1日", "提前3日", "提前7日"],
    system: ["維護", "更新"],
  });
  const [betLotteries, setBetLotteries] = useState<Record<Lottery, boolean>>(
    Object.fromEntries(LOTTERIES.map((lottery) => [lottery, true])) as Record<Lottery, boolean>,
  );
  const [statusLotteries, setStatusLotteries] = useState<Record<Lottery, boolean>>(
    Object.fromEntries(LOTTERIES.map((lottery) => [lottery, true])) as Record<Lottery, boolean>,
  );
  const [betTimes, setBetTimes] = useState<Record<Lottery, [string, string]>>(
    Object.fromEntries(LOTTERIES.map((lottery) => [lottery, ["", ""]])) as Record<Lottery, [string, string]>,
  );
  const [statusOptions, setStatusOptions] = useState<Record<Lottery, string[]>>(
    Object.fromEntries(LOTTERIES.map((lottery) => [lottery, [...MATRIX_STATUSES]])) as Record<Lottery, string[]>,
  );

  const toggleOption = (key: SettingKey, option: string) => {
    setSelectedOptions((current) => {
      const selected = current[key] ?? [];
      return {
        ...current,
        [key]: key === "win" ? [option] : selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option],
      };
    });
  };

  const toggleStatus = (lottery: Lottery, status: string) => {
    setStatusOptions((current) => ({
      ...current,
      [lottery]: current[lottery].includes(status)
        ? current[lottery].filter((item) => item !== status)
        : [...current[lottery], status],
    }));
  };

  const renderBetSettings = () => (
    <div className="notification-matrix-grid notification-bet-grid" aria-label="選號提醒設定">
      <div className="notification-grid-row notification-grid-lottery-row">
        {LOTTERIES.map((lottery) => <label key={lottery}><input type="checkbox" checked={betLotteries[lottery]} onChange={() => setBetLotteries((current) => ({ ...current, [lottery]: !current[lottery] }))} /><span>{lottery}</span></label>)}
      </div>
      {([0, 1] as const).map((index) => <div className="notification-grid-row notification-grid-time-row" key={index}>
        {LOTTERIES.map((lottery) => <div className="select-box native-select notification-time-select" key={lottery}><select aria-label={`${lottery}時間${index + 1}`} value={betTimes[lottery][index]} onChange={(event) => setBetTimes((current) => ({ ...current, [lottery]: index === 0 ? [event.target.value, current[lottery][1]] : [current[lottery][0], event.target.value] }))}><option value="">選擇時間</option>{BET_TIME_OPTIONS[lottery].map((time) => <option value={time} key={time}>{time.replace(":", "：")}</option>)}</select></div>)}
      </div>)}
    </div>
  );

  const renderStatusSettings = () => (
    <div className="notification-matrix-grid notification-status-grid" aria-label="Matrix 狀態設定">
      <div className="notification-grid-row notification-grid-lottery-row">
        {LOTTERIES.map((lottery) => <label key={lottery}><input type="checkbox" checked={statusLotteries[lottery]} onChange={() => setStatusLotteries((current) => ({ ...current, [lottery]: !current[lottery] }))} /><span>{lottery}</span></label>)}
      </div>
      {MATRIX_STATUSES.map((status) => <div className="notification-grid-row notification-grid-status-row" key={status}>
        {LOTTERIES.map((lottery) => <label className="notification-choice" key={lottery}><input type="checkbox" checked={statusOptions[lottery].includes(status)} onChange={() => toggleStatus(lottery, status)} /><span>{status}</span></label>)}
      </div>)}
    </div>
  );

  const renderGenericSettings = (key: SettingKey, title: string, subtitle: string) => {
    const options = subtitle ? subtitle.split("、") : [];
    return <div className="notification-inline-option-row" role={key === "win" ? "radiogroup" : "group"} aria-label={`${title}選項`}>{options.map((option) => <label className="notification-choice" key={option}><input type={key === "win" ? "radio" : "checkbox"} name={key === "win" ? "win-notification" : undefined} checked={selectedOptions[key]?.includes(option)} onChange={() => toggleOption(key, option)} /><span>{option}</span></label>)}</div>;
  };

  const renderInlineSettings = (row: NotificationRow) => {
    const [key, title, subtitle] = row;
    if (key === "bet") return renderBetSettings();
    if (key === "status") return renderStatusSettings();
    if (key === "collision") return null;
    return renderGenericSettings(key, title, subtitle);
  };

  const renderRow = (row: NotificationRow) => {
    const [key, title, subtitle, icon] = row;
    const disabled = !settings[key] || key === "collision";
    const expanded = expandedKey === key && !disabled;
    return <article className="notification-row" data-notification-key={key} key={key}>
      <div className="notification-heading">
        <div className="notification-icon"><img src={icon} alt="" /></div>
        <div className="notification-title"><h2>{key === "status" || key === "card" || key === "collision" ? <em>Matrix Pro</em> : null}<span>{title}</span></h2></div>
        <div className="notification-actions">
          <button type="button" className="notification-settings-toggle" disabled={disabled} aria-expanded={expanded} onClick={() => setExpandedKey((current) => current === key ? null : key)}><span>設定選項</span><ChevronDownIcon aria-hidden="true" /></button>
          <Toggle checked={settings[key]} disabled={key === "collision"} onChange={() => setSettings((current) => ({ ...current, [key]: !current[key] }))} />
        </div>
      </div>
      {expanded ? <div className="notification-inline-settings">{renderInlineSettings(row)}</div> : null}
    </article>;
  };

  return (
    <main className="feature-screen compact-feature-screen bottom-nav-brand-screen notifications-screen notifications-screen-v2">
      <header className="feature-brand-header" data-compact="true" data-hide-title="true"><BrandLogo /></header>
      <div className="feature-body">
        <div className="notification-list">
          <section className="notification-group" aria-label="一般通知">{PRIMARY_ROWS.map(renderRow)}</section>
          <section className="notification-group" aria-label="Matrix 通知">{MATRIX_ROWS.map(renderRow)}</section>
          <section className="notification-system-group" aria-label="系統通知">{renderRow(SYSTEM_ROW)}</section>
        </div>
      </div>
      <NotificationBottomNavigation onNavigate={onNavigate} onQuickOpen={onQuickOpen} onQuickConfigure={onQuickConfigure} quickActive={quickActive} />
    </main>
  );
}
