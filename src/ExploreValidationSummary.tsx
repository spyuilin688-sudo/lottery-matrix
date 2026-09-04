import {
  Children,
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

function containsRoadSummaryLabel(node: ReactNode): boolean {
  if (typeof node === "string") return node.includes("版路：");
  if (Array.isArray(node)) return node.some(containsRoadSummaryLabel);
  if (isValidElement<SummaryElementProps>(node)) return containsRoadSummaryLabel(node.props.children);
  return false;
}

function formatRoadFormulaText(value: string): ReactNode {
  if (value.includes("拖牌")) {
    return value.split(/(拖牌)/g).map((part, index) => (
      part === "拖牌"
        ? <span className="validation-summary-drag-label" key={`drag-${index}`}>拖牌</span>
        : part
    ));
  }

  const parts = value.split("、").map((part) => part.trim());
  if (parts.length < 2 || !parts.every((part) => /^[+-]?\d+$/.test(part))) return value;

  return parts
    .map((part, index) => index === 0 ? part : part.replace(/^\+/, ""))
    .join(".");
}

function formatFormulaChildren(children: ReactNode): ReactNode {
  if (typeof children === "string") return formatRoadFormulaText(children);
  return Children.map(children, (child) => typeof child === "string" ? formatRoadFormulaText(child) : child);
}

function formatRoadSummaryNode(node: ReactNode): ReactNode {
  if (!isValidElement<SummaryElementProps>(node)) return node;

  const element = node as ReactElement<SummaryElementProps>;
  const classNames = element.props.className?.split(/\s+/) ?? [];
  const nextChildren = classNames.includes("validation-summary-formula")
    ? formatFormulaChildren(element.props.children)
    : Children.map(element.props.children, formatRoadSummaryNode);

  return cloneElement(element, undefined, nextChildren);
}

export function ExploreValidationSummary({ children }: { children: ReactNode }) {
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const [isMatrixExploreSummary, setIsMatrixExploreSummary] = useState(false);
  const renderedChildren = isMatrixExploreSummary && containsRoadSummaryLabel(children)
    ? Children.map(children, formatRoadSummaryNode)
    : children;

  useLayoutEffect(() => {
    const summary = summaryRef.current;
    if (!summary) return;
    const nextIsMatrixExploreSummary = Boolean(
      summary.closest(".matrix-explore-main-screen:not(.matrix-tianyan-screen)"),
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
  }, [children, isMatrixExploreSummary]);

  return <p className="explore-validation-summary" ref={summaryRef}>{renderedChildren}</p>;
}
