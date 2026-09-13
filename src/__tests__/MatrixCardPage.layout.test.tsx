// @vitest-environment jsdom

// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

declare const process: { cwd(): string };

const matrixCards = vi.hoisted(() => ({
  fetchMatrixCardManifest: vi.fn(),
  matrixCardUrl: vi.fn((path: string) => `https://matrix.example.test${path}`),
}));

vi.mock("../lottery-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lottery-api")>()),
  fetchMatrixCardManifest: matrixCards.fetchMatrixCardManifest,
  matrixCardUrl: matrixCards.matrixCardUrl,
}));

import { MatrixCardPage } from "../FeaturePages";
import { AppDialogProvider } from "../dialog/AppDialog";
import { FeatureShell } from "../features/shared";

const readCss = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");

function mountStyles(paths = ["src/design-tokens.css", "src/feature-pages.css"]) {
  const style = document.createElement("style");
  style.dataset.matrixCardLayout = "true";
  style.textContent = paths.map(readCss).join("\n");
  document.head.append(style);
}

async function renderMatrixCardPage() {
  render(<AppDialogProvider><MatrixCardPage onNavigate={vi.fn()} /></AppDialogProvider>);
  await screen.findByRole("img", { name: "今彩539順球牌單，第 115000001 期" });
}

// Inspect matching declarations as well as computed values: an obsolete rule
// can be hidden by the cascade while every final dimension still looks right.
function declarationOwners(element: Element, properties: string[], pseudo?: "::after") {
  return [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules])
    .filter((rule): rule is CSSStyleRule => "selectorText" in rule)
    .filter((rule) => {
      if (pseudo && !rule.selectorText.includes(pseudo)) return false;
      const selector = pseudo ? rule.selectorText.replaceAll(pseudo, "") : rule.selectorText;
      return element.matches(selector) && properties.some((property) => rule.style.getPropertyValue(property));
    })
    .map((rule) => rule.selectorText);
}

beforeEach(() => {
  mountStyles();
  matrixCards.fetchMatrixCardManifest.mockReset().mockResolvedValue({
    lottery: "今彩539",
    period: "115000001",
    cards: {
      draw: { url: "/api/matrix/cards/今彩539/draw.svg" },
      sorted: { url: "/api/matrix/cards/今彩539/sorted.svg" },
    },
  });
  matrixCards.matrixCardUrl.mockReset().mockImplementation((path: string) => `https://matrix.example.test${path}`);
});

afterEach(() => {
  cleanup();
  document.head.querySelectorAll("style[data-matrix-card-layout]").forEach((style) => style.remove());
  vi.restoreAllMocks();
});

describe("Matrix 牌單 layout", () => {
  it("renders the full portrait ticket instead of the generic ticket thumbnail", async () => {
    await renderMatrixCardPage();

    const ticketImage = screen.getByRole("img", { name: "今彩539順球牌單，第 115000001 期" });
    const imageStyles = getComputedStyle(ticketImage);

    expect(imageStyles.width).toBe("100%");
    expect(imageStyles.height).toBe("auto");
  });

  it("uses 14px order-row gutters while retaining the 16px shared page inset and 34px controls", async () => {
    await renderMatrixCardPage();

    const body = document.querySelector(".feature-body");
    const drawOrder = screen.getByRole("tab", { name: "落球" });
    const sortedOrder = screen.getByRole("tab", { name: "順球" });
    const orderTabs = document.querySelector<HTMLElement>(".matrix-card-order");

    expect(body).not.toBeNull();
    expect(orderTabs).not.toBeNull();
    expect(within(orderTabs!).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["順球", "落球"]);
    expect(sortedOrder).toHaveAttribute("aria-selected", "true");
    expect(drawOrder).toHaveAttribute("aria-selected", "false");
    expect(getComputedStyle(document.documentElement).getPropertyValue("--layout-page-inline")).toBe("16px");
    expect(getComputedStyle(body!).paddingInline).toBe("14px");
    expect(getComputedStyle(orderTabs!).marginLeft).toBe("0px");
    expect(getComputedStyle(orderTabs!).marginRight).toBe("0px");
    expect(getComputedStyle(drawOrder).height).toBe("34px");
    expect(getComputedStyle(drawOrder).minHeight).toBe("34px");
    expect(getComputedStyle(sortedOrder).height).toBe("34px");
    expect(getComputedStyle(sortedOrder).minHeight).toBe("34px");

    const sibling = render(<FeatureShell title="Matrix 指南" onNavigate={vi.fn()}><p>指南內容</p></FeatureShell>);
    expect(getComputedStyle(sibling.container.querySelector(".feature-body")!).paddingInline).toBe("var(--layout-page-inline)");
  });

  it("uses the Matrix 探索 action treatment at the requested 44px download height", async () => {
    await renderMatrixCardPage();

    const download = screen.getByRole("button", { name: "下載牌單" });

    expect(download).toHaveClass("primary-action", "branded-explore-action");
    expect(getComputedStyle(download).height).toBe("44px");
    expect(getComputedStyle(download).fontSize).toBe("20px");
  });

  it("has one owner for each cleaned layout property, including the app shell and decoration", async () => {
    // Include the runtime shell for cross-file ownership checks. Real-browser
    // verification covers font shorthands that jsdom does not fully cascade.
    mountStyles(["src/styles.css", "src/prototype.css"]);
    await renderMatrixCardPage();

    const main = document.querySelector("main")!;
    const body = main.querySelector(".feature-body")!;
    const download = screen.getByRole("button", { name: "下載牌單" });
    const app = document.createElement("div");
    app.className = "app-screen";

    expect.soft(declarationOwners(main, ["min-height"])).toHaveLength(1);
    expect.soft(declarationOwners(main, ["padding", "padding-bottom", "padding-block", "padding-block-end"])).toHaveLength(1);
    expect.soft(declarationOwners(body, ["padding", "padding-bottom", "padding-block", "padding-block-end"])).toHaveLength(1);
    expect.soft(declarationOwners(download, ["height", "block-size"])).toHaveLength(1);
    expect.soft(declarationOwners(download, ["inset", "top", "right", "bottom", "left"], "::after")).toHaveLength(1);
    expect.soft(declarationOwners(app, ["background", "background-color"])).toHaveLength(1);
  });

  it("preserves shared shell spacing and the other action sizes", () => {
    const sibling = render(
      <FeatureShell title="計算機" className="calculator-screen" onNavigate={vi.fn()}>
        <button type="button" className="primary-action" onClick={vi.fn()}>共用操作</button>
        <button type="button" className="gold-button" onClick={vi.fn()}>金色操作</button>
      </FeatureShell>,
    );

    expect(getComputedStyle(sibling.container.querySelector("main")!).minHeight).toBe("100%");
    expect(getComputedStyle(sibling.container.querySelector(".feature-body")!).paddingBottom)
      .toBe("calc(var(--layout-bottom-nav-clearance) + 8px)");
    expect(getComputedStyle(screen.getByRole("button", { name: "共用操作" })).height).toBe("48px");
    expect(getComputedStyle(screen.getByRole("button", { name: "金色操作" })).height).toBe("42px");
  });
});
