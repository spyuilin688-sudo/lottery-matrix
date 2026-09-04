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

  it("uses one alternating background across all three validation columns", () => {
    const css = readCss("src/explore-result-preview.css");
    const odd = cssRule(css, ".explore-validation-group:nth-child(odd)");
    const even = cssRule(css, ".explore-validation-group:nth-child(even)");
    const columns = cssRule(css, ".explore-validation-issues,\n.explore-validation-numbers-card,\n.explore-validation-formulas");

    expect(odd).toMatch(/background:\s*#080f1b/i);
    expect(even).toMatch(/background:\s*#0c1422/i);
    expect(columns).toMatch(/background:\s*transparent/);
  });
});
