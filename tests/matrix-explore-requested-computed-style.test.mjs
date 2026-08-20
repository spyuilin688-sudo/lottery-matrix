import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

const featureCss = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const exploreCss = readFileSync(new URL("../src/matrix-explore-spacing.css", import.meta.url), "utf8");
const css = `${featureCss}\n${exploreCss}`;

function exploreFixture() {
  const dom = new JSDOM(`
    <style>${css}</style>
    <main class="matrix-explore-main-screen">
      <div class="feature-body">
        <section class="panel explore-settings">
          <h2 class="section-title"><span></span>探索設定</h2>
          <div class="setting-grid">
            <label><span><img class="setting-label-icon matrix-explore-setting-icon">彩球類型</span><div class="select-box native-select"><select><option>今彩539</option></select></div></label>
            <label><span><img class="setting-label-icon matrix-explore-setting-icon">探索期數</span><div class="segmented three"><button>二期</button><button>七期</button><button>十三期</button></div></label>
            <label><span><img class="setting-label-icon matrix-explore-setting-icon">版路類型</span><div class="segmented three"><button>加減版路</button><button>合值版路</button><button>拖牌版路</button></div></label>
          </div>
        </section>
        <section class="panel hit-advanced-panel">
          <h2 class="section-title"><span></span>命中條件</h2>
          <div class="hit-options"><button>準4+</button><button>準5+</button></div>
          <button class="advanced-row"><span>進階探索設定</span></button>
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
          <div class="road-results-head"><span>位置</span><span>號碼</span><span>預測期</span><span>連準次數</span><span>預測</span><span>版路類型</span></div>
          <div class="road-result-row"><button class="road-type-toggle"><span>加減版路</span><svg></svg></button></div>
          <section class="road-validation-process">
            <header class="validation-summary-card">
              <span>開 <i class="validation-summary-primary">25</i> 第 <i class="validation-summary-position">4</i> 顆｜上 <i class="validation-summary-lookback">2</i> 期｜第 <i class="validation-summary-position">3</i> 顆｜<i class="validation-summary-formula">+14.24</i>｜下 <i class="validation-summary-future">2</i> 期開</span>
              <em>準4進5</em>
            </header>
            <span class="validation-issue">026090</span>
          </section>
        </section>
      </div>
    </main>
  `, { pretendToBeVisual: true });

  const { document } = dom.window;
  const style = (selector) => dom.window.getComputedStyle(document.querySelector(selector));
  return { style };
}

test("探索與進階設定的三列圖示使用 5px 垂直間距", () => {
  const { style } = exploreFixture();
  assert.equal(style(".setting-grid").rowGap, "5px");
  assert.equal(style(".advanced-panel").rowGap, "5px");
});

test("探索設定左側標籤依內容延伸避免壓到右側選項", () => {
  const { style } = exploreFixture();
  const label = style(".setting-grid label > span");

  assert.equal(label.width, "auto");
  assert.equal(label.minWidth, "92px");
  assert.equal(label.flexGrow, "0");
  assert.equal(label.flexShrink, "0");
  assert.equal(label.flexBasis, "auto");
});

test("開始探索、近10期與重複號碼統計的相鄰間距皆為 12px", () => {
  const { style } = exploreFixture();
  assert.equal(style(".feature-body").rowGap, "8px");
  assert.equal(style(".history-panel").marginTop, "4px");
  assert.equal(style(".repeat-stats-panel").marginTop, "4px");
});

test("探索區標題為 14px，近10期標題為 12px", () => {
  const { style } = exploreFixture();
  assert.equal(style(".explore-settings > .section-title").fontSize, "14px");
  assert.equal(style(".hit-advanced-panel > .section-title").fontSize, "14px");
  assert.equal(style(".advanced-row").fontSize, "14px");
  assert.equal(style(".repeat-stats-heading .section-title").fontSize, "14px");
  assert.equal(style(".result-title .section-title").fontSize, "14px");
  assert.equal(style(".history-panel-title .section-title").fontSize, "12px");
});

test("指定卡片使用 #755329 外框、6px 上內距及核准的水平內距", () => {
  const { style } = exploreFixture();
  for (const selector of [".explore-settings", ".hit-advanced-panel", ".repeat-stats-panel", ".result-panel", ".history-panel"]) {
    assert.equal(style(selector).borderTopColor, "rgb(117, 83, 41)");
  }
  assert.equal(style(".explore-settings").paddingTop, "6px");
  assert.equal(style(".hit-advanced-panel").paddingTop, "6px");
  assert.equal(style(".hit-advanced-panel").paddingBottom, "4px");
  assert.equal(style(".repeat-stats-panel").paddingTop, "6px");
  assert.equal(style(".repeat-stats-panel").paddingBottom, "6px");
  assert.equal(style(".result-panel").paddingTop, "6px");
  assert.equal(style(".repeat-stats-panel").paddingLeft, "6px");
  assert.equal(style(".repeat-stats-panel").paddingRight, "6px");
  assert.equal(style(".result-panel").paddingLeft, "6px");
  assert.equal(style(".result-panel").paddingRight, "6px");
});

