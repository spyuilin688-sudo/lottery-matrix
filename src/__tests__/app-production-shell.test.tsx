// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

declare const process: { cwd(): string };

const bridge = vi.hoisted(() => ({ render: vi.fn(() => null) }));

vi.mock("../admin/AdminApp", () => ({ default: () => <div>admin-root</div> }));
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
      .toBe("rgb(216, 195, 141)");
    expect(getComputedStyle(document.querySelector(".road-results article")!).color)
      .toBe("rgb(170, 181, 196)");
    const positionTag = document.querySelector(".road-results .tag");
    expect(getComputedStyle(positionTag!).color).toBe("rgb(216, 195, 141)");
    expect(getComputedStyle(positionTag!).borderTopWidth).toBe("1px");

    previewStyle.remove();
  });

  it("brightens only the expanded validation palette through the production stylesheet order", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    const productionStyle = mountPreviewProductionStyles();

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-04" }));
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-09" }));

    const main = screen.getByRole("main", { name: "探索結果區" });
    const panel = document.querySelector(".result-panel");
    const validation = document.querySelector(".explore-validation-card");
    const summaryTag = document.querySelector(".explore-validation-consecutive-tag");
    const summary = document.querySelector(".explore-validation-summary");
    const issues = document.querySelector(".explore-validation-issues");
    const issueRow = document.querySelector(".explore-validation-issue");
    const numbers = document.querySelector(".explore-validation-numbers-card");
    const neutralNumber = document.querySelector(".explore-validation-numbers b");
    const formulas = document.querySelector(".explore-validation-formulas");
    const prediction = document.querySelector(".explore-validation-prediction");
    const secondFormula = document.querySelector(".explore-validation-formula-row:nth-child(2)");
    const source = document.querySelector(".explore-validation-number--source");
    const step = document.querySelector(".explore-validation-number--step");
    const hit = document.querySelector(".explore-validation-number--hit");
    const special = document.querySelector(".explore-validation-numbers em");
    const primaryFormula = document.querySelector(".explore-validation-formula-row:first-child");
    const secondaryFormula = document.querySelector(".explore-validation-formula-row:last-child");
    const predictionTitle = document.querySelector(".explore-validation-prediction strong");

    expect(getComputedStyle(main).backgroundColor).toBe("rgb(7, 11, 18)");
    expect(getComputedStyle(main).color).toBe("rgb(242, 245, 248)");
    expect(getComputedStyle(panel!).backgroundColor).toBe("rgb(13, 21, 32)");
    expect(getComputedStyle(panel!).borderTopColor).toBe("rgb(52, 74, 102)");
    expect(getComputedStyle(validation!).borderTopWidth).toBe("0px");
    expect(getComputedStyle(validation!).backgroundColor).toBe("rgb(17, 31, 50)");
    expect(getComputedStyle(validation!).boxShadow).toBe("inset 0 1px 0 rgba(228, 201, 128, 0.12)");
    expect(getComputedStyle(summaryTag!).backgroundColor).toBe("rgb(26, 48, 75)");
    expect(getComputedStyle(summaryTag!).color).toBe("rgb(228, 201, 128)");
    expect(getComputedStyle(summary!).backgroundColor).toBe("rgb(26, 48, 75)");
    expect(getComputedStyle(issues!).backgroundColor).toBe("rgb(22, 40, 62)");
    expect(getComputedStyle(issueRow!).color).toBe("rgb(186, 197, 210)");
    expect(getComputedStyle(numbers!).backgroundColor).toBe("rgb(22, 40, 62)");
    expect(getComputedStyle(neutralNumber!).color).toBe("rgb(186, 197, 210)");
    expect(getComputedStyle(formulas!).backgroundColor).toBe("rgb(18, 36, 58)");
    expect(getComputedStyle(secondFormula!).backgroundColor).toBe("rgb(18, 36, 58)");
    expect(getComputedStyle(prediction!).backgroundColor).toBe("rgb(21, 65, 95)");
    expect(getComputedStyle(issues!).borderTopColor).toBe("rgb(66, 97, 126)");
    expect(getComputedStyle(secondFormula!).borderTopColor).toBe("rgb(47, 73, 99)");
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
    expect(getComputedStyle(special!).borderTopColor).toBe("rgb(180, 155, 229)");
    expect(getComputedStyle(special!).backgroundColor).toBe("rgba(180, 155, 229, 0.14)");

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

  it("allows more than one preview result to stay expanded", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-04" }));
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-09" }));

    expect(screen.getByRole("region", { name: "04 驗證過程" })).toBeInTheDocument();
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

  it("keeps the scoped tag selector and responsive three-column dimensions", () => {
    const css = readFileSync(`${process.cwd()}/src/explore-result-preview.css`, "utf8");

    expect(css).toMatch(/\.explore-validation-summary-card\s*>\s*\.explore-validation-consecutive-tag\s*\{/);
    expect(css).toMatch(/font-size:\s*8px/);
    expect(css).toMatch(/grid-template-columns:\s*clamp\(44px,\s*12\.31vw,\s*48px\)\s+minmax\(0,\s*1fr\)\s+clamp\(110px,\s*32\.82vw,\s*128px\)/);
    expect(css).toMatch(/column-gap:\s*2px/);
    expect(css).toMatch(/row-gap:\s*3px/);
    expect(css).not.toContain("!important");
  });

  it("keeps issue and formula typography aligned with the approved mobile layout", () => {
    const css = readFileSync(`${process.cwd()}/src/explore-result-preview.css`, "utf8");

    expect(css).toMatch(/\.explore-validation-issue\s*\{[^}]*padding:\s*3px 4px[^}]*font-size:\s*8px[^}]*font-weight:\s*700/s);
    expect(css).toMatch(/\.explore-validation-formula-row\s*\{[^}]*padding:\s*3px 6px/s);
    expect(css).toMatch(/\.explore-validation-summary\s*\{[^}]*padding:\s*4px 8px/s);
  });

  it("keeps the expanded wrapper borderless, clarifies existing card outlines, and restores row separators", () => {
    const css = readFileSync(`${process.cwd()}/src/explore-result-preview.css`, "utf8");

    expect(css).toMatch(/\.explore-validation-card\s*\{[^}]*border:\s*0/s);
    expect(css).toMatch(/\.explore-validation-issues,\s*\.explore-validation-numbers-card,\s*\.explore-validation-formulas\s*\{[^}]*border:\s*1px solid #42617e/s);
    expect(css).toMatch(/\.explore-validation-number-row:nth-child\(n \+ 2\),\s*\.explore-validation-issue:nth-child\(n \+ 2\),\s*\.explore-validation-formula-row:nth-child\(n \+ 2\)\s*\{[^}]*border-top:\s*1px solid #2f4963/s);
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

  it("keeps unexpanded result rows auto-sized with eight-pixel vertical padding after shared styles load", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    const productionStyle = mountPreviewProductionStyles();

    render(<App />);

    const resultRow = document.querySelector(".explore-result-row");
    expect(resultRow).not.toBeNull();
    expect(getComputedStyle(resultRow!).minHeight).toBe("0px");
    expect(getComputedStyle(resultRow!).paddingTop).toBe("8px");
    expect(getComputedStyle(resultRow!).paddingBottom).toBe("8px");

    productionStyle.remove();
  });

  it("renders the expanded summary consecutive tag with an opaque card background", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    const productionStyle = mountPreviewProductionStyles();

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-04" }));

    const summaryTag = document.querySelector(".explore-validation-consecutive-tag");
    expect(summaryTag).not.toBeNull();
    expect(getComputedStyle(summaryTag!).backgroundColor).toBe("rgb(26, 48, 75)");

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
      ".explore-validation-draw-row",
      ".explore-validation-formula-row",
    ]) {
      const row = document.querySelector(selector);
      expect(row).not.toBeNull();
      expect(getComputedStyle(row!).height).toBe("auto");
      expect(getComputedStyle(row!).minHeight).toBe("var(--explore-validation-row-min-height)");
      expect(getComputedStyle(row!).paddingTop).toBe("3px");
      expect(getComputedStyle(row!).paddingBottom).toBe("3px");
    }

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

  it("uses one three-pixel gap between every validation group", () => {
    window.history.replaceState({}, "", "/explore-result-preview");
    const productionStyle = mountPreviewProductionStyles();

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "展開版路 result-04" }));

    const groups = document.querySelector(".explore-validation-groups");
    const incompleteGroup = document.querySelector('.explore-validation-group[data-complete="false"]');
    expect(getComputedStyle(groups!).rowGap).toBe("3px");
    expect(getComputedStyle(incompleteGroup!).marginTop).toBe("0px");

    productionStyle.remove();
  });

  it("uses the approved inline filter and expanded validation spacing", () => {
    const css = readFileSync(`${process.cwd()}/src/explore-result-preview.css`, "utf8");

    expect(css).toMatch(/\.explore-consecutive-filter-button\s*\{[^}]*width:\s*max-content[^}]*height:\s*21\.2px[^}]*font-size:\s*11px/s);
    expect(css).toMatch(/\.explore-consecutive-filter-button::before\s*\{[^}]*width:\s*max\(100%,\s*44px\)[^}]*height:\s*44px/s);
    expect(css).toMatch(/\.explore-consecutive-filter-options\s*\{[^}]*margin:\s*6px 0[^}]*padding:\s*4px 0[^}]*border-top:[^;]+;[^}]*border-bottom:/s);
    expect(css).toMatch(/\.explore-validation-card\s*\{[^}]*margin:\s*6px 0 0/s);
    expect(css).toMatch(/--explore-validation-summary-font-size:\s*clamp\(11px,\s*3\.08vw,\s*12px\)/);
  });

  it("keeps validation number states square and gives the prediction its unique blue surface", () => {
    const css = readFileSync(`${process.cwd()}/src/explore-result-preview.css`, "utf8");

    expect(css).toMatch(/\.explore-validation-number\s*\{[^}]*width:\s*clamp\(17px,\s*4\.87vw,\s*19px\)[^}]*height:\s*clamp\(17px,\s*4\.87vw,\s*19px\)[^}]*aspect-ratio:\s*1/s);
    expect(css).toMatch(/\.explore-validation-prediction\s*\{[^}]*padding:\s*4px 8px[^}]*border:\s*1px solid #344a66[^}]*border-radius:\s*8px[^}]*background:\s*#15415f/s);
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

  it("keeps issue numbers at 8px and 700 when the shared reference rule loads later", () => {
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
    expect(getComputedStyle(issue!).fontSize).toBe("8px");
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
});
