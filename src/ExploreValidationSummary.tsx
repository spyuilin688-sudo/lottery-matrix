import { useLayoutEffect, useRef, type ReactNode } from "react";

export function ExploreValidationSummary({ children }: { children: ReactNode }) {
  const summaryRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const summary = summaryRef.current;
    if (!summary) return;

    let lastAvailableWidth = -1;
    let lastRequiredWidth = -1;
    let lastFittedFontSize = 13;
    let cancelled = false;
    const fitSummary = () => {
      summary.style.removeProperty("--explore-summary-fit-font-size");
      const availableWidth = summary.clientWidth;
      if (availableWidth <= 0) return;

      const maximumFontSize = Number.parseFloat(getComputedStyle(summary).fontSize) || 13;
      const requiredWidth = summary.scrollWidth;
      if (availableWidth === lastAvailableWidth && requiredWidth === lastRequiredWidth) {
        summary.style.setProperty("--explore-summary-fit-font-size", `${lastFittedFontSize}px`);
        return;
      }

      lastAvailableWidth = availableWidth;
      lastRequiredWidth = requiredWidth;
      lastFittedFontSize = requiredWidth > availableWidth
        ? Math.max(1, maximumFontSize * (availableWidth / requiredWidth) * .98)
        : maximumFontSize;
      summary.style.setProperty("--explore-summary-fit-font-size", `${lastFittedFontSize}px`);
    };

    fitSummary();
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => fitSummary());
    resizeObserver?.observe(summary);
    window.addEventListener("resize", fitSummary);
    void document.fonts?.ready.then(() => {
      if (!cancelled) fitSummary();
    });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      window.removeEventListener("resize", fitSummary);
    };
  }, [children]);

  return <p className="explore-validation-summary" ref={summaryRef}>{children}</p>;
}
