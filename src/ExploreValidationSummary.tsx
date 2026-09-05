import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import "./matrix-explore-result-refinements.css";

type SummaryElementProps = {
  className?: string;
  children?: ReactNode;
};

function formatRoadFormulaText(value: string, sumSequence = false): ReactNode {
  if (value.includes("拖牌")) {
    return value.split(/(拖牌)/g).map((part, index) => (
      part === "拖牌"
        ? <span className="validation-summary-drag-label" key={`drag-${index}`}>拖牌</span>
        : part
    ));
  }

  const parts = value.split("、").map((part) => part.trim());
  if (parts.length < 2 || !parts.every((part) => /^[+-]?\d+$/.test(part))) return value;

  const tokens = parts.flatMap((part, index) => (
    index === 0
      ? [sumSequence ? part.replace(/^\+/, "") : part]
      : [".", part.replace(/^\+/, "")]
  ));
  return (
    <span className="validation-summary-formula-tokens">
      {tokens.map((token, index) => (
        <span className="validation-summary-formula-token" key={`${index}-${token}`}>{token}</span>
      ))}
    </span>
  );
}

function formatFormulaChildren(children: ReactNode, sumSequence: boolean): ReactNode {
  if (typeof children === "string") return formatRoadFormulaText(children, sumSequence);
  return Children.map(children, (child) => typeof child === "string" ? formatRoadFormulaText(child, sumSequence) : child);
}

function formatRoadSummaryNode(node: ReactNode, sumSequence = false): ReactNode {
  if (!isValidElement<SummaryElementProps>(node)) return node;

  const element = node as ReactElement<SummaryElementProps>;
  if (element.type === Fragment) {
    return cloneElement(element, undefined, Children.map(element.props.children, (child) => formatRoadSummaryNode(child, sumSequence)));
  }

  const classNames = element.props.className?.split(/\s+/).filter(Boolean) ?? [];
  const isSamePeriod = classNames.includes("validation-summary-position") && element.props.children === "同期";
  const nextChildren = classNames.includes("validation-summary-formula")
    ? formatFormulaChildren(element.props.children, sumSequence)
    : Children.map(element.props.children, (child) => formatRoadSummaryNode(
        child, sumSequence || classNames.includes("validation-summary-formula-sequence"),
      ));
  const nextClassName = isSamePeriod
    ? [...new Set([...classNames, "validation-summary-same-period"])].join(" ")
    : element.props.className;

  return cloneElement(element, { className: nextClassName }, nextChildren);
}

export function ExploreValidationSummary({ children, layout = "explore" }: {
  children: ReactNode;
  layout?: "explore" | "tianyan";
}) {
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const [isMatrixExploreSummary, setIsMatrixExploreSummary] = useState(false);
  const renderedChildren = isMatrixExploreSummary
    ? Children.map(children, (child) => formatRoadSummaryNode(child))
    : children;

  useLayoutEffect(() => {
    const summary = summaryRef.current;
    if (!summary) return;
    const nextIsMatrixExploreSummary = Boolean(
      summary.closest(".matrix-explore-main-screen"),
    );
    setIsMatrixExploreSummary((current) => current === nextIsMatrixExploreSummary ? current : nextIsMatrixExploreSummary);
  });

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
      if (layout === "tianyan") {
        const rows = [...summary.querySelectorAll<HTMLElement>(".tianyan-validation-summary-row")];
        const style = getComputedStyle(summary);
        const contentLeft = summary.getBoundingClientRect().left + Number.parseFloat(style.paddingLeft);
        const contentWidth = availableWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
        const tag = summary.parentElement?.querySelector<HTMLElement>(".explore-validation-consecutive-tag");
        const firstRowWidth = tag ? Math.min(contentWidth, tag.getBoundingClientRect().left - contentLeft - 4) : contentWidth;
        if (!rows.length || firstRowWidth <= 0) return;
        let fontSize = maximumFontSize;
        // Re-measure fixed gaps as the shared font shrinks, keeping both rows aligned.
        for (let pass = 0; pass < 4; pass += 1) {
          const scale = Math.min(1, ...rows.map((row, index) =>
            (index === 0 ? firstRowWidth : contentWidth) / Math.max(1, row.getBoundingClientRect().width)));
          if (scale >= 1) break;
          fontSize = Math.max(1, fontSize * scale * .98);
          summary.style.setProperty("--explore-summary-fit-font-size", `${fontSize}px`);
        }
        return;
      }
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
  }, [children, isMatrixExploreSummary, layout]);

  return <p className="explore-validation-summary" ref={summaryRef}>{renderedChildren}</p>;
}
