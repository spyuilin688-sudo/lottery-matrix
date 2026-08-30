import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { BottomNavigation } from "./BottomNavigation";
import type { ScreenId } from "./FeaturePages";
import {
  fetchNotificationSettings,
  hasAuthenticatedMemberSession,
  saveNotificationSettings,
  type MemberNotificationSettings,
} from "./member-api";
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushStatus,
  PushSubscriptionError,
  type PushStatus,
} from "./push-subscription";
import { resolveWebPushPublicKey } from "./push-public-key";

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
type NotificationSettingsEdit = (current: MemberNotificationSettings) => MemberNotificationSettings;

const SAVE_DEBOUNCE_MS = 25;
const SAVE_RETRY_INITIAL_MS = 100;
const SAVE_RETRY_MAX_MS = 4_000;

const BET_TIME_OPTIONS = {
  [LOTTERIES[0]]: ["16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "19:45", "20:00", "20:10", "20:20", "20:25"],
  [LOTTERIES[1]]: ["05:00", "05:30", "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "08:45", "09:00", "09:10", "09:20", "09:25"],
  [LOTTERIES[2]]: ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "20:45", "21:00", "21:10", "21:20", "21:25"],
  [LOTTERIES[3]]: ["16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "19:45", "20:00", "20:10", "20:20", "20:25"],
} satisfies Record<Lottery, string[]>;

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

function createDefaultNotificationSettings(): MemberNotificationSettings {
  return {
    settings: {
      bet: true, result: true, win: true, status: true, card: true, collision: false, expiry: true, system: true,
    },
    selectedOptions: {
      result: [...LOTTERIES],
      win: ["彩種通知"],
      status: [...LOTTERIES],
      card: [...LOTTERIES],
      expiry: ["提前1日", "提前3日", "提前7日"],
      system: ["維護", "更新"],
    },
    betTimes: Object.fromEntries(LOTTERIES.map((lottery) => [lottery, ["", ""]])) as MemberNotificationSettings["betTimes"],
    statusOptions: Object.fromEntries(LOTTERIES.map((lottery) => [lottery, [...MATRIX_STATUSES]])) as MemberNotificationSettings["statusOptions"],
    collisionOptions: Object.fromEntries(LOTTERIES.map((lottery) => [lottery, ["獨碰二星", "獨碰三星"]])) as MemberNotificationSettings["collisionOptions"],
  };
}

function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
  busy = false,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label?: string;
  busy?: boolean;
}) {
  return <button type="button" className="toggle" data-checked={checked} disabled={disabled} aria-label={label} aria-busy={busy || undefined} onClick={onChange}><span /></button>;
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
  const [expandedKey, setExpandedKey] = useState<SettingKey | null>(null);
  const [notificationSettings, setNotificationSettings] = useState<MemberNotificationSettings>(createDefaultNotificationSettings);
  const [pushStatus, setPushStatus] = useState<PushStatus>({ supported: true, permission: "default", enabled: false });
  const [pushNotice, setPushNotice] = useState<"idle" | "enabled" | "denied" | "unsupported" | "unauthenticated" | "enable-failed" | "disable-failed">("idle");
  const [pushAuthenticated, setPushAuthenticated] = useState<boolean | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const { settings, selectedOptions, betTimes, statusOptions } = notificationSettings;
  const notificationSettingsLoadState = useRef<"loading" | "ready" | "failed">("loading");
  const pendingLoadEdits = useRef<NotificationSettingsEdit[]>([]);
  const lastSavedSettings = useRef("");
  const latestNotificationSettings = useRef(notificationSettings);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlight = useRef(false);
  const retryDelay = useRef(SAVE_RETRY_INITIAL_MS);
  const componentActive = useRef(true);
  const flushAfterInFlightOnUnmount = useRef(false);
  const flushLatestSaveRef = useRef<(mode?: "normal" | "unmount") => void>(() => undefined);
  const scheduleLatestSaveRef = useRef<(delayMs: number) => void>(() => undefined);
  const pushOperationRevision = useRef(0);
  const pushScreenActive = useRef(false);
  latestNotificationSettings.current = notificationSettings;

  const flushLatestSave = (mode: "normal" | "unmount" = "normal") => {
    if (notificationSettingsLoadState.current !== "ready" || (mode === "normal" && !componentActive.current)) return;
    if (saveInFlight.current) {
      if (mode === "unmount") flushAfterInFlightOnUnmount.current = true;
      return;
    }
    const snapshot = latestNotificationSettings.current;
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastSavedSettings.current) return;

    saveInFlight.current = true;
    let failed = false;
    void saveNotificationSettings(snapshot)
      .then(() => {
        lastSavedSettings.current = serialized;
        retryDelay.current = SAVE_RETRY_INITIAL_MS;
      })
      .catch(() => { failed = true; })
      .finally(() => {
        saveInFlight.current = false;
        const dirty = JSON.stringify(latestNotificationSettings.current) !== lastSavedSettings.current;
        if (componentActive.current) {
          if (!dirty) return;
          if (failed) {
            const delayMs = retryDelay.current;
            retryDelay.current = Math.min(delayMs * 2, SAVE_RETRY_MAX_MS);
            scheduleLatestSaveRef.current(delayMs);
          } else {
            scheduleLatestSaveRef.current(SAVE_DEBOUNCE_MS);
          }
          return;
        }
        const shouldFlush = flushAfterInFlightOnUnmount.current;
        flushAfterInFlightOnUnmount.current = false;
        if (shouldFlush && dirty) flushLatestSaveRef.current("unmount");
      });
  };

  const scheduleLatestSave = (delayMs: number) => {
    if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    if (!componentActive.current || notificationSettingsLoadState.current !== "ready") return;
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      flushLatestSaveRef.current();
    }, delayMs);
  };
  flushLatestSaveRef.current = flushLatestSave;
  scheduleLatestSaveRef.current = scheduleLatestSave;

  useEffect(() => {
    pushScreenActive.current = true;
    return () => {
      pushScreenActive.current = false;
      pushOperationRevision.current += 1;
    };
  }, []);

  useEffect(() => {
    let active = true;
    componentActive.current = true;
    void fetchNotificationSettings().then((stored) => {
      if (!active) return;
      const merged = pendingLoadEdits.current.reduce((current, edit) => edit(current), stored);
      pendingLoadEdits.current = [];
      lastSavedSettings.current = JSON.stringify(stored);
      latestNotificationSettings.current = merged;
      setNotificationSettings(merged);
      notificationSettingsLoadState.current = "ready";
    }).catch(() => {
      if (!active) return;
      pendingLoadEdits.current = [];
      notificationSettingsLoadState.current = "failed";
    });
    return () => {
      active = false;
      componentActive.current = false;
      if (saveTimer.current !== null) clearTimeout(saveTimer.current);
      saveTimer.current = null;
      if (notificationSettingsLoadState.current !== "ready") return;
      const dirty = JSON.stringify(latestNotificationSettings.current) !== lastSavedSettings.current;
      if (!dirty) return;
      if (saveInFlight.current) flushAfterInFlightOnUnmount.current = true;
      else flushLatestSaveRef.current("unmount");
    };
  }, []);

  useEffect(() => {
    let active = true;
    const requestRevision = pushOperationRevision.current;
    void hasAuthenticatedMemberSession().then(async (authenticated) => {
      if (!active || requestRevision !== pushOperationRevision.current) return;
      setPushAuthenticated(authenticated);
      if (!authenticated) return null;
      return getPushStatus(true);
    }).then((status) => {
      if (!status) {
        if (active && requestRevision === pushOperationRevision.current) setPushNotice("unauthenticated");
        return;
      }
      if (!active || requestRevision !== pushOperationRevision.current) return;
      setPushStatus(status);
      setPushNotice(status.enabled ? "enabled" : !status.supported ? "unsupported" : status.permission === "denied" ? "denied" : "idle");
    }).catch((error: unknown) => {
      if (!active || requestRevision !== pushOperationRevision.current) return;
      if (error instanceof PushSubscriptionError) setPushStatus(error.status);
      else setPushStatus((current) => ({ ...current, enabled: false }));
      setPushNotice("enable-failed");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    scheduleLatestSaveRef.current(SAVE_DEBOUNCE_MS);
  }, [notificationSettings]);

  const applyNotificationSettingsEdit = (edit: NotificationSettingsEdit) => {
    if (notificationSettingsLoadState.current === "loading") pendingLoadEdits.current.push(edit);
    setNotificationSettings(edit);
  };

  const updatePushNotice = (status: PushStatus) => {
    setPushStatus(status);
    setPushNotice(status.enabled ? "enabled" : !status.supported ? "unsupported" : status.permission === "denied" ? "denied" : "idle");
  };

  const togglePushNotifications = async () => {
    if (pushBusy || !pushStatus.supported) return;
    const isDisabling = pushStatus.enabled;
    const operationRevision = pushOperationRevision.current + 1;
    pushOperationRevision.current = operationRevision;
    setPushBusy(true);
    try {
      const status = isDisabling
        ? await disablePushNotifications()
        : await enablePushNotifications(
          resolveWebPushPublicKey(import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY),
          pushAuthenticated === true,
        );
      if (!pushScreenActive.current || operationRevision !== pushOperationRevision.current) return;
      updatePushNotice(status);
    } catch (error: unknown) {
      if (!pushScreenActive.current || operationRevision !== pushOperationRevision.current) return;
      if (error instanceof PushSubscriptionError) setPushStatus(error.status);
      else setPushStatus((current) => ({ ...current, enabled: false }));
      setPushNotice(isDisabling ? "disable-failed" : "enable-failed");
    } finally {
      if (pushScreenActive.current && operationRevision === pushOperationRevision.current) setPushBusy(false);
    }
  };

  const pushStatusMessage = pushBusy
    ? `手機通知${pushStatus.enabled ? "關閉" : "開啟"}中`
    : pushNotice === "enabled" ? "手機通知已開啟"
      : pushNotice === "unsupported" ? "此手機不支援通知"
        : pushNotice === "unauthenticated" ? "請先使用 LINE 登入"
        : pushNotice === "enable-failed" ? "手機通知開啟失敗，請稍後再試"
          : pushNotice === "disable-failed" ? "手機通知關閉失敗，請稍後再試"
          : "手機通知未開啟";

  const toggleOption = (key: SettingKey, option: string) => {
    applyNotificationSettingsEdit((current) => {
      const selected = current.selectedOptions[key] ?? [];
      return {
        ...current,
        selectedOptions: {
          ...current.selectedOptions,
          [key]: key === "win" ? [option] : selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option],
        },
      };
    });
  };

  const toggleStatus = (lottery: Lottery, status: string) => {
    applyNotificationSettingsEdit((current) => ({
      ...current,
      statusOptions: {
        ...current.statusOptions,
        [lottery]: current.statusOptions[lottery].includes(status)
          ? current.statusOptions[lottery].filter((item) => item !== status)
          : [...current.statusOptions[lottery], status],
      },
    }));
  };

  const renderBetSettings = () => (
    <div className="notification-matrix-grid notification-bet-grid" aria-label="選號提醒設定">
      <div className="notification-grid-row notification-grid-lottery-row notification-grid-lottery-labels">
        {LOTTERIES.map((lottery) => <span key={lottery}>{lottery}</span>)}
      </div>
      {([0, 1] as const).map((index) => <div className="notification-grid-row notification-grid-time-row" aria-label={`第${index + 1}組提醒時間`} key={index}>
        {LOTTERIES.map((lottery) => <div className="select-box native-select notification-time-select" key={lottery}><select aria-label={`${lottery}時間${index + 1}`} value={betTimes[lottery][index]} onChange={(event) => {
          const value = event.target.value;
          applyNotificationSettingsEdit((current) => ({
            ...current,
            betTimes: {
              ...current.betTimes,
              [lottery]: index === 0 ? [value, current.betTimes[lottery][1]] : [current.betTimes[lottery][0], value],
            },
          }));
        }}><option value="">選擇時間</option>{BET_TIME_OPTIONS[lottery].map((time) => <option value={time} key={time}>{time.replace(":", "：")}</option>)}</select></div>)}
      </div>)}
    </div>
  );

  const renderStatusSettings = () => (
    <div className="notification-matrix-grid notification-status-grid" aria-label="Matrix 狀態設定">
      <div className="notification-grid-row notification-grid-lottery-row">
        {LOTTERIES.map((lottery) => <span className="notification-status-lottery-label" key={lottery}>{lottery}</span>)}
      </div>
      {MATRIX_STATUSES.map((status) => <div className="notification-grid-row notification-grid-status-row" key={status}>
        {LOTTERIES.map((lottery) => <label className="notification-choice" key={lottery}><input type="checkbox" checked={statusOptions[lottery].includes(status)} onChange={() => toggleStatus(lottery, status)} /><span>{status}</span></label>)}
      </div>)}
    </div>
  );

  const renderGenericSettings = (key: SettingKey, title: string, subtitle: string) => {
    const options = subtitle ? subtitle.split("、") : [];
    return <div className="notification-inline-option-row" data-setting-key={key} role={key === "win" ? "radiogroup" : "group"} aria-label={`${title}選項`}>{options.map((option) => <label className="notification-choice" key={option}><input type={key === "win" ? "radio" : "checkbox"} name={key === "win" ? "win-notification" : undefined} checked={selectedOptions[key]?.includes(option)} onChange={() => toggleOption(key, option)} /><span>{option}</span></label>)}</div>;
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
    const settingsPanelId = `notification-settings-${key}`;
    const isSystemRow = key === "system";
    const pushToggleUnavailable = pushAuthenticated !== true || !pushStatus.supported || pushStatus.permission === "denied";
    const pushToggleLabel = pushBusy
      ? `手機通知${pushStatus.enabled ? "關閉" : "開啟"}中`
      : !pushStatus.supported ? "此手機不支援通知"
        : pushAuthenticated !== true ? "請先使用 LINE 登入"
        : pushStatus.permission === "denied" ? "通知權限已拒絕"
          : pushStatus.enabled ? "關閉手機通知" : "開啟手機通知";
    return <article className="notification-row" data-notification-key={key} key={key}>
      <div className="notification-heading">
        <div className="notification-icon"><img src={icon} alt="" /></div>
        <div className="notification-title"><h2>{key === "status" || key === "card" || key === "collision" ? <em>Matrix Pro</em> : null}<span>{title}</span></h2>{isSystemRow ? <p className="notification-push-status" role={pushNotice === "enable-failed" || pushNotice === "disable-failed" ? "alert" : "status"} aria-live="polite" aria-atomic="true"><span>{pushStatusMessage}</span>{pushNotice === "denied" ? <span className="notification-push-status-detail">通知權限已拒絕</span> : null}</p> : null}</div>
        <div className="notification-actions">
          <button type="button" className="notification-settings-toggle" disabled={disabled} aria-controls={settingsPanelId} aria-expanded={expanded} onClick={() => setExpandedKey((current) => current === key ? null : key)}><span>設定選項</span><ChevronDownIcon aria-hidden="true" /></button>
          <Toggle checked={isSystemRow ? pushStatus.enabled : settings[key]} disabled={isSystemRow ? pushBusy || pushToggleUnavailable : key === "collision"} label={isSystemRow ? pushToggleLabel : undefined} busy={isSystemRow && pushBusy} onChange={() => {
            if (isSystemRow) {
              void togglePushNotifications();
              return;
            }
            applyNotificationSettingsEdit((current) => ({
              ...current,
              settings: { ...current.settings, [key]: !current.settings[key] },
            }));
          }} />
        </div>
      </div>
      {key === "collision" ? null : <div
        id={settingsPanelId}
        className="notification-inline-settings"
        data-expanded={expanded}
        aria-hidden={!expanded}
        inert={!expanded}
      ><div className="notification-inline-settings-inner"><div className="notification-inline-settings-content">{renderInlineSettings(row)}</div></div></div>}
    </article>;
  };

  return (
    <main className="feature-screen compact-feature-screen bottom-nav-brand-screen notifications-screen notifications-screen-v2">
      <header className="feature-brand-header integrated-title-header" data-compact="true">
        <div className="matrix-title-banner">
          <img src="/assets/lottery/functions/通知標題K.png" alt="通知" draggable={false} />
        </div>
      </header>
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
