// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

declare const process: { cwd(): string };

const bridge = vi.hoisted(() => ({ render: vi.fn(() => null) }));

vi.mock("../auth/MemberSessionBridge", () => ({ MemberSessionBridge: bridge.render }));
vi.mock("../Prototype", () => ({ default: () => <div>member-root</div> }));

import App from "../App";
import { ExploreResultPreviewPage } from "../ExploreResultPreviewPage";

afterEach(() => {
  cleanup();
  document.querySelectorAll("style[data-preview-production-test]").forEach((style) => style.remove());
});

function mountPreviewProductionStyles() {
  const style = document.createElement("style");
  style.dataset.previewProductionTest = "true";
  style.textContent = [
    "src/design-tokens.css",
    "src/explore-result-preview.css",
    "src/feature-pages.css",
    "src/matrix-explore-spacing.css",
  ].map((path) => readFileSync(`${process.cwd()}/${path}`, "utf8").replace(/^@import[^;]+;\s*/, "")).join("\n");
  document.head.append(style);
  return style;
}

describe("production member shell", () => {
  it("renders the isolated exploration result page only on its direct path", () => {
    window.history.replaceState({}, "", "/explore-result-preview");

    render(<App />);

    expect(screen.getByRole("main", { name: "探索結果區" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "探索結果區" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /展開版路/ })).toHaveLength(4);
    expect(screen.queryByText("member-root")).not.toBeInTheDocument();
  });

  it("keeps the isolated exploration result page available when the path has a trailing slash", () => {
    window.history.replaceState({}, "", "/explore-result-preview/");

    render(<App />);

    expect(screen.getByRole("main", { name: "探索結果區" })).toBeInTheDocument();
    expect(screen.queryByText("member-root")).not.toBeInTheDocument();
  });

  it("keeps the isolated preview logo inside its responsive title banner", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    const previewStyle = document.createElement("style");
    previewStyle.textContent = readFileSync(`${process.cwd()}/src/explore-result-preview.css`, "utf8");
    document.head.append(previewStyle);

    render(<App />);

    const logo = screen.getByRole("img", { name: "Matrix 探索" });
    const logoStyles = getComputedStyle(logo);
    expect(logoStyles.display).toBe("block");
    expect(logoStyles.width).toBe("100%");
    expect(logoStyles.maxWidth).toBe("100%");
    expect(logoStyles.height).toBe("auto");
    expect(logoStyles.objectFit).toBe("contain");

    previewStyle.remove();
  });

  it("keeps isolated preview headings and result rows readable", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    const previewStyle = document.createElement("style");
    previewStyle.textContent = readFileSync(`${process.cwd()}/src/explore-result-preview.css`, "utf8");
    document.head.append(previewStyle);

    render(<App />);

    expect(getComputedStyle(screen.getByRole("main", { name: "探索結果區" })).color)
      .toBe("rgb(242, 245, 248)");
    expect(getComputedStyle(screen.getByRole("heading", { name: "探索結果區" })).color)
      .toBe("rgba(244, 206, 103, 0.84)");
    expect(getComputedStyle(document.querySelector(".road-results article")!).color)
      .toBe("rgb(170, 181, 196)");
    const positionTag = document.querySelector(".road-results .tag");
    expect(getComputedStyle(positionTag!).color).toBe("rgb(216, 195, 141)");
    expect(getComputedStyle(positionTag!).borderTopWidth).toBe("1px");

    previewStyle.remove();
  });

  it("matches the reference navy surfaces and restrained gold and blue borders", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    const productionStyle = mountPreviewProductionStyles();

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-04" }));

    const main = screen.getByRole("main", { name: "探索結果區" });
    const panel = document.querySelector(".result-panel");
    const validation = document.querySelector(".explore-validation-card");
    const summaryCard = document.querySelector(".explore-validation-summary-card");
    const summaryTag = document.querySelector(".explore-validation-consecutive-tag");
    const summary = document.querySelector(".explore-validation-summary");
    const issues = document.querySelector(".explore-validation-issues");
    const issueRow = document.querySelector(".explore-validation-issue");
    const numbers = document.querySelector(".explore-validation-numbers-card");
    const formulas = document.querySelector(".explore-validation-formulas");
    const prediction = document.querySelector(".explore-validation-prediction");
    const secondFormula = document.querySelector(".explore-validation-formula-row:nth-child(2)");
    const source = document.querySelector(".explore-validation-number--source");
    const step = document.querySelector(".explore-validation-number--step");
    const hit = document.querySelector(".explore-validation-number--hit");
    const primaryFormula = document.querySelector(".explore-validation-formula-row:first-child");
    const secondaryFormula = document.querySelector(".explore-validation-formula-row:last-child");
    const predictionTitle = document.querySelector(".explore-validation-prediction strong");

    expect(getComputedStyle(main).backgroundImage)
      .toBe("linear-gradient(180deg, rgb(2, 7, 12) 0%, rgb(3, 11, 17) 100%)");
    expect(getComputedStyle(main).color).toBe("rgb(242, 245, 248)");
    expect(getComputedStyle(panel!).backgroundImage)
      .toBe("linear-gradient(145deg, rgba(8, 16, 22, 0.96), rgba(2, 8, 13, 0.98))");
    expect(getComputedStyle(panel!).borderTopColor).toBe("rgb(117, 83, 41)");
    expect(getComputedStyle(validation!).borderTopWidth).toBe("0px");
    expect(getComputedStyle(validation!).backgroundColor).toBe("rgba(3, 9, 20, 0.72)");
    expect(getComputedStyle(validation!).boxShadow).toBe("inset 0 1px 0 rgba(102, 169, 255, .18)");
    expect(getComputedStyle(summaryCard!).borderTopColor).toBe("rgb(230, 183, 106)");
    expect(getComputedStyle(summaryCard!).borderTopWidth).toBe("1px");
    expect(getComputedStyle(summaryTag!).backgroundColor).toBe("rgba(10, 14, 24, 0.98)");
    expect(getComputedStyle(summaryTag!).borderTopColor).toBe("rgba(223, 176, 68, 0.68)");
    expect(getComputedStyle(summaryTag!).color).toBe("rgb(228, 201, 128)");
    expect(getComputedStyle(summary!).backgroundColor).toBe("rgba(10, 14, 24, 0.92)");
    expect(getComputedStyle(summary!).borderTopWidth).toBe("0px");
    expect(getComputedStyle(issues!).backgroundColor).toBe("rgba(8, 15, 27, 0.82)");
    expect(getComputedStyle(issueRow!).color).toBe("rgb(186, 197, 210)");
    expect(getComputedStyle(numbers!).backgroundColor).toBe("rgba(8, 15, 27, 0.82)");
    expect(getComputedStyle(formulas!).backgroundColor).toBe("rgba(8, 15, 27, 0.82)");
    expect(getComputedStyle(secondFormula!).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(prediction!).backgroundColor).toBe("rgba(230, 183, 106, 0.14)");
    expect(getComputedStyle(prediction!).borderTopColor).toBe("rgb(230, 183, 106)");
    expect(getComputedStyle(issues!).borderTopColor).toBe("rgba(91, 126, 169, 0.42)");
    expect(getComputedStyle(secondFormula!).borderTopColor).toBe("rgba(91, 126, 169, 0.34)");
    expect(getComputedStyle(primaryFormula!).color).toBe("rgb(228, 201, 128)");
    expect(getComputedStyle(secondaryFormula!).color).toBe("rgb(186, 197, 210)");
    expect(getComputedStyle(predictionTitle!).color).toBe("rgb(228, 201, 128)");
    expect(getComputedStyle(source!).borderTopColor).toBe("rgb(88, 211, 230)");
    expect(getComputedStyle(source!).borderTopWidth).toBe("1px");
    expect(getComputedStyle(source!).backgroundColor).toBe("rgba(88, 211, 230, 0.14)");
    expect(getComputedStyle(step!).borderTopColor).toBe("rgb(230, 183, 106)");
    expect(getComputedStyle(step!).backgroundColor).toBe("rgba(230, 183, 106, 0.14)");
    expect(getComputedStyle(hit!).borderTopColor).toBe("rgb(231, 132, 165)");
    expect(getComputedStyle(hit!).backgroundColor).toBe("rgba(231, 132, 165, 0.14)");

    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-09" }));
    const neutralNumber = document.querySelector(".explore-validation-numbers b");
    const special = document.querySelector(".explore-validation-numbers em");
    expect(getComputedStyle(neutralNumber!).color).toBe("rgb(186, 197, 210)");
    expect(getComputedStyle(special!).borderTopColor).toBe("rgb(230, 183, 106)");
    expect(getComputedStyle(special!).color).toBe("rgb(230, 183, 106)");
    expect(getComputedStyle(special!).backgroundColor).toBe("rgba(230, 183, 106, 0.14)");

    productionStyle.remove();
  });

  it("expands the consecutive filter inline and filters results immediately", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    render(<App />);

    const disclosure = screen.getByRole("button", { name: "連準篩選" });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: "準4+（鎖定1碼）連準篩選" })).not.toBeInTheDocument();

    fireEvent.click(disclosure);

    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    const filter = screen.getByRole("group", { name: "準4+（鎖定1碼）連準篩選" });
    expect(within(filter).getAllByRole("button")).toHaveLength(4);
    expect(within(filter).getByRole("button", { name: "準4進5" })).toBeInTheDocument();
    expect(within(filter).getByRole("button", { name: "準5進6" })).toBeInTheDocument();
    expect(within(filter).getByRole("button", { name: "準6進7" })).toBeInTheDocument();
    const sevenToEight = within(filter).getByRole("button", { name: "準7進8" });
    expect(sevenToEight).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(sevenToEight);

    expect(screen.getByText(/探索到/).parentElement).toHaveTextContent("探索到 3 組符合條件版路");
    expect(screen.queryByRole("button", { name: "展開版路 result-09" })).not.toBeInTheDocument();

    fireEvent.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: "準4+（鎖定1碼）連準篩選" })).not.toBeInTheDocument();
  });

  it("provides the approved consecutive options for the 準5+ hit condition", () => {
    render(<ExploreResultPreviewPage hitCondition="準5+" />);

    fireEvent.click(screen.getByRole("button", { name: "連準篩選" }));

    const filter = screen.getByRole("group", { name: "準5+（鎖定2碼）連準篩選" });
    expect(within(filter).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "準5進6",
      "準6進7",
      "準7進8",
      "準9進10",
      "準11進12",
    ]);
  });

  it("restores the four deployed preview results without changing the member app", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    render(<App />);

    expect(screen.getByText(/探索到/).parentElement).toHaveTextContent("探索到 4 組符合條件版路");
    for (const id of ["result-04", "result-09", "result-07", "result-14"]) {
      expect(screen.getByRole("button", { name: `展開版路 ${id}` })).toBeInTheDocument();
    }
  });

  it("keeps only the most recently opened preview result expanded", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-04" }));
    expect(screen.getByRole("region", { name: "04 驗證過程" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-09" }));

    expect(screen.queryByRole("region", { name: "04 驗證過程" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "09 驗證過程" })).toBeInTheDocument();
  });

  it("uses the approved one-line summary format", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-04" }));

    expect(document.querySelector(".explore-validation-summary")?.textContent)
      .toBe("開 04 第 1 顆  |  同期  |  第 4 顆  |  +24.36  |  下 1 期開");
  });

  it("keeps the consecutive tag as a direct child of the summary card", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-04" }));

    const summary = document.querySelector(".explore-validation-summary-card");
    expect(summary).not.toBeNull();
    expect(summary?.querySelector(":scope > .explore-validation-consecutive-tag")).toHaveTextContent("準6進7");
  });

  it("renders issue, number, and formula columns as independent cards", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-14" }));

    const firstGroup = document.querySelector(".explore-validation-group");
    expect(firstGroup).not.toBeNull();
    expect(firstGroup?.children).toHaveLength(3);
    expect(firstGroup?.children[0]).toHaveClass("explore-validation-issues");
    expect(firstGroup?.children[1]).toHaveClass("explore-validation-numbers-card");
    expect(firstGroup?.children[2]).toHaveClass("explore-validation-formulas");
  });

  it("limits every validation group to at most three rows", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-14" }));

    for (const group of document.querySelectorAll(".explore-validation-group")) {
      expect(within(group as HTMLElement).getAllByText(/^\d{5}$/).length).toBeLessThanOrEqual(3);
    }
  });

  it("inserts one half-width space before formula plus signs", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-09" }));

    expect(screen.getAllByText("第2顆 09 +21 = 30").length).toBeGreaterThan(0);
  });

  it("keeps the scoped tag selector and lets the period column fit its content", () => {
    const css = readFileSync(`${process.cwd()}/src/explore-result-preview.css`, "utf8");

    expect(css).toMatch(/\.explore-validation-summary-card\s*>\s*\.explore-validation-consecutive-tag\s*\{/);
    expect(css).toMatch(/\.explore-validation-summary-card\s*>\s*\.explore-validation-consecutive-tag\s*\{[^}]*top:\s*2px[^}]*right:\s*2px/s);
    expect(css).toMatch(/\.explore-result-preview-screen \.road-results \.road-result-row\.explore-result-row\s*\{[^}]*min-height:\s*0[^}]*padding:\s*6px 0/s);
    expect(css).toMatch(/font-size:\s*8px/);
    expect(css).toMatch(/grid-template-columns:\s*max-content\s+minmax\(0,\s*1fr\)\s+minmax\(clamp\(92px,\s*30vw,\s*120px\),\s*120px\)/);
    expect(css).toMatch(/column-gap:\s*0/);
    expect(css).toMatch(/row-gap:\s*4px/);
    expect(css).not.toContain("!important");
  });

  it("keeps issue and formula typography aligned with the approved mobile layout", () => {
    const css = readFileSync(`${process.cwd()}/src/explore-result-preview.css`, "utf8");

    expect(css).toMatch(/\.explore-validation-issue\s*\{[^}]*padding:\s*3px 4px[^}]*font-size:\s*9px[^}]*font-weight:\s*700[^}]*letter-spacing:\s*-\.06em/s);
    expect(css).toMatch(/\.explore-validation-formula-row\s*\{[^}]*padding:\s*3px 6px/s);
    expect(css).toMatch(/\.explore-validation-summary\s*\{[^}]*padding:\s*3px 4px[^}]*font-size:\s*clamp\(10px,\s*2\.8vw,\s*12px\)[^}]*white-space:\s*nowrap/s);
    expect(css).toMatch(/\.explore-validation-formulas\s*\{[^}]*font-size:\s*clamp\(5px,\s*1\.7vw,\s*8\.5px\)/s);
    expect(css).toMatch(/\.explore-validation-formula-row\s*\{[^}]*white-space:\s*nowrap/s);
  });

  it("keeps formal result rows compact and colors same-code only when selected", () => {
    const css = readFileSync(`${process.cwd()}/src/matrix-explore-spacing.css`, "utf8");

    expect(css).toMatch(/\.matrix-explore-main-screen \.road-result-row\s*\{[^}]*min-height:\s*0[^}]*padding:\s*6px 0/s);
    expect(css).toMatch(/\.repeat-stats-heading button\s*\{[^}]*color:\s*#aaa7a2/s);
    expect(css).toMatch(/\.repeat-stats-heading button\[data-selected="true"\]\s*\{[^}]*color:\s*#f4ce67/s);
    expect(css).toMatch(/\.matrix-explore-consecutive-filter-options\s*\{[^}]*padding:\s*3px 0[^}]*border-top:[^}]*border-bottom:/s);
  });

  it("keeps the expanded wrapper borderless and strengthens validation outlines and row dividers", () => {
    const css = readFileSync(`${process.cwd()}/src/explore-result-preview.css`, "utf8");

    expect(css).toMatch(/\.explore-validation-card\s*\{[^}]*border:\s*0/s);
    expect(css).toMatch(/\.explore-validation-issues,\s*\.explore-validation-numbers-card,\s*\.explore-validation-formulas\s*\{[^}]*border:\s*1px solid rgba\(91,\s*126,\s*169,\s*\.42\)/s);
    expect(css).toMatch(/\.explore-validation-number-row:nth-child\(n \+ 2\),\s*\.explore-validation-issue:nth-child\(n \+ 2\),\s*\.explore-validation-formula-row:nth-child\(n \+ 2\)\s*\{[^}]*border-top:\s*1px solid rgba\(91,\s*126,\s*169,\s*\.34\)/s);
    expect(css).not.toMatch(/\.explore-validation-number-row:nth-child\(n \+ 3\)/);
    expect(css).not.toMatch(/\.explore-validation-number-row:nth-child\(-n \+ 2\)/);
  });

  it("styles only the expanded summary consecutive value as a tag card", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    const previewStyle = document.createElement("style");
    previewStyle.textContent = readFileSync(`${process.cwd()}/src/explore-result-preview.css`, "utf8");
    document.head.append(previewStyle);

    render(<App />);

    const rowConsecutive = document.querySelector(".result-consecutive");
    expect(rowConsecutive).not.toBeNull();
    expect(document.querySelector(".explore-result-consecutive-tag")).toBeNull();
    expect(getComputedStyle(rowConsecutive!).fontSize).toBe("10px");
    expect(getComputedStyle(rowConsecutive!).borderTopWidth).toBe("0px");
    expect(getComputedStyle(rowConsecutive!).backgroundColor).toBe("rgba(0, 0, 0, 0)");

    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-04" }));
    const summaryTag = document.querySelector(".explore-validation-consecutive-tag");
    expect(summaryTag).not.toBeNull();
    expect(getComputedStyle(summaryTag!).fontSize).toBe("8px");
    expect(getComputedStyle(summaryTag!).borderTopWidth).toBe("1px");

    previewStyle.remove();
  });

  it("keeps unexpanded result rows auto-sized with six-pixel vertical padding after shared styles load", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    const productionStyle = mountPreviewProductionStyles();

    render(<App />);

    const resultRow = document.querySelector(".explore-result-row");
    expect(resultRow).not.toBeNull();
    expect(getComputedStyle(resultRow!).minHeight).toBe("0px");
    expect(getComputedStyle(resultRow!).paddingTop).toBe("6px");
    expect(getComputedStyle(resultRow!).paddingBottom).toBe("6px");

    productionStyle.remove();
  });

  it("keeps the approved unexpanded result hierarchy after shared styles load", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    const productionStyle = mountPreviewProductionStyles();
    const previewCss = readFileSync(`${process.cwd()}/src/explore-result-preview.css`, "utf8");

    render(<App />);

    const filterButton = screen.getByRole("button", { name: "連準篩選" });
    const resultCount = document.querySelector(".explore-result-count-number");
    const resultNumber = document.querySelector(".explore-result-column-number");
    const tableHead = document.querySelector(".road-results-head");
    const tableHeadLabel = document.querySelector(".road-results-head > span");

    expect(getComputedStyle(filterButton).borderTopColor).toBe("rgba(117, 83, 41, 0.62)");
    expect(getComputedStyle(filterButton).color).toBe("rgb(170, 167, 162)");
    expect(resultCount).not.toBeNull();
    expect(resultNumber).not.toBeNull();
    expect(getComputedStyle(resultCount!).color).toBe("rgb(167, 216, 234)");
    expect(getComputedStyle(resultNumber!).color).toBe("rgb(242, 245, 248)");
    expect(getComputedStyle(tableHead!).paddingTop).toBe("8px");
    expect(getComputedStyle(tableHeadLabel!).fontSize).toBe("12px");
    expect(getComputedStyle(tableHeadLabel!).fontWeight).toBe("800");
    expect(previewCss).toMatch(/\.explore-result-preview-screen\.matrix-explore-main-screen \.road-results-head > span\s*\{[^}]*font-size:\s*12px;[^}]*font-size:\s*clamp\(11px,\s*3\.08vw,\s*12px\)/s);

    productionStyle.remove();
  });

  it("renders the expanded summary consecutive tag with the reference dark surface", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    const productionStyle = mountPreviewProductionStyles();

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-04" }));

    const summaryTag = document.querySelector(".explore-validation-consecutive-tag");
    expect(summaryTag).not.toBeNull();
    expect(getComputedStyle(summaryTag!).backgroundColor).toBe("rgba(10, 14, 24, 0.98)");
    expect(getComputedStyle(summaryTag!).top).toBe("2px");
    expect(getComputedStyle(summaryTag!).right).toBe("2px");

    productionStyle.remove();
  });

  it("keeps expanded validation rows responsive without a fixed height", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    const productionStyle = mountPreviewProductionStyles();

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-04" }));

    const validationCard = document.querySelector(".explore-validation-card");
    expect(getComputedStyle(validationCard!).getPropertyValue("--explore-validation-row-min-height").replace(/\s/g, ""))
      .toBe("clamp(27px,7.18vw,28px)");

    for (const selector of [
      ".explore-validation-issue",
      ".explore-validation-formula-row",
    ]) {
      const row = document.querySelector(selector);
      expect(row).not.toBeNull();
      expect(getComputedStyle(row!).height).toBe("auto");
      expect(getComputedStyle(row!).minHeight).toBe("var(--explore-validation-row-min-height)");
      expect(getComputedStyle(row!).paddingTop).toBe("3px");
      expect(getComputedStyle(row!).paddingBottom).toBe("3px");
    }

    const numberRow = document.querySelector(".explore-validation-draw-row");
    expect(numberRow).not.toBeNull();
    expect(getComputedStyle(numberRow!).height).toBe("auto");
    expect(getComputedStyle(numberRow!).minHeight).toBe("var(--explore-validation-row-min-height)");
    expect(getComputedStyle(numberRow!).paddingTop).toBe("1.5px");
    expect(getComputedStyle(numberRow!).paddingBottom).toBe("1.5px");

    productionStyle.remove();
  });

  it("uses the loaded Roboto 700 face for left-column issue numbers", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    const productionStyle = mountPreviewProductionStyles();

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-04" }));

    const issue = document.querySelector(".explore-validation-issue");
    expect(issue).not.toBeNull();
    expect(getComputedStyle(issue!).fontFamily).toBe("Roboto, Arial, sans-serif");
    expect(getComputedStyle(issue!).fontWeight).toBe("700");

    productionStyle.remove();
  });

  it("uses one four-pixel gap between every validation group", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    const productionStyle = mountPreviewProductionStyles();

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-04" }));

    const groups = document.querySelector(".explore-validation-groups");
    const incompleteGroup = document.querySelector('.explore-validation-group[data-complete="false"]');
    expect(getComputedStyle(groups!).rowGap).toBe("4px");
    expect(getComputedStyle(incompleteGroup!).marginTop).toBe("0px");

    productionStyle.remove();
  });

  it("uses the approved inline filter and expanded validation spacing", () => {
    const css = readFileSync(`${process.cwd()}/src/explore-result-preview.css`, "utf8");

    expect(css).toMatch(/\.explore-consecutive-filter-button\s*\{[^}]*width:\s*max-content[^}]*height:\s*21\.2px[^}]*font-size:\s*11px/s);
    expect(css).toMatch(/\.explore-consecutive-filter-button::before\s*\{[^}]*width:\s*max\(100%,\s*44px\)[^}]*height:\s*44px/s);
    expect(css).toMatch(/\.explore-result-preview-screen\.matrix-explore-main-screen \.result-title\s*\{[^}]*margin-bottom:\s*6px/s);
    expect(css).toMatch(/\.explore-consecutive-filter-options\s*\{[^}]*margin:\s*0 0 6px[^}]*padding:\s*4px 0[^}]*border-top:\s*1px solid rgba\(117,\s*83,\s*41,\s*\.68\)[^}]*border-bottom:\s*1px solid rgba\(117,\s*83,\s*41,\s*\.68\)[^}]*animation:\s*explore-filter-options-expand \.18s ease-out/s);
    expect(css).toMatch(/@keyframes explore-filter-options-expand[\s\S]*?from\s*\{[^}]*opacity:\s*0[^}]*transform:\s*translateY\(-2px\) scaleY\(\.96\)[\s\S]*?to\s*\{[^}]*opacity:\s*1[^}]*transform:\s*translateY\(0\) scaleY\(1\)/);
    expect(css).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.explore-consecutive-filter-options\s*\{[^}]*animation:\s*none/s);
    expect(css).toMatch(/\.explore-validation-card\s*\{[^}]*margin:\s*6px 0 0/s);
    expect(css).toMatch(/\.explore-validation-groups\s*\{[^}]*row-gap:\s*4px/s);
    expect(css).toMatch(/\.explore-validation-group\s*\{[^}]*column-gap:\s*0/s);
    expect(css).toMatch(/\.explore-validation-issues\s*\{[^}]*margin-right:\s*6px/s);
    expect(css).toMatch(/\.explore-validation-numbers-card\s*\{[^}]*margin-right:\s*4px/s);
    expect(css).toMatch(/\.explore-validation-draw-row\s*\{[^}]*padding:\s*1\.5px 0/s);
    expect(css).toMatch(/\.explore-validation-numbers\s*\{[^}]*padding:\s*1px 3px/s);
    expect(css).toMatch(/\.explore-validation-group\[data-wide-numbers="true"\] \.explore-validation-numbers\s*\{[^}]*padding-inline:\s*3px/s);
    expect(css).toMatch(/--explore-validation-summary-font-size:\s*clamp\(11px,\s*3\.08vw,\s*12px\)/);
    expect(css).toMatch(/\.explore-validation-prediction\s*\{[^}]*margin-bottom:\s*8px/s);
  });

  it("matches the explore settings option style inside the isolated consecutive filter", () => {
    const css = readFileSync(`${process.cwd()}/src/explore-result-preview.css`, "utf8");

    expect(css).toMatch(/\.explore-consecutive-filter-option\s*\{[^}]*height:\s*21px[^}]*min-height:\s*21px[^}]*border:\s*1px solid rgba\(117,\s*83,\s*41,\s*\.62\)[^}]*border-radius:\s*10px[^}]*color:\s*#b9b5ae[^}]*background:\s*rgba\(3,\s*11,\s*17,\s*\.35\)/s);
    expect(css).toMatch(/\.explore-consecutive-filter-option\[aria-pressed="true"\]\s*\{[^}]*border-color:\s*#f4ce67[^}]*color:\s*#f4ce67[^}]*background:\s*rgba\(212,\s*165,\s*47,\s*\.1\)/s);
    expect(css).toMatch(/\.explore-result-preview-screen \.road-results article \+ article\s*\{[^}]*border-top:\s*0;/s);
  });

  it("keeps validation number states square and gives the prediction the transparent gold-orange reference surface", () => {
    const css = readFileSync(`${process.cwd()}/src/explore-result-preview.css`, "utf8");

    expect(css).toMatch(/\.explore-validation-number\s*\{[^}]*width:\s*clamp\(17px,\s*4\.87vw,\s*19px\)[^}]*height:\s*clamp\(17px,\s*4\.87vw,\s*19px\)[^}]*aspect-ratio:\s*1/s);
    expect(css).toMatch(/\.explore-validation-prediction\s*\{[^}]*padding:\s*4px 8px[^}]*border:\s*1px solid #e6b76a[^}]*border-radius:\s*8px[^}]*background:\s*rgba\(230,\s*183,\s*106,\s*\.14\)/s);
    expect(css).toMatch(/\.explore-validation-prediction b\s*\{[^}]*color:\s*#e6b76a/s);
  });

  it("keeps the five-number validation row compact without changing the wide 6+1 layout", () => {
    const css = readFileSync(`${process.cwd()}/src/explore-result-preview.css`, "utf8");

    expect(css).toMatch(/\.explore-validation-issues\s*\{[^}]*border-radius:\s*3px/s);
    expect(css).toMatch(/\.explore-validation-group\[data-wide-numbers="false"\] \.explore-validation-numbers\s*\{[^}]*justify-content:\s*center[^}]*gap:\s*clamp\(4px,\s*1\.5vw,\s*6px\)[^}]*padding-inline:\s*6px/s);
    expect(css).toMatch(/\.explore-validation-group\[data-wide-numbers="true"\] \.explore-validation-numbers\s*\{[^}]*gap:\s*0[^}]*padding-inline:\s*3px/s);
  });

  it("frames the current prediction with decorative double-arrow icons", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-04" }));

    const prediction = document.querySelector(".explore-validation-prediction");
    expect(prediction?.querySelector(".explore-validation-prediction-arrow--left")).toHaveAttribute("aria-hidden", "true");
    expect(prediction?.querySelector(".explore-validation-prediction-arrow--right")).toHaveAttribute("aria-hidden", "true");
    expect(prediction?.querySelector(".explore-validation-prediction-content")).toHaveTextContent("本期預測15、27");
  });

  it("keeps the complete expanded validation area independent from reference page classes", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-04" }));

    const validation = screen.getByRole("region", { name: "04 驗證過程" });
    expect(validation).toHaveClass("explore-validation-card");
    expect(validation.querySelector('[class^="reference-"], [class*=" reference-"]')).toBeNull();
    expect(validation.querySelector(".numeric-text")).toBeNull();
    for (const element of validation.querySelectorAll("[class]")) {
      for (const className of element.classList) {
        expect(className).toMatch(/^explore-validation-/);
      }
    }
  });

  it("keeps issue numbers at 9px and 700 when the shared reference rule loads later", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    const previewStyle = document.createElement("style");
    previewStyle.textContent = readFileSync(`${process.cwd()}/src/explore-result-preview.css`, "utf8");
    const sharedStyle = document.createElement("style");
    sharedStyle.textContent = ".reference-issue { font: inherit; }";
    document.head.append(previewStyle, sharedStyle);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-04" }));

    const issue = document.querySelector(".explore-validation-issue");
    expect(issue).not.toBeNull();
    expect(getComputedStyle(issue!).fontSize).toBe("9px");
    expect(getComputedStyle(issue!).fontWeight).toBe("700");

    previewStyle.remove();
    sharedStyle.remove();
  });

  it("renders the member app without the virtual phone frame", () => {
    window.history.replaceState({}, "", "/");

    render(<App />);

    expect(screen.getByText("member-root")).toBeInTheDocument();
    expect(screen.queryByTestId("phone-frame")).not.toBeInTheDocument();
    expect(screen.queryByTestId("device-screen")).not.toBeInTheDocument();
    expect(bridge.render).toHaveBeenCalledTimes(1);
  });

  it("keeps the production member app inside a fluid mobile canvas capped at 430px", () => {
    window.history.replaceState({}, "", "/");
    const style = document.createElement("style");
    style.textContent = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");
    document.head.append(style);

    render(<App />);

    const canvas = screen.getByTestId("app-mobile-canvas");
    expect(canvas).toContainElement(
      screen.getByText("member-root"),
    );
    const canvasStyles = getComputedStyle(canvas);
    expect(canvasStyles.position).toBe("relative");
    expect(canvasStyles.width).toBe("100%");
    expect(canvasStyles.maxWidth).toBe("var(--app-layout-max)");
    expect(canvasStyles.marginInline).toBe("auto");
    expect(canvasStyles.overflow).toBe("hidden");
    expect(canvasStyles.contain).toBe("layout paint");
    expect(
      getComputedStyle(document.documentElement)
        .getPropertyValue("--app-layout-max")
        .trim(),
    ).toBe("430px");

    style.remove();
  });

  it("keeps the removed visual auth gate and stylesheet out of the app shell", () => {
    const source = readFileSync(`${process.cwd()}/src/App.tsx`, "utf8");

    expect(source).toContain('from "./auth/MemberSessionBridge"');
    expect(source).not.toContain("LineAuthGate");
    expect(source).not.toContain("line-login.css");
  });

  it("does not embed a second administration app in the member PWA", () => {
    window.history.replaceState({}, "", "/admin");

    render(<App />);

    expect(screen.getByText("member-root")).toBeInTheDocument();
    const appSource = readFileSync(`${process.cwd()}/src/App.tsx`, "utf8");
    const mainSource = readFileSync(`${process.cwd()}/src/main.tsx`, "utf8");
    expect(appSource).not.toContain("AdminApp");
    expect(appSource).not.toContain("isAdminPath");
    expect(mainSource).not.toContain("admin/admin.css");
    expect(mainSource).not.toContain('startsWith("/admin")');
  });
});
