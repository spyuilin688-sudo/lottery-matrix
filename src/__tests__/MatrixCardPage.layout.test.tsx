// @vitest-environment jsdom

// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

const readCss = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");

function mountStyles() {
  const style = document.createElement("style");
  style.dataset.matrixCardLayout = "true";
  style.textContent = `${readCss("src/design-tokens.css")}\n${readCss("src/feature-pages.css")}`;
  document.head.append(style);
}

async function renderMatrixCardPage() {
  render(<MatrixCardPage onNavigate={vi.fn()} />);
  await screen.findByRole("img", { name: "今彩539落球牌單，第 115000001 期" });
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

    const ticketImage = screen.getByRole("img", { name: "今彩539落球牌單，第 115000001 期" });
    const imageStyles = getComputedStyle(ticketImage);

    expect(imageStyles.width).toBe("100%");
    expect(imageStyles.height).toBe("auto");
  });

  it("keeps the Matrix 牌單 body at 16px gutters and reduces both order controls to 34px", async () => {
    await renderMatrixCardPage();

    const body = document.querySelector(".feature-body");
    const drawOrder = screen.getByRole("tab", { name: "落球" });
    const sortedOrder = screen.getByRole("tab", { name: "順球" });

    expect(body).not.toBeNull();
    expect(getComputedStyle(document.documentElement).getPropertyValue("--layout-page-inline")).toBe("16px");
    expect(getComputedStyle(body!).paddingInline).toBe("var(--layout-page-inline)");
    expect(getComputedStyle(drawOrder).height).toBe("34px");
    expect(getComputedStyle(drawOrder).minHeight).toBe("34px");
    expect(getComputedStyle(sortedOrder).height).toBe("34px");
    expect(getComputedStyle(sortedOrder).minHeight).toBe("34px");
  });

  it("uses the Matrix 探索 action treatment at the requested 44px download height", async () => {
    await renderMatrixCardPage();

    const download = screen.getByRole("button", { name: "下載牌單" });

    expect(download).toHaveClass("primary-action", "branded-explore-action");
    expect(getComputedStyle(download).height).toBe("44px");
    expect(getComputedStyle(download).fontSize).toBe("20px");
  });
});
