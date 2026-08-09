import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PropsWithChildren,
} from "react";

export type CarouselProps = PropsWithChildren<{
  className?: string;
  contentClassName?: string;
  ariaLabel?: string;
  showScrollbar?: boolean;
  draggingEnabled?: boolean;
}>;

export function Carousel({
  className,
  contentClassName,
  ariaLabel,
  showScrollbar = false,
  draggingEnabled = true,
  children,
}: CarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const [thumb, setThumb] = useState({ visible: false, offset: 0, size: 0 });

  const updateThumb = useCallback((visible = true) => {
    if (!showScrollbar || !scrollRef.current) return;

    const node = scrollRef.current;
    const viewport = node.clientWidth;
    const content = node.scrollWidth;
    const enabled = content > viewport + 2;
    const size = enabled ? Math.max(36, (viewport / content) * viewport) : 0;
    const track = Math.max(0, viewport - size - 8);
    const progress = node.scrollLeft / Math.max(1, content - viewport);

    setThumb({
      visible: visible && enabled,
      size,
      offset: enabled ? 4 + progress * track : 0,
    });

    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
    }

    if (visible && enabled) {
      hideTimerRef.current = window.setTimeout(() => {
        setThumb((current) => ({ ...current, visible: false }));
      }, 650);
    }
  }, [showScrollbar]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const handleScroll = () => updateThumb(true);
    const resizeObserver = new ResizeObserver(() => updateThumb(false));

    node.addEventListener("scroll", handleScroll, { passive: true });
    resizeObserver.observe(node);

    if (node.firstElementChild) {
      resizeObserver.observe(node.firstElementChild);
    }

    updateThumb(false);

    return () => {
      node.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();

      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, [updateThumb]);

  const style = {
    overflowX: draggingEnabled ? "auto" : "hidden",
  } as CSSProperties;

  const thumbStyle = {
    width: thumb.size,
    transform: `translateX(${thumb.offset}px)`,
  };

  return (
    <div
      ref={scrollRef}
      className={`mobile-carousel ${className ?? ""}`}
      aria-label={ariaLabel}
      role={ariaLabel ? "region" : undefined}
      style={style}
    >
      <div className={`mobile-carousel-content ${contentClassName ?? ""}`}>
        {children}
      </div>
      {showScrollbar ? (
        <div
          className="mobile-carousel-scrollbar"
          data-visible={thumb.visible}
          aria-hidden="true"
        >
          <div className="mobile-carousel-scrollbar-thumb" style={thumbStyle} />
        </div>
      ) : null}
    </div>
  );
}
