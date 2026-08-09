import { useRef, type KeyboardEvent, type MouseEvent } from "react";
import {
  BellIcon,
  HomeIcon,
  LightningBoltIcon,
  PersonIcon,
} from "@radix-ui/react-icons";

export type BottomNavigationLabel = "首頁" | "快捷" | "通知" | "我的";
export type BottomNavigationTarget = "home" | "notifications" | "profile";

type BottomNavigationProps = {
  active?: BottomNavigationLabel;
  quickActive?: boolean;
  onNavigate?: (screen: BottomNavigationTarget) => void;
  onQuickOpen?: () => void;
  onQuickConfigure?: () => void;
};

const NAVIGATION_ITEMS = [
  { label: "首頁", icon: HomeIcon, screen: "home" },
  { label: "快捷", icon: LightningBoltIcon, screen: null },
  { label: "通知", icon: BellIcon, screen: "notifications" },
  { label: "我的", icon: PersonIcon, screen: "profile" },
] as const;

export function BottomNavigation({
  active = "首頁",
  quickActive = false,
  onNavigate,
  onQuickOpen,
  onQuickConfigure,
}: BottomNavigationProps) {
  const quickTimer = useRef<number | null>(null);
  const quickLongPressed = useRef(false);

  const beginQuickPress = () => {
    quickLongPressed.current = false;
    quickTimer.current = window.setTimeout(() => {
      quickLongPressed.current = true;
      onQuickConfigure?.();
    }, 3000);
  };

  const endQuickPress = () => {
    if (quickTimer.current !== null) window.clearTimeout(quickTimer.current);
    quickTimer.current = null;
    if (!quickLongPressed.current) onQuickOpen?.();
  };

  const cancelQuickPress = () => {
    if (quickTimer.current !== null) window.clearTimeout(quickTimer.current);
    quickTimer.current = null;
  };

  return (
    <nav
      className="bottom-navigation"
      aria-label="底部導覽"
      data-testid="bottom-navigation"
    >
      <img
        className="bottom-navigation-side-energy"
        src="/assets/navigation/bottom/side-energy-rails.svg"
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <img
        className="bottom-navigation-topline"
        src="/assets/navigation/bottom/top-energy-line.svg"
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <span className="bottom-navigation-brand-core" aria-hidden="true">
        <img
          className="bottom-navigation-brand-node"
          src="/assets/navigation/bottom/brand-energy-node.svg"
          alt=""
          draggable={false}
        />
        <span className="bottom-navigation-brand-mark">
          <img src="/assets/lottery/brand-logo-transparent.png" alt="" draggable={false} />
        </span>
      </span>

      {NAVIGATION_ITEMS.map(({ label, icon: Icon, screen }) => {
        const selected = label === "快捷" ? active === label || quickActive : active === label && !quickActive;
        const quickProps = label === "快捷"
          ? {
              "aria-label": "快捷；長按三秒開啟設定",
              onPointerDown: beginQuickPress,
              onPointerUp: endQuickPress,
              onPointerCancel: cancelQuickPress,
              onPointerLeave: cancelQuickPress,
              onContextMenu: (event: MouseEvent<HTMLButtonElement>) => event.preventDefault(),
              onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onQuickOpen?.();
                }
              },
            }
          : { onClick: () => screen && onNavigate?.(screen) };

        return (
          <button
            className="bottom-navigation-item"
            data-selected={selected}
            type="button"
            aria-current={selected ? "page" : undefined}
            key={label}
            {...quickProps}
          >
            <span className="bottom-navigation-icon-frame" aria-hidden="true">
              <img
                className="bottom-navigation-node-frame"
                src={selected
                  ? "/assets/navigation/bottom/node-frame-selected.svg"
                  : "/assets/navigation/bottom/node-frame-default.svg"}
                alt=""
                draggable={false}
              />
              <Icon />
            </span>
            <span className="bottom-navigation-label">{label}</span>
            <span className="bottom-navigation-active-bar" aria-hidden="true" />
          </button>
        );
      })}
    </nav>
  );
}
