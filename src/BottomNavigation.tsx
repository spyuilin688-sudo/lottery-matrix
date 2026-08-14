import { useRef, type KeyboardEvent, type MouseEvent } from "react";

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
  { label: "首頁", screen: "home", artwork: "matrixWW1.png" },
  { label: "快捷", screen: null, artwork: "matrixWW2.png" },
  { label: "通知", screen: "notifications", artwork: "matrixWW3.png" },
  { label: "我的", screen: "profile", artwork: "matrixWW4.png" },
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

  const displayedActive = quickActive ? "快捷" : active;
  const activeArtwork = NAVIGATION_ITEMS.find(({ label }) => label === displayedActive)?.artwork;

  return (
    <nav
      className="bottom-navigation"
      aria-label="底部導覽"
      data-testid="bottom-navigation"
      data-active={displayedActive}
    >
      <img
        className="bottom-navigation-artwork"
        src={`/assets/lottery/functions/${activeArtwork}`}
        alt="Matrix 底部導覽"
        draggable={false}
      />

      {NAVIGATION_ITEMS.map(({ label, screen }) => {
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
            <span className="bottom-navigation-a11y-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
