import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Cross2Icon } from "@radix-ui/react-icons";
import { Navigate } from "./navigation";
import { FeatureShell } from "./shared";

export function Toggle({ checked, onChange, disabled = false }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
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
