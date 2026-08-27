import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const css = readFileSync(new URL("../src/feature-page-adjustments.css", import.meta.url), "utf8");

function render(width) {
  const dom = new JSDOM(`<!doctype html>
    <style>${css}</style>
    <main class="notifications-screen-v2">
      <div class="notification-matrix-grid notification-status-grid">
        <div class="notification-grid-row notification-grid-lottery-row">
          <span class="notification-status-lottery-label">今彩539</span>
          <span class="notification-status-lottery-label">天天樂</span>
          <span class="notification-status-lottery-label">六合彩</span>
          <span class="notification-status-lottery-label">大樂透</span>
        </div>
        <div class="notification-grid-row notification-grid-status-row">
          <label class="notification-choice"><input type="checkbox"><span>啟動</span></label>
          <label class="notification-choice"><input type="checkbox"><span>啟動</span></label>
          <label class="notification-choice"><input type="checkbox"><span>啟動</span></label>
          <label class="notification-choice"><input type="checkbox"><span>啟動</span></label>
        </div>
      </div>
    </main>`, { pretendToBeVisual: true });
  Object.defineProperty(dom.window, "innerWidth", { configurable: true, value: width });
  return dom;
}

for (const width of [390, 375, 360]) {
  test(`Matrix 狀態展開區在 ${width}px 維持確認的標題與按鈕比例`, () => {
    const dom = render(width);
    const title = dom.window.document.querySelector(".notification-status-lottery-label");
    const button = dom.window.document.querySelector(".notification-grid-status-row .notification-choice");
    const grid = dom.window.document.querySelector(".notification-status-grid");
    const titleStyle = dom.window.getComputedStyle(title);
    const buttonStyle = dom.window.getComputedStyle(button);
    const gridStyle = dom.window.getComputedStyle(grid);

    assert.equal(titleStyle.height, "20px");
    assert.equal(titleStyle.minHeight, "20px");
    assert.equal(titleStyle.fontSize, "11px");
    assert.equal(titleStyle.fontWeight, "600");
    assert.equal(buttonStyle.marginInline, "8px");
    assert.equal(buttonStyle.height, "26px");
    assert.equal(gridStyle.gap, "4px");
  });
}

test("通知設定面板使用確認的展開收合動態與 reduced-motion 降級", () => {
  const dom = new JSDOM(`<!doctype html>
    <style>${css}</style>
    <main class="notifications-screen-v2">
      <div class="notification-inline-settings" data-expanded="false">
        <div class="notification-inline-settings-inner">設定內容</div>
      </div>
    </main>`, { pretendToBeVisual: true });
  const panel = dom.window.document.querySelector(".notification-inline-settings");

  assert.equal(dom.window.getComputedStyle(panel).gridTemplateRows, "0fr");
  panel.dataset.expanded = "true";
  assert.equal(dom.window.getComputedStyle(panel).gridTemplateRows, "1fr");
  assert.match(css, /grid-template-rows 220ms cubic-bezier\(\.2, \.8, \.2, 1\)/);
  assert.match(css, /opacity 140ms ease-out 40ms/);
  assert.match(css, /transform 220ms cubic-bezier\(\.2, \.8, \.2, 1\)/);
  assert.match(css, /notification-settings-toggle svg[\s\S]*transition: transform 160ms cubic-bezier\(\.2, \.8, \.2, 1\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*opacity 80ms linear/);
});
