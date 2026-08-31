import { useEffect, useRef, type MouseEvent } from "react";

export function useDoubleClickAction<T extends HTMLElement>(
  onAction: (() => void) | undefined,
  windowMs: number,
) {
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearClickTimer = () => {
    if (clickTimer.current !== null) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
  };

  useEffect(() => clearClickTimer, []);

  return (event: MouseEvent<T>) => {
    if (event.detail === 0) {
      clearClickTimer();
      onAction?.();
      return;
    }

    if (clickTimer.current !== null) {
      clearClickTimer();
      onAction?.();
      return;
    }

    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
    }, windowMs);
  };
}
