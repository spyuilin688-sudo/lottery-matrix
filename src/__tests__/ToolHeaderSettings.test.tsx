// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { FeaturePageRouter } from "../FeaturePagesCore";
import { AppDialogProvider } from "../dialog/AppDialog";

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ records: [] }), {
    status: 200, headers: { "content-type": "application/json" },
  })));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test.each([
  ["history", "收合篩選設定", "展開篩選設定"],
  ["reference", "收合探索設定", "展開探索設定"],
  ["tongxing", "收合同星探索設定", "展開同星探索設定"],
] as const)("%s keeps one labelled settings region inside its title and preserves drafts when reopened", (page, closeLabel, openLabel) => {
  const { container } = render(<AppDialogProvider><FeaturePageRouter screen={page} onNavigate={vi.fn()} /></AppDialogProvider>);
  const header = container.querySelector("header")!;
  const toggle = within(header).getByRole("button", { name: closeLabel });
  const panelId = toggle.getAttribute("aria-controls");
  expect(panelId).toBeTruthy();
  const panel = document.getElementById(panelId!)!;
  expect(header.contains(panel)).toBe(true);
  const order = within(panel).getByRole("combobox", { name: "號碼順序" });
  fireEvent.change(order, { target: { value: "依實際開獎順序排序" } });

  fireEvent.click(toggle);
  expect(screen.queryByRole("combobox", { name: "號碼順序" })).toBeNull();
  fireEvent.click(within(header).getByRole("button", { name: openLabel }));
  expect(document.getElementById(panelId!)).toBe(panel);
  expect(within(panel).getByRole("combobox", { name: "號碼順序" })).toBe(order);
  expect((order as HTMLSelectElement).value).toBe("依實際開獎順序排序");
  expect(header.contains(panel)).toBe(true);
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();

  fireEvent.keyDown(order, { key: "Escape" });
  expect(screen.queryByRole("combobox", { name: "號碼順序" })).toBeNull();
  expect(document.activeElement).toBe(toggle);
});
