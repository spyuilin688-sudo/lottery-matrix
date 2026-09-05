// @vitest-environment jsdom

// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const readCss = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const escapeRegExp = (value: string) => value.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
const cssRule = (css: string, selector: string) => {
  const matches = [...css.matchAll(new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`, "g"))];
  expect(matches.length, `Missing CSS rule: ${selector}`).toBeGreaterThan(0);
  return matches.map((match) => match[1]).join("\n");
};

describe("Matrix result visual contract", () => {
  it("keeps a 14px result inset and gives the full added width to the Explore and Tianyan right column", () => {
    const css = readCss("src/matrix-explore-spacing.css");
    const screen = cssRule(css, ".matrix-explore-main-screen");
    const panel = cssRule(css, ".matrix-explore-main-screen .feature-body > .result-panel");
    const resultRows = cssRule(css, ".matrix-explore-main-screen:not(.matrix-tiangong-screen) .road-results-head,\n.matrix-explore-main-screen:not(.matrix-tiangong-screen) .road-result-row");
    const rightCells = cssRule(css, ".matrix-explore-main-screen:not(.matrix-tiangong-screen) .road-results-head > :last-child,\n.matrix-explore-main-screen:not(.matrix-tiangong-screen) .road-result-row > :last-child");

    expect(screen).toMatch(/--matrix-explore-result-panel-extra-width:\s*calc\(var\(--layout-page-inline\) \+ var\(--layout-page-inline\) - 28px\)/);
    expect(panel).toMatch(/--matrix-explore-result-panel-width:\s*calc\(100% \+ var\(--matrix-explore-result-panel-extra-width\)\)/);
    expect(resultRows).toMatch(/padding-right:\s*var\(--matrix-explore-result-panel-extra-width\)/);
    expect(rightCells).toMatch(/width:\s*calc\(100% \+ var\(--matrix-explore-result-panel-extra-width\)\)/);
    expect(rightCells).toMatch(/margin-right:\s*calc\(0px - var\(--matrix-explore-result-panel-extra-width\)\)/);
  });

  it("uses the requested shared pagination dimensions", () => {
    const css = readCss("src/feature-pages.css");
    const pagination = cssRule(css, ".history-pagination");
    const button = cssRule(css, ".history-pagination button");
    const pageNumber = cssRule(css, ".history-pagination span");

    expect(pagination).toMatch(/box-sizing:\s*border-box/);
    expect(pagination).toMatch(/width:\s*132px/);
    expect(pagination).toMatch(/height:\s*32px/);
    expect(pagination).toMatch(/grid-template-columns:\s*32px 68px 32px/);
    expect(button).toMatch(/width:\s*32px/);
    expect(button).toMatch(/height:\s*30px/);
    expect(pageNumber).toMatch(/width:\s*68px/);
  });

  it("applies the requested result count and separator colors", () => {
    const css = readCss("src/matrix-explore-spacing.css");
    const count = cssRule(css, ".matrix-explore-main-screen .result-title .result-count .numeric-text");
    const header = cssRule(css, ".matrix-explore-main-screen .road-results-head");
    const result = cssRule(css, ".matrix-explore-main-screen .road-results article + article");
    const sameCode = cssRule(css, '.matrix-explore-main-screen .road-results article[data-number-group-start="true"]');

    expect(count).toMatch(/color:\s*#a7d8ea/i);
    expect(header).toMatch(/border-bottom:\s*1px solid rgba\(117,\s*83,\s*41,\s*\.82\)/);
    expect(result).toMatch(/border-top:\s*1px solid rgba\(57,\s*55,\s*49,\s*\.58\)/);
    expect(sameCode).toMatch(/border-top:\s*0\.7px solid rgba\(230,\s*183,\s*106,\s*\.72\)/);
  });

  it("uses the requested Explore-only alternating background across all three validation columns", () => {
    const css = readCss("src/explore-result-preview.css");
    const odd = cssRule(css, ".matrix-explore-main-screen:not(.matrix-tianyan-screen):not(.matrix-tiangong-screen) .explore-validation-group:nth-child(odd)");
    const even = cssRule(css, ".matrix-explore-main-screen:not(.matrix-tianyan-screen):not(.matrix-tiangong-screen) .explore-validation-group:nth-child(even)");
    const columns = cssRule(css, ".explore-validation-issues,\n.explore-validation-numbers-card,\n.explore-validation-formulas");
    const prediction = cssRule(css, ".explore-validation-prediction b");

    expect(odd).toMatch(/background:\s*#152a42/i);
    expect(even).toMatch(/background:\s*#0e1d30/i);
    expect(columns).toMatch(/background:\s*transparent/);
    expect(prediction).toMatch(/font-weight:\s*800/);
  });

  it("uses deep black between validation columns and validation groups", () => {
    const css = readCss("src/explore-result-preview.css");
    const groups = cssRule(
      css,
      ".matrix-explore-main-screen:not(.matrix-tiangong-screen) .explore-validation-groups",
    );
    const group = cssRule(
      css,
      ".matrix-explore-main-screen:not(.matrix-tiangong-screen) .explore-validation-group",
    );

    expect(groups).toMatch(/background:\s*#02070c/i);
    expect(group).toMatch(/background:\s*#02070c/i);
  });
});
