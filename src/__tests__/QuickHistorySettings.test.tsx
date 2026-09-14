// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
// @ts-expect-error Vitest runs on Node; this project intentionally omits global Node types from app compilation.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { FeaturePageRouter } from "../FeaturePagesPatched";

const style = document.createElement("style");
beforeAll(() => {
  style.textContent = [
    readFileSync("src/design-tokens.css", "utf8"),
    readFileSync("src/feature-pages.css", "utf8"),
    readFileSync("src/responsive-feature-pages.css", "utf8"),
  ].join("\n");
  document.head.append(style);
});
afterAll(() => style.remove());

beforeEach(() => {
  document.body.innerHTML = "";
  window.sessionStorage.clear();
  globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ records: [] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as typeof fetch;
});

test("快捷歷史設定沿用同一張 sticky 標題卡，保留 68px 佔位與 8px 內容間距", () => {
  const mobilePage = document.createElement("div");
  mobilePage.className = "mobile-page";
  const root = document.createElement("div");
  mobilePage.append(root);
  document.body.append(mobilePage);

  render(
    <FeaturePageRouter
      screen="history"
      onNavigate={vi.fn()}
      onQuickOpen={vi.fn()}
      onQuickConfigure={vi.fn()}
      quickActive
    />,
    { container: root },
  );
  const header = mobilePage.querySelector<HTMLElement>(".feature-brand-header");
  const measureHeader = vi.spyOn(header!, "getBoundingClientRect").mockReturnValue({ bottom: 120 } as DOMRect);
  const initialPanel = screen.getByRole("region", { name: "歷史篩選設定" });
  const settingsCard = initialPanel.closest<HTMLElement>(".product-header__settings-card")!;
  expect(settingsCard.parentElement).toBe(header);

  fireEvent.click(screen.getByRole("button", { name: "開始探索" }));
  fireEvent.click(screen.getByRole("button", { name: "展開篩選設定" }));

  const floatingPanel = screen.getByRole("dialog", { name: "歷史篩選設定" });
  expect(floatingPanel).toBe(initialPanel);
  expect(floatingPanel.closest(".product-header__settings-card")).toBe(settingsCard);
  expect(settingsCard.getAttribute("data-floating")).toBe("true");
  expect(header!.getAttribute("data-settings-floating")).toBe("true");
  expect(getComputedStyle(header!).position).toBe("sticky");
  expect(getComputedStyle(header!).height).toBe("68px");
  expect(getComputedStyle(header!).marginBottom).toBe("var(--layout-section-gap)");
  expect(getComputedStyle(document.documentElement).getPropertyValue("--layout-section-gap")).toBe("8px");
  expect(getComputedStyle(settingsCard).position).toBe("absolute");
  expect(getComputedStyle(settingsCard).top).toBe("0px");
  expect(getComputedStyle(settingsCard).insetInline).toBe("var(--layout-page-inline)");
  expect(getComputedStyle(document.documentElement).getPropertyValue("--layout-page-inline")).toBe("16px");
  expect(measureHeader).not.toHaveBeenCalled();
});
