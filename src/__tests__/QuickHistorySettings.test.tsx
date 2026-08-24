// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { FeaturePageRouter } from "../FeaturePagesPatched";

beforeEach(() => {
  document.body.innerHTML = "";
  window.sessionStorage.clear();
  globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ records: [] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as typeof fetch;
});

test("快捷開啟歷史頁後，浮動設定區與標題卡保持 8px 間距", () => {
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
  vi.spyOn(header!, "getBoundingClientRect").mockReturnValue({ bottom: 120 } as DOMRect);

  fireEvent.click(screen.getByRole("button", { name: "開始探索" }));
  fireEvent.click(screen.getByRole("button", { name: "展開篩選設定" }));

  expect(screen.getByRole("dialog", { name: "歷史篩選設定" }).style.top).toBe("128px");
});
