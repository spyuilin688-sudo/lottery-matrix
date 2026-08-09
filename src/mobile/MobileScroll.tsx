import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PropsWithChildren,
} from "react";
import { useKeyboardInsets } from "./Keyboard";

type MobileScrollProps = PropsWithChildren<{
  className?: string;
}>;

export function MobileScroll({ className, children }: MobileScrollProps) {
  const { isKeyboardVisible, keyboardHeight, keyboardDragging } = useKeyboardInsets();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const [thumb, setThumb] = useState({
    visible: false,
    top: 0,
    height: 0,
    enabled: false,
  });

  const updateThumb = useCallback((visible = true) => {
    const scroll = scrollRef.current;
    if (!scroll) return;

    const { clientHeight, scrollHeight, scrollTop } = scroll;
    const enabled = scrollHeight > clientHeight + 2;
    const height = enabled ? Math.max(36, (clientHeight / scrollHeight) * clientHeight) : 0;
    const maxThumbTop = Math.max(0, clientHeight - height - 8);
    const maxScrollTop = Math.max(1, scrollHeight - clientHeight);
    const top = enabled ? 4 + (scrollTop / maxScrollTop) * maxThumbTop : 0;

    setThumb({ visible: visible && enabled, top, height, enabled });

    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
    }

    if (visible && enabled) {
      hideTimerRef.current = window.setTimeout(() => {
        setThumb((current) => ({ ...current, visible: false }));
      }, 650);
    }
  }, []);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;

    const handleScroll = () => updateThumb(true);
    const resizeObserver = new ResizeObserver(() => updateThumb(false));

    scroll.addEventListener("scroll", handleScroll, { passive: true });
    resizeObserver.observe(scroll);

    if (scroll.firstElementChild) {
      resizeObserver.observe(scroll.firstElementChild);
    }

    updateThumb(false);

    return () => {
      scroll.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();

      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, [updateThumb]);

  useEffect(() => {
    updateThumb(false);
  }, [keyboardHeight, updateThumb]);

  const style = {
    "--keyboard-height": `${keyboardHeight}px`,
  } as CSSProperties;

  return (
    <section
      className={`mobile-page ${className ?? ""}`}
      data-keyboard-dragging={keyboardDragging ? "true" : "false"}
      data-keyboard-visible={isKeyboardVisible ? "true" : "false"}
      style={style}
    >
      <div
        ref={scrollRef}
        className="mobile-scroll"
        data-testid="mobile-scroll"
      >
        <div
          className="mobile-scroll-content"
          data-testid="mobile-scroll-content"
        >
          {children}
        </div>
      </div>
      <div
        className="mobile-scrollbar"
        data-testid="mobile-scrollbar"
        data-visible={thumb.visible ? "true" : "false"}
        aria-hidden="true"
      >
        <div
          className="mobile-scrollbar-thumb"
          style={{
            height: thumb.height,
            transform: `translateY(${thumb.top}px)`,
          }}
        />
      </div>
    </section>
  );
}
