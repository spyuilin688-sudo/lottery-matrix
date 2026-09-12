import { GearIcon } from "@radix-ui/react-icons";
import { Calculator, House, LayoutGrid, UserRound } from "lucide-react";
import { useDoubleClickAction } from "./useDoubleClickAction";

export type BottomNavigationLabel = "首頁" | "快捷" | "計算機" | "通知" | "我的";
export type BottomNavigationTarget = "home" | "calculator" | "profile";

type BottomNavigationProps = {
  active?: BottomNavigationLabel;
  quickActive?: boolean;
  onNavigate?: (screen: BottomNavigationTarget) => void;
  onQuickOpen?: () => void;
  onQuickConfigure?: () => void;
  showQuickSettings?: boolean;
};

const NAVIGATION_ITEMS = [
  { label: "首頁", screen: "home", Icon: House },
  { label: "快捷", screen: null, Icon: LayoutGrid },
  { label: "計算機", screen: "calculator", Icon: Calculator },
  { label: "我的", screen: "profile", Icon: UserRound },
] as const;

export const QUICK_SETTINGS_DOUBLE_TAP_MS = 800;

export function BottomNavigation({
  active = "首頁",
  quickActive = false,
  onNavigate,
  onQuickOpen,
  onQuickConfigure,
  showQuickSettings = false,
}: BottomNavigationProps) {
  const handleQuickSettingsClick = useDoubleClickAction<HTMLButtonElement>(
    onQuickConfigure,
    QUICK_SETTINGS_DOUBLE_TAP_MS,
  );

  const displayedActive = quickActive ? "快捷" : active === "通知" ? "我的" : active;
  return (
    <nav
      className="bottom-navigation"
      aria-label="底部導覽"
      data-testid="bottom-navigation"
      data-active={displayedActive}
    >
      <img
        className="bottom-navigation-artwork"
        src="/assets/lottery/navigation/pd01-frame.svg"
        alt=""
        aria-hidden="true"
        draggable={false}
      />

      {NAVIGATION_ITEMS.map(({ label, screen, Icon }) => {
        const selected = displayedActive === label;

        return (
          <button
            className="bottom-navigation-item"
            data-selected={selected}
            type="button"
            aria-current={selected ? "page" : undefined}
            onClick={label === "快捷" ? onQuickOpen : () => screen && onNavigate?.(screen)}
            key={label}
          >
            <img
              className="bottom-navigation-active-frame"
              src="/assets/lottery/navigation/pd01-active.svg"
              alt=""
              aria-hidden="true"
              draggable={false}
            />
            <Icon className="bottom-navigation-icon" aria-hidden="true" strokeWidth={1.6} />
            <span className="bottom-navigation-label">{label}</span>
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
