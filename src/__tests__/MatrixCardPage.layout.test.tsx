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

function mountStyles() {
  const style = document.createElement("style");
  style.dataset.matrixCardLayout = "true";
  style.textContent = `${readCss("src/design-tokens.css")}\n${readCss("src/feature-pages.css")}`;
  document.head.append(style);
}

async function renderMatrixCardPage() {
  render(<AppDialogProvider><MatrixCardPage onNavigate={vi.fn()} /></AppDialogProvider>);
  await screen.findByRole("img", { name: "今彩539順球牌單，第 115000001 期" });
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
});
