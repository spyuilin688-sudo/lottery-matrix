// @vitest-environment jsdom

// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { cleanup, render, waitFor } from "@testing-library/react";
import { Fragment } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExploreValidationSummary } from "../ExploreValidationSummary";

declare const process: { cwd(): string };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.head.querySelectorAll("style[data-summary-test]").forEach((node) => node.remove());
});

function mountSummaryStyles() {
  const style = document.createElement("style");
  style.dataset.summaryTest = "true";
  style.textContent = readFileSync(`${process.cwd()}/src/matrix-explore-result-refinements.css`, "utf8");
  document.head.append(style);
}

describe("Matrix Explore validation summary formula tokens", () => {
  it.each(['matrix-explore-main-screen', 'matrix-explore-main-screen matrix-tianyan-screen'])("formats actual unsigned sum API values in %s", (className) => {
    mountSummaryStyles();
    const { container } = render(
      <div className={className}>
        <ExploreValidationSummary>
          <span className="validation-summary-formula-sequence">
            <span className="validation-summary-formula-label">合值</span>
            <i className="validation-summary-formula">5、15</i>
          </span>
        </ExploreValidationSummary>
      </div>,
    );
    expect([...container.querySelectorAll('.validation-summary-formula-label, .validation-summary-formula-token')]
      .map((node) => node.textContent)).toEqual(['合值', '5', '.', '15']);
    expect(getComputedStyle(container.querySelector('.validation-summary-formula-tokens')!).gap).toBe('1px');
    expect(getComputedStyle(container.querySelector('.validation-summary-formula-sequence')!).gap).toBe('1px');
  });
  it("formats nested and keyed Fragment children without invalid props or extra DOM wrappers", () => {
    const consoleError = vi.spyOn(console, "error");
    const { container } = render(
      <div className="matrix-explore-main-screen">
        <ExploreValidationSummary>
          <>
            <Fragment key="road">
              <span className="validation-summary-position">同期</span>
              <i className="validation-summary-formula">+5、+15</i>
              <i className="validation-summary-formula">拖牌</i>
              {null}
              {false}
              {"下期"}
              {2}
            </Fragment>
          </>
        </ExploreValidationSummary>
      </div>,
    );

    const summary = container.querySelector(".explore-validation-summary")!;
    expect([...summary.children].map((child) => child.tagName)).toEqual(["SPAN", "I", "I"]);
    expect(summary.querySelector(".validation-summary-same-period")?.textContent).toBe("同期");
    expect([...summary.querySelectorAll(".validation-summary-formula-token")]
      .map((token) => token.textContent)).toEqual(["+5", ".", "15"]);
    expect(summary.querySelector(".validation-summary-drag-label")?.textContent).toBe("拖牌");
    expect(summary.textContent).toBe("同期+5.15拖牌下期2");
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("renders +5 dot 15 as separate one-pixel-spaced tokens", async () => {
    mountSummaryStyles();
    const { container } = render(
      <div className="matrix-explore-main-screen">
        <ExploreValidationSummary>
          <i className="validation-summary-formula">+5、+15</i>
        </ExploreValidationSummary>
      </div>,
    );

    await waitFor(() => expect(container.querySelectorAll(".validation-summary-formula-token")).toHaveLength(3));
    const tokens = [...container.querySelectorAll(".validation-summary-formula-token")];
    expect(tokens.map((token) => token.textContent)).toEqual(["+5", ".", "15"]);
    expect(getComputedStyle(container.querySelector(".validation-summary-formula-tokens")!).gap).toBe("1px");
  });

  it("removes plus signs from the sum sequence and keeps one-pixel spacing", async () => {
    mountSummaryStyles();
    const { container } = render(
      <div className="matrix-explore-main-screen">
        <ExploreValidationSummary>
          <span className="validation-summary-formula-sequence">
            <span className="validation-summary-formula-label">合值</span>
            <i className="validation-summary-formula">+5、+15</i>
          </span>
        </ExploreValidationSummary>
      </div>,
    );

    await waitFor(() => expect(container.querySelectorAll(".validation-summary-formula-token")).toHaveLength(3));
    const sequence = container.querySelector(".validation-summary-formula-sequence")!;
    expect([...sequence.querySelectorAll(".validation-summary-formula-label, .validation-summary-formula-token")]
      .map((token) => token.textContent)).toEqual(["合值", "5", ".", "15"]);
    expect(getComputedStyle(sequence).gap).toBe("1px");
  });
});

describe('two-row summary fitting', () => {
  it('measures contents-only rows and includes the second-row indent in the width budget', () => {
    const style = document.createElement('style');
    style.dataset.summaryTest = 'true';
    style.textContent = '.explore-validation-summary { font-size: var(--explore-summary-fit-font-size, 13px); padding: 0; }';
    document.head.append(style);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const scale = Number.parseFloat(this.closest('.explore-validation-summary')?.getAttribute('style')?.match(/([\d.]+)px/)?.[1] ?? '13') / 13;
      if (this.dataset.fit === 'first') return { left: 10, right: 10, width: 0 } as DOMRect;
      if (this.dataset.fit === 'second') return { left: 10 + 40 * scale, right: 10 + 320 * scale, width: 280 * scale } as DOMRect;
      if (this.className === 'explore-validation-consecutive-tag') return { left: 260, right: 310, width: 50 } as DOMRect;
      return { left: 10, right: 310, width: 300 } as DOMRect;
    });
    // jsdom has no layout engine; use a Range with the text's measured bounds.
    vi.spyOn(document, 'createRange').mockImplementation(() => {
      let selected: HTMLElement;
      return {
        selectNodeContents: (node: HTMLElement) => { selected = node; },
        getBoundingClientRect: () => {
          const scale = Number.parseFloat(selected.closest('.explore-validation-summary')?.getAttribute('style')?.match(/([\d.]+)px/)?.[1] ?? '13') / 13;
          return selected.dataset.fit === 'first'
            ? { left: 10, right: 10 + 290 * scale, width: 290 * scale }
            : { left: 10 + 40 * scale, right: 10 + 320 * scale, width: 280 * scale };
        },
      } as unknown as Range;
    });
    const { container } = render(<header>
      <ExploreValidationSummary layout="tianyan">
        <span className="tianyan-validation-summary-row" data-fit="first">開 33 第 4 顆、同期 40 第 5 顆</span>
        <span className="tianyan-validation-summary-row" data-fit="second">上 9 期｜第 6 顆｜+26.33｜下 1 期開</span>
      </ExploreValidationSummary>
      <strong className="explore-validation-consecutive-tag">準11進12</strong>
    </header>);
    const summary = container.querySelector<HTMLElement>('.explore-validation-summary')!;
    const size = Number.parseFloat(summary.style.getPropertyValue('--explore-summary-fit-font-size')) || 13;
    expect(290 * size / 13).toBeLessThanOrEqual(246);
    expect(320 * size / 13).toBeLessThanOrEqual(300);
  });
});