test("命中條件分隔線下移 4px 並與進階探索設定相距 4px", () => {
  const { style } = exploreFixture();
  assert.equal(style(".hit-options button").height, "28px");
  assert.equal(style(".hit-options button").minHeight, "28px");
  assert.equal(style(".hit-options").paddingBottom, "4px");
  assert.equal(style(".hit-options").marginBottom, "4px");
});

test("重複統計卡片與控制項使用指定比例", () => {
  const { style } = exploreFixture();
  const sameCode = style(".repeat-stats-heading button");
  const filter = style(".consecutive-filter-button");

  assert.equal(sameCode.height, "24px");
  assert.equal(filter.height, "24px");
  assert.equal(sameCode.fontSize, "11px");
  assert.equal(filter.fontSize, "11px");
  assert.equal(style(".repeat-stats-heading > span").fontSize, "12px");
  assert.equal(style(".repeat-stats-heading > span").fontWeight, "700");
  assert.equal(style(".repeat-stats-heading > span").paddingRight, "8px");
  assert.equal(style(".repeat-stats-heading > span").color, "rgb(158, 154, 147)");
  assert.equal(style(".result-summary b").fontSize, "14px");
  assert.doesNotMatch(style(".result-summary b").fontFamily, /monospace/i);
  assert.equal(style(".result-summary b").fontWeight, "800");
});

test("結果標語與右上角組數維持單列清楚層級", () => {
  const { style } = exploreFixture();
  const disclaimer = style(".explore-result-disclaimer");
  const count = style(".result-count");
  const number = style(".result-count .numeric-text");

  assert.match(exploreCss, /\.matrix-explore-main-screen \.explore-result-disclaimer\s*\{[^}]*font-size:\s*clamp\(7px, 2vw, 8px\);/s);
  assert.equal(disclaimer.fontWeight, "700");
  assert.equal(disclaimer.whiteSpace, "nowrap");
  assert.equal(count.fontSize, "10px");
  assert.equal(count.paddingRight, "8px");
  assert.equal(number.fontSize, "12px");
  assert.equal(number.color, "rgb(53, 191, 240)");
});

test("六個結果標題與版路結果之間使用與外框相同的分隔線", () => {
  const { style } = exploreFixture();
  const head = style(".road-results-head");
  assert.equal(head.borderBottomWidth, "1px");
  assert.equal(head.borderBottomColor, "rgb(117, 83, 41)");
});

test("展開驗證內容使用 4px 左右內距，左側期數為預設字型 12px 字重 800", () => {
  assert.match(exploreCss, /--road-validation-inline-padding:\s*4px;/);
  assert.match(exploreCss, /--validation-issue-font-family:\s*inherit;/);
  assert.match(exploreCss, /--validation-issue-font-size:\s*12px;/);
  assert.match(exploreCss, /--validation-issue-font-weight:\s*800;/);
  assert.match(featureCss, /\.road-validation-process\s*\{[^}]*padding:\s*10px var\(--road-validation-inline-padding, 12px\);/s);
  assert.match(featureCss, /\.validation-issue\s*\{[^}]*font-family:\s*var\(--validation-issue-font-family, inherit\);[^}]*font-size:\s*var\(--validation-issue-font-size, 14px\);[^}]*font-weight:\s*var\(--validation-issue-font-weight, 400\);/s);
});

test("版路按鈕與概要卡使用指定右距、內距、標籤位置及數字配色", () => {
  const { style } = exploreFixture();
  const toggle = style(".road-type-toggle");
  const card = style(".validation-summary-card");
  const label = style(".validation-summary-card em");

  assert.equal(toggle.paddingRight, "3px");
  assert.equal(toggle.justifyContent, "flex-end");
  assert.equal(card.paddingTop, "4px");
  assert.equal(card.paddingRight, "4px");
  assert.equal(card.paddingBottom, "4px");
  assert.equal(card.paddingLeft, "4px");
  assert.equal(style(".validation-summary-card > span").fontSize, "10px");
  assert.equal(label.top, "0px");
  assert.equal(label.right, "4px");
  assert.equal(label.transform, "translateY(-50%)");
  assert.equal(label.borderTopWidth, "1px");
  assert.equal(style(".validation-summary-primary").color, "rgb(239, 83, 80)");
  assert.equal(style(".validation-summary-position").color, "rgb(53, 191, 240)");
  assert.equal(style(".validation-summary-lookback").color, "rgb(167, 139, 250)");
  assert.equal(style(".validation-summary-future").color, "rgb(126, 226, 168)");
  assert.equal(style(".validation-summary-formula").color, "rgb(246, 201, 95)");
  assert.equal(style(".validation-summary-card > span i").fontWeight, "800");
  assert.match(featureCss, /\.validation-summary-card > span i\s*\{[^}]*font-weight:\s*inherit;/s);
  assert.match(featureCss, /\.matrix-explore-main-screen \.validation-summary-card > span i\s*\{[^}]*font-weight:\s*800;/s);
});
