import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

const css = readFileSync(new URL("../src/matrix-explore-spacing.css", import.meta.url), "utf8");

function exploreFixture() {
  const dom = new JSDOM(`
    <style>${css}</style>
    <main class="matrix-explore-main-screen">
      <div class="feature-body">
        <section class="panel explore-settings">
          <h2 class="section-title"><span></span>探索設定</h2>
          <div class="setting-grid"><label></label><label></label><label></label></div>
          <div class="advanced-panel"><label></label><label></label><label></label></div>
        </section>
        <button class="primary-action">開始探索</button>
        <section class="panel history-panel">
          <div class="history-panel-title"><h2 class="section-title"><span></span>近10期開獎號碼</h2></div>
        </section>
        <section class="panel repeat-stats-panel">
          <header class="repeat-stats-heading">
            <h2 class="section-title"><span></span>重複號碼統計</h2>
            <button>同碼</button>
            <span>點選進行版路篩選</span>
          </header>
          <div class="result-summary"><div><b>01</b><small>2次</small></div></div>
          <button class="consecutive-filter-button">連準篩選</button>
        </section>
        <p class="explore-result-disclaimer">探索結果依歷史資料與所選條件產生</p>
        <section class="panel result-panel">
          <header class="result-title">
            <h2 class="section-title"><span></span>探索結果區</h2>
            <span class="result-count">探索到 <span class="numeric-text">123</span> 組符合條件版路</span>
          </header>
        </section>
      </div>
    </main>
  `, { pretendToBeVisual: true });

  const { document } = dom.window;
  const style = (selector) => dom.window.getComputedStyle(document.querySelector(selector));
  return { style };
}

test("探索與進階設定的三列圖示使用 4px 垂直間距", () => {
  const { style } = exploreFixture();
  assert.equal(style(".setting-grid").rowGap, "4px");
  assert.equal(style(".advanced-panel").rowGap, "4px");
});

test("開始探索、近10期與重複統計維持指定的 12px 區塊間距", () => {
  const { style } = exploreFixture();
  assert.equal(style(".feature-body").rowGap, "0.375rem");
  assert.equal(style(".history-panel").marginTop, "6px");
  assert.equal(style(".repeat-stats-panel").marginTop, "6px");
});

test("近10期標題與探索設定標題使用相同字級", () => {
  const { style } = exploreFixture();
  assert.equal(style(".history-panel-title .section-title").fontSize, style(".explore-settings > .section-title").fontSize);
  assert.equal(style(".history-panel-title .section-title").fontSize, "14px");
});

test("重複統計卡片與控制項使用核准的緊湊比例", () => {
  const { style } = exploreFixture();
  const panel = style(".repeat-stats-panel");
  const sameCode = style(".repeat-stats-heading button");
  const filter = style(".consecutive-filter-button");

  assert.equal(panel.paddingLeft, "3px");
  assert.equal(panel.paddingRight, "3px");
  assert.equal(sameCode.height, "24px");
  assert.equal(filter.height, "24px");
  assert.equal(sameCode.fontSize, "11px");
  assert.equal(filter.fontSize, "11px");
  assert.equal(style(".repeat-stats-heading > span").fontSize, "12px");
  assert.equal(style(".repeat-stats-heading > span").fontWeight, "700");
  assert.equal(style(".result-summary b").fontWeight, "700");
});

test("結果標語與右上角組數維持單列清楚層級", () => {
  const { style } = exploreFixture();
  const disclaimer = style(".explore-result-disclaimer");
  const count = style(".result-count");
  const number = style(".result-count .numeric-text");

  assert.equal(disclaimer.fontSize, "11px");
  assert.equal(disclaimer.fontWeight, "700");
  assert.equal(disclaimer.whiteSpace, "nowrap");
  assert.equal(count.fontSize, "10px");
  assert.equal(number.fontSize, "12px");
  assert.equal(number.color, "rgb(53, 191, 240)");
});
