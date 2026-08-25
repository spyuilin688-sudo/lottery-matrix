import { useEffect, useRef, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";

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

const QUICK_LONG_PRESS_MS = 1_500;

export function BottomNavigation({
  active = "首頁",
  quickActive = false,
  onNavigate,
  onQuickOpen,
  onQuickConfigure,
}: BottomNavigationProps) {
  const quickPointerId = useRef<number | null>(null);
  const quickLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quickTriggered = useRef(false);
  const suppressQuickClick = useRef(false);

  const clearQuickLongPressTimer = () => {
    if (quickLongPressTimer.current !== null) {
      clearTimeout(quickLongPressTimer.current);
      quickLongPressTimer.current = null;
    }
  };

  useEffect(() => () => {
    clearQuickLongPressTimer();
    quickPointerId.current = null;
  }, []);

  const beginQuickPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;

    clearQuickLongPressTimer();
    quickPointerId.current = event.pointerId;
    quickTriggered.current = false;
    suppressQuickClick.current = false;

    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    quickLongPressTimer.current = setTimeout(() => {
      if (quickPointerId.current !== event.pointerId || quickTriggered.current) return;
      quickLongPressTimer.current = null;
      quickTriggered.current = true;
      suppressQuickClick.current = true;
      onQuickConfigure?.();
    }, QUICK_LONG_PRESS_MS);
  };

  const releaseQuickPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    clearQuickLongPressTimer();
    if (
      typeof event.currentTarget.hasPointerCapture === "function"
      && event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    quickPointerId.current = null;
  };

  const finishQuickPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (quickPointerId.current !== event.pointerId) return;
    releaseQuickPointer(event);
  };

  const cancelQuickPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (quickPointerId.current !== event.pointerId) return;
    if (!quickTriggered.current) suppressQuickClick.current = false;
    releaseQuickPointer(event);
  };

  const handleQuickClick = () => {
    if (suppressQuickClick.current) {
      suppressQuickClick.current = false;
      return;
    }
    onQuickOpen?.();
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
            aria-label={label === "快捷" ? "快捷；長按 1.5 秒開啟設定" : undefined}
            data-quick-gesture={label === "快捷" ? "true" : undefined}
            onPointerDown={label === "快捷" ? beginQuickPress : undefined}
            onPointerUp={label === "快捷" ? finishQuickPress : undefined}
            onPointerCancel={label === "快捷" ? cancelQuickPress : undefined}
            onClick={label === "快捷" ? handleQuickClick : () => screen && onNavigate?.(screen)}
            onContextMenu={label === "快捷" ? (event: MouseEvent<HTMLButtonElement>) => event.preventDefault() : undefined}
            key={label}
          >
            <span className="bottom-navigation-a11y-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
