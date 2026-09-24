import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const css = readFileSync(new URL("../src/feature-page-adjustments.css", import.meta.url), "utf8");
const responsiveCss = readFileSync(new URL("../src/responsive-feature-pages.css", import.meta.url), "utf8");

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

  assert.equal(dom.window.getComputedStyle(panel).padding, "0px");
  assert.equal(dom.window.getComputedStyle(panel).borderTopWidth, "0px");
  assert.equal(dom.window.getComputedStyle(panel).gridTemplateRows, "minmax(0, 0fr)");
  panel.dataset.expanded = "true";
  assert.equal(dom.window.getComputedStyle(panel).gridTemplateRows, "minmax(0, 1fr)");
  assert.match(css, /grid-template-rows 220ms cubic-bezier\(\.2, \.8, \.2, 1\)/);
  assert.match(css, /opacity 140ms ease-out 40ms/);
  assert.match(css, /transform 220ms cubic-bezier\(\.2, \.8, \.2, 1\)/);
  assert.match(css, /notification-settings-toggle svg[\s\S]*transition: transform 160ms cubic-bezier\(\.2, \.8, \.2, 1\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*opacity 80ms linear/);
});

test("所有通知設定內容使用一致的緊湊寬度與置中排列", () => {
  const dom = new JSDOM(`<!doctype html>
    <style>${css}</style>
    <main class="notifications-screen-v2">
      <div class="notification-grid-row notification-grid-lottery-row notification-grid-lottery-labels">
        <span>今彩539</span><span>天天樂</span><span>六合彩</span><span>大樂透</span>
      </div>
      <div class="notification-grid-row notification-grid-time-row">
        <div class="notification-time-select"><select><option>選擇時間</option></select></div>
      </div>
      <div class="notification-inline-option-row" data-setting-key="system">
        <label class="notification-choice"><input type="checkbox"><span>維護</span></label>
        <label class="notification-choice"><input type="checkbox"><span>更新</span></label>
      </div>
    </main>`, { pretendToBeVisual: true });
  const lotteryTitle = dom.window.document.querySelector(".notification-grid-lottery-labels > span");
  const timeSelect = dom.window.document.querySelector(".notification-time-select");
  const optionRow = dom.window.document.querySelector(".notification-inline-option-row");
  const choice = dom.window.document.querySelector(".notification-choice");
  const input = dom.window.document.querySelector(".notification-choice input");

  assert.equal(dom.window.getComputedStyle(lotteryTitle).height, "20px");
  assert.equal(dom.window.getComputedStyle(lotteryTitle).fontSize, "11px");
  assert.equal(dom.window.getComputedStyle(timeSelect).marginInline, "8px");
  assert.equal(dom.window.getComputedStyle(timeSelect).width, "auto");
  assert.match(css, /notification-time-select\s*\{[^}]*width:\s*auto/);
  assert.equal(dom.window.getComputedStyle(optionRow).display, "flex");
  assert.equal(dom.window.getComputedStyle(optionRow).justifyContent, "center");
  assert.equal(dom.window.getComputedStyle(optionRow).gap, "4px");
  assert.equal(dom.window.getComputedStyle(choice).height, "auto");
  assert.equal(dom.window.getComputedStyle(choice).minHeight, "26px");
  assert.equal(dom.window.getComputedStyle(choice).paddingTop, "6px");
  assert.equal(dom.window.getComputedStyle(choice).paddingRight, "8px");
  assert.equal(dom.window.getComputedStyle(choice).gap, "4px");
  assert.equal(dom.window.getComputedStyle(choice).marginInline, "0px");
  assert.equal(dom.window.getComputedStyle(choice).fontSize, "11px");
  assert.match(css, /notification-inline-option-row \.notification-choice\s*\{[^}]*width:\s*calc\(\(100% - 12px\) \/ 4\)/);
  assert.equal(dom.window.getComputedStyle(input).width, "12px");
  assert.equal(dom.window.getComputedStyle(input).height, "12px");
});

test("390px 系統通知拒絕狀態使用實際狀態樣式並保留完整文案", () => {
  const dom = new JSDOM(`<!doctype html>
    <style>${responsiveCss}\n${css}</style>
    <main class="notifications-screen notifications-screen-v2">
      <div class="notification-title">
        <h2><span>系統通知</span></h2>
        <p class="notification-push-status" role="status" aria-live="polite" aria-atomic="true">
          <span>手機通知未開啟</span><span class="notification-push-status-detail">通知權限已拒絕</span>
        </p>
      </div>
    </main>`, { pretendToBeVisual: true });
  Object.defineProperty(dom.window, "innerWidth", { configurable: true, value: 390 });
  const status = dom.window.document.querySelector(".notification-push-status");
  const detail = dom.window.document.querySelector(".notification-push-status-detail");
  const title = dom.window.document.querySelector(".notification-title");

  assert.equal(status.textContent.trim(), "手機通知未開啟通知權限已拒絕");
  assert.equal(status.getAttribute("role"), "status");
  assert.equal(dom.window.getComputedStyle(title).flexDirection, "column");
  assert.equal(dom.window.getComputedStyle(status).minWidth, "0px");
  assert.equal(dom.window.getComputedStyle(status).flexWrap, "wrap");
  assert.equal(dom.window.getComputedStyle(status).overflowWrap, "anywhere");
  assert.equal(dom.window.getComputedStyle(detail).color, "var(--lottery-label)");
});
