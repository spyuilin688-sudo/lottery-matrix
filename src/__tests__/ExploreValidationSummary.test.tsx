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

  it("keeps the sum label and +5 dot 15 in one one-pixel-spaced sequence", async () => {
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
      .map((token) => token.textContent)).toEqual(["合值", "+5", ".", "15"]);
    expect(getComputedStyle(sequence).gap).toBe("1px");
  });
});
