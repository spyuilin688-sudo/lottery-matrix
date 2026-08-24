import { useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";

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

const QUICK_SWIPE_TRIGGER_PX = 32;

export function BottomNavigation({
  active = "首頁",
  quickActive = false,
  onNavigate,
  onQuickOpen,
  onQuickConfigure,
}: BottomNavigationProps) {
  const quickStartY = useRef(0);
  const quickPointerId = useRef<number | null>(null);
  const quickDragDistance = useRef(0);
  const suppressQuickClick = useRef(false);
  const [quickDragOffset, setQuickDragOffset] = useState(0);
  const [quickDragging, setQuickDragging] = useState(false);

  const beginQuickPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    quickStartY.current = event.clientY;
    quickPointerId.current = event.pointerId;
    quickDragDistance.current = 0;
    suppressQuickClick.current = false;
    setQuickDragOffset(0);
    setQuickDragging(true);
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const moveQuickPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (quickPointerId.current !== event.pointerId) return;
    const upwardDistance = Math.max(0, quickStartY.current - event.clientY);
    quickDragDistance.current = upwardDistance;
    setQuickDragOffset(-upwardDistance);
  };

  const releaseQuickPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (
      typeof event.currentTarget.hasPointerCapture === "function"
      && event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    quickPointerId.current = null;
    setQuickDragging(false);
    setQuickDragOffset(0);
  };

  const finishQuickPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const shouldConfigure = quickPointerId.current === event.pointerId
      && quickDragDistance.current >= QUICK_SWIPE_TRIGGER_PX;
    releaseQuickPointer(event);
    if (shouldConfigure) {
      suppressQuickClick.current = true;
      onQuickConfigure?.();
    }
  };

  const cancelQuickPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    quickDragDistance.current = 0;
    suppressQuickClick.current = false;
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
            aria-label={label === "快捷" ? "快捷；向上滑開啟設定" : undefined}
            data-quick-gesture={label === "快捷" ? "true" : undefined}
            data-dragging={label === "快捷" ? quickDragging : undefined}
            style={label === "快捷" ? {
              transform: `translateY(${quickDragOffset}px)`,
            } : undefined}
            onPointerDown={label === "快捷" ? beginQuickPress : undefined}
            onPointerMove={label === "快捷" ? moveQuickPress : undefined}
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
