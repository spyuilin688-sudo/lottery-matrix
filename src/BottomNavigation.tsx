import { useEffect, useRef, type MouseEvent } from "react";
import { GearIcon } from "@radix-ui/react-icons";

export type BottomNavigationLabel = "首頁" | "快捷" | "通知" | "我的";
export type BottomNavigationTarget = "home" | "notifications" | "profile";

type BottomNavigationProps = {
  active?: BottomNavigationLabel;
  quickActive?: boolean;
  onNavigate?: (screen: BottomNavigationTarget) => void;
  onQuickOpen?: () => void;
  onQuickConfigure?: () => void;
  showQuickSettings?: boolean;
};

const NAVIGATION_ITEMS = [
  { label: "首頁", screen: "home" },
  { label: "快捷", screen: null },
  { label: "通知", screen: "notifications" },
  { label: "我的", screen: "profile" },
] as const;

const NAVIGATION_ARTWORK: Record<BottomNavigationLabel, string> = {
  "首頁": "/assets/lottery/functions/matrixWW1.png",
  "快捷": "/assets/lottery/functions/matrixWW2.png",
  "通知": "/assets/lottery/functions/matrixWW3.png",
  "我的": "/assets/lottery/functions/matrixWW4.png",
};

const QUICK_SETTINGS_DOUBLE_TAP_MS = 400;

export function BottomNavigation({
  active = "首頁",
  quickActive = false,
  onNavigate,
  onQuickOpen,
  onQuickConfigure,
  showQuickSettings = false,
}: BottomNavigationProps) {
  const quickSettingsClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearQuickSettingsClickTimer = () => {
    if (quickSettingsClickTimer.current !== null) {
      clearTimeout(quickSettingsClickTimer.current);
      quickSettingsClickTimer.current = null;
    }
  };

  useEffect(() => clearQuickSettingsClickTimer, []);

  const handleQuickSettingsClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail === 0) {
      clearQuickSettingsClickTimer();
      onQuickConfigure?.();
      return;
    }

    if (quickSettingsClickTimer.current !== null) {
      clearQuickSettingsClickTimer();
      onQuickConfigure?.();
      return;
    }

    quickSettingsClickTimer.current = setTimeout(() => {
      quickSettingsClickTimer.current = null;
    }, QUICK_SETTINGS_DOUBLE_TAP_MS);
  };

  const displayedActive = quickActive ? "快捷" : active;
  return (
    <nav
      className="bottom-navigation"
      aria-label="底部導覽"
      data-testid="bottom-navigation"
      data-active={displayedActive}
    >
      <img
        className="bottom-navigation-artwork"
        src={NAVIGATION_ARTWORK[displayedActive]}
        alt="Matrix 底部導覽"
        draggable={false}
      />

      {NAVIGATION_ITEMS.map(({ label, screen }) => {
        const selected = label === "快捷" ? active === label || quickActive : active === label && !quickActive;

        return (
          <button
            className="bottom-navigation-item"
            data-selected={selected}
            type="button"
            aria-current={selected ? "page" : undefined}
            onClick={label === "快捷" ? onQuickOpen : () => screen && onNavigate?.(screen)}
            key={label}
          >
            <span className="bottom-navigation-a11y-label">{label}</span>
          </button>
        );
      })}

      {showQuickSettings && onQuickConfigure ? (
        <button
          className="bottom-navigation-quick-settings"
          type="button"
          aria-label="快捷設定，連續點擊兩下開啟"
          onClick={handleQuickSettingsClick}
        >
          <span className="bottom-navigation-quick-settings-visual">
            <GearIcon aria-hidden="true" />
          </span>
        </button>
      ) : null}
    </nav>
  );
}
