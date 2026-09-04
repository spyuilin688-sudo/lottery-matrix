// @vitest-environment jsdom

// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ExploreValidationSummary } from "../ExploreValidationSummary";

declare const process: { cwd(): string };

afterEach(() => {
  document.head.querySelectorAll("style[data-summary-test]").forEach((node) => node.remove());
});

function mountSummaryStyles() {
  const style = document.createElement("style");
  style.dataset.summaryTest = "true";
  style.textContent = readFileSync(`${process.cwd()}/src/matrix-explore-result-refinements.css`, "utf8");
  document.head.append(style);
}

describe("Matrix Explore validation summary formula tokens", () => {
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
