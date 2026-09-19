import { ruleBodies } from "./helpers/css-rules.mjs";
import { readLocalCss } from "./helpers/read-local-css.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

const featureCss = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const exploreCss = readLocalCss(new URL("../src/matrix-explore-spacing.css", import.meta.url));
const previewCss = readFileSync(new URL("../src/explore-result-preview.css", import.meta.url), "utf8");
const tokens = readFileSync(new URL("../src/design-tokens.css", import.meta.url), "utf8");
const exploreSource = readFileSync(new URL("../src/features/MatrixExplorePage.tsx", import.meta.url), "utf8");
const css = `html { font-size: 16px; }\n${featureCss}\n${exploreCss}`;

// JSDOM cannot resolve CSS variable border shorthands or color-mix. Assert the
// canonical declarations instead; pwa-frame-system.spec.ts covers real rendering.
function assertDeclarations(source, selector, expected) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rules = ruleBodies(source, new RegExp(`^${escaped}$`));
  assert.ok(rules.length, `Missing canonical selector: ${selector}`);
  for (const [property, value] of Object.entries(expected)) {
    const declarations = rules.flatMap(body => body.split(";")
      .map(entry => [entry.slice(0, entry.indexOf(":")).trim(), entry.slice(entry.indexOf(":") + 1).trim()])
      .filter(([name]) => name === property).map(([, entry]) => entry));
    assert.deepEqual(declarations, [value], `${selector}: one ${property} owner`);
  }
}

function exploreFixture(tianyan = false) {
  const dom = new JSDOM(`
    <style>${css}</style>
    <main class="matrix-explore-main-screen">
      <div class="feature-body">
        <section class="panel explore-settings">
          <h2 class="section-title"><span></span>探索設定</h2>
          <div class="setting-grid">
            <label><span><img class="setting-label-icon matrix-explore-setting-icon">探索期數</span><div class="segmented three"><button data-selected="true">二期</button><button data-selected="false">七期</button><button data-selected="false">十三期</button></div></label>
            <label><span><img class="setting-label-icon matrix-explore-setting-icon">版路類型</span><div class="segmented three"><button data-selected="true">加減版路</button><button data-selected="false">合值版路</button><button data-selected="false">拖牌版路</button></div></label>
            <div class="explore-condition-row" role="group" aria-label="探索條件"><span class="explore-condition-label">探索條件</span><div class="hit-options"><button data-selected="true">準4+</button><button data-selected="false">準5+</button></div></div>
          </div>
          <div class="explore-hit-settings">
          <button class="advanced-row"><span>進階探索設定</span></button>
          <div class="advanced-panel"><label></label><label></label><label></label></div>
          </div>
        </section>
        <button class="primary-action">開始探索</button>
        <section class="panel repeat-stats-panel">
          <header class="repeat-stats-heading">
            <h2 class="section-title"><span></span>重複號碼統計</h2>
            <button data-selected="true">同碼</button>
            <span>點選進行版路篩選</span>
          </header>
          <div class="result-summary">
            <button data-selected="true"><b>01</b><small>2次</small></button>
            <button data-selected="false"><b>02</b><small>1次</small></button>
          </div>
        </section>
        <p class="explore-result-disclaimer">探索結果依歷史資料與所選條件產生</p>
        <section class="panel result-panel">
          <header class="result-title">
            <h2 class="section-title"><span></span>探索結果區</h2>
            <button class="consecutive-filter-button">連準篩選</button>
            <span class="result-count">探索到 <span class="numeric-text">123</span> 組符合條件版路</span>
          </header>
          <div class="explore-consecutive-filter-options matrix-explore-consecutive-filter-options">
            <button class="explore-consecutive-filter-option" aria-pressed="true">準5進6</button>
            <button class="explore-consecutive-filter-option" aria-pressed="false">準6進7</button>
          </div>
          <div class="road-results">
            <div class="road-results-head"><span>位置</span><span>號碼</span><span>預測期</span><span>連準次數</span><span>預測</span><span>版路類型</span></div>
            <article><div class="road-result-row"><span class="tag">順球2</span><strong>08</strong><button class="road-type-toggle"><span>加減版路</span><svg></svg></button></div></article>
            <article><div class="road-result-row"><span class="tag">順球3</span><strong>09</strong><button class="road-type-toggle"><span>加減版路</span><svg></svg></button></div></article>
          </div>
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
  if (tianyan) {
    document.querySelector("main").classList.add("matrix-tianyan-screen");
    document.querySelector(".consecutive-filter-button").remove();
    document.querySelector(".matrix-explore-consecutive-filter-options").remove();
  }
  const style = (selector) => dom.window.getComputedStyle(document.querySelector(selector));
  return { style, document };
}

for (const tianyan of [false, true]) {
  test(`${tianyan ? "天衍" : "探索"}兩張結果卡上內距與標題列對齊`, () => {
    const { style } = exploreFixture(tianyan);
    for (const selector of [".repeat-stats-panel", ".result-panel"]) {
      assert.equal(style(selector).paddingTop, "6px");
    }
    for (const selector of [".repeat-stats-heading", ".result-title"]) {
      assert.equal(style(selector).minHeight, "22px");
      assert.equal(style(selector).alignItems, "center");
    }
    assert.equal(style(".repeat-stats-heading button").height, "22px");
    assert.equal(style(".repeat-stats-heading button").fontSize, "11px");
  });
}

test("探索與進階設定的三列圖示使用 7px 垂直間距", () => {
  const { style } = exploreFixture();
  assert.equal(style(".setting-grid").rowGap, "7px");
  assert.equal(style(".advanced-panel").rowGap, "7px");
});

test("探索設定左側標籤依內容延伸避免壓到右側選項", () => {
  const { style } = exploreFixture();
  const label = style(".setting-grid label > span");

  assert.equal(label.width, "auto");
  assert.equal(label.minWidth, "88.8px");
  assert.equal(label.flexGrow, "0");
  assert.equal(label.flexShrink, "0");
  assert.equal(label.flexBasis, "auto");
});

test("探索保留 8px 內容節奏與統計卡額外 4px 外距，移除近10期表格", () => {
  const { style, document } = exploreFixture();
  assert.equal(style(".feature-body").rowGap, "8px");
  assert.equal(style(".repeat-stats-panel").marginTop, "4px");
  assert.equal(document.querySelector(".history-panel"), null);
  assert.doesNotMatch(exploreSource, /<HistoryList/);
});

test("探索與結果區標題保持 14px", () => {
  const { style } = exploreFixture();
  assert.equal(style(".explore-settings > .section-title").fontSize, "14px");
  assert.equal(style(".advanced-row").fontSize, "14px");
  assert.equal(style(".repeat-stats-heading .section-title").fontSize, "14px");
  assert.equal(style(".result-title .section-title").fontSize, "14px");
});

test("設定與結果卡使用共用內容框、6px 上內距及核准的水平內距", () => {
  const { style, document } = exploreFixture();
  assertDeclarations(featureCss, ".panel", { border: "1px solid var(--pwa-frame-secondary)", "border-radius": "var(--pwa-frame-radius)" });
  for (const selector of [".explore-settings", ".repeat-stats-panel", ".result-panel"]) {
    assert.ok(document.querySelector(selector).classList.contains("panel"));
    assert.equal(style(selector).paddingTop, "6px");
  }
  assert.equal(document.querySelector(".hit-advanced-panel"), null);
  assert.doesNotMatch(exploreSource, /className="[^"]*hit-advanced-panel/);
  assert.equal(style(".repeat-stats-panel").paddingBottom, "10px");
  for (const selector of [".repeat-stats-panel", ".result-panel"]) {
    assert.equal(style(selector).paddingLeft, "6px");
    assert.equal(style(selector).paddingRight, "6px");
  }
});

test("整合條件列使用 20px 選項，進階設定保留 8px 上距", () => {
  const { style } = exploreFixture();
  const selected = style('.hit-options button[data-selected="true"]');
  const unselected = style('.hit-options button[data-selected="false"]');

  assert.equal(selected.height, "20px");
  assert.equal(selected.minHeight, "20px");
  assert.equal(selected.padding, "0.125rem 0.25rem");
  assert.equal(selected.boxSizing, "border-box");
  assert.equal(unselected.height, selected.height);
  assert.equal(unselected.minHeight, selected.minHeight);
  assert.equal(unselected.padding, selected.padding);
  assert.equal(unselected.boxSizing, selected.boxSizing);
  assert.equal(style(".hit-options").paddingBottom, "0px");
  assert.equal(style(".hit-options").marginBottom, "0px");
  assert.equal(style(".advanced-row").marginTop, "8px");
});

test("設定控制項使用共用選取金色與未選控制框", () => {
  for (const selector of [".segmented button", ".hit-options button"]) {
    assertDeclarations(featureCss, selector, {
      border: "1px solid var(--pwa-frame-tertiary)",
      background: "var(--pwa-control-surface)", color: "var(--lottery-text-secondary)",
    });
    assertDeclarations(featureCss, `${selector}[data-selected="true"]`, {
      "border-color": "var(--pwa-frame-secondary)", background: "var(--pwa-control-selected)",
      color: "var(--pwa-frame-secondary)", "box-shadow": "none",
    });
  }
});

test("功能圖示與進階探索標題使用更新後的層級", () => {
  const { style } = exploreFixture();
  const icon = style(".matrix-explore-setting-icon");
  const rootFontSize = Number.parseFloat(style("html").fontSize);

  assert.equal(icon.inlineSize, "1.8rem");
  assert.equal(icon.blockSize, "1.8rem");
  assert.equal(icon.flexBasis, "1.8rem");
  assert.equal(Number.parseFloat(icon.inlineSize) * rootFontSize, 28.8);
  assert.equal(Number.parseFloat(icon.blockSize) * rootFontSize, 28.8);
  assert.equal(style(".advanced-row").fontWeight, "600");
});

test("重複統計卡片與控制項使用指定比例", () => {
  const { style } = exploreFixture();
  const sameCode = style(".repeat-stats-heading button");
  const filter = style(".consecutive-filter-button");

  assert.equal(sameCode.height, "22px");
  assert.equal(filter.height, "22px");
  assert.equal(sameCode.fontSize, "11px");
  assert.equal(filter.fontSize, "11px");
  assert.equal(style(".repeat-stats-heading > span").fontSize, "11px");
  assert.equal(style(".repeat-stats-heading > span").fontWeight, "400");
  assert.equal(style(".repeat-stats-heading > span").paddingRight, "8px");
  assert.equal(style(".repeat-stats-heading > span").color, "rgb(158, 154, 147)");
  assert.equal(style(".result-summary b").fontSize, "14px");
  assert.doesNotMatch(style(".result-summary b").fontFamily, /monospace/i);
  assert.equal(style(".result-summary b").fontWeight, "800");
});

test("重複統計與結果區使用共用框線層級及 28% 標準金分隔線", () => {
  const { style } = exploreFixture();
  assertDeclarations(tokens, ":root", {
    "--pwa-frame-secondary": "var(--home-frame-gold)",
    "--pwa-frame-tertiary": "var(--home-frame-muted)",
    "--pwa-frame-radius": "var(--home-frame-radius)",
  });
  assertDeclarations(featureCss, ".panel", { border: "1px solid var(--pwa-frame-secondary)", "box-shadow": "none" });
  assertDeclarations(exploreCss, ".matrix-explore-main-screen", {
    "--pwa-frame-divider": "color-mix(in srgb, var(--home-frame-gold) 28%, transparent)",
  });
  for (const selector of [".repeat-stats-heading .section-title", ".result-title .section-title", ".road-results-head"]) {
    assert.equal(style(selector).color, "rgba(244, 206, 103, 0.84)");
  }
  assert.equal(style('.result-summary > button[data-selected="false"] b').color, "rgb(242, 245, 248)");
  assert.equal(style(".road-result-row > strong").color, "rgb(244, 206, 103)");
  for (const selector of [".result-summary > button", ".explore-consecutive-filter-option", ".road-results .tag"]) {
    assertDeclarations(exploreCss, `.matrix-explore-main-screen ${selector}`, { border: "1px solid var(--pwa-frame-tertiary)" });
  }
  for (const selector of ['.result-summary > button[data-selected="true"]', '.explore-consecutive-filter-option[aria-pressed="true"]']) {
    assertDeclarations(exploreCss, `.matrix-explore-main-screen ${selector}`, { "border-color": "var(--pwa-frame-secondary)" });
  }
  assertDeclarations(exploreCss, ".matrix-explore-main-screen .matrix-explore-consecutive-filter-options", {
    "border-top": "1px solid var(--pwa-frame-divider)", "border-bottom": "1px solid var(--pwa-frame-divider)",
  });
  assertDeclarations(exploreCss, ".matrix-explore-main-screen .road-results-head", { "border-bottom": "1px solid var(--pwa-frame-divider)" });
  assertDeclarations(exploreCss, ".matrix-explore-main-screen .road-results article + article", { "border-top": "1px solid var(--pwa-frame-divider)" });
  assert.equal(style(".road-result-row").borderBottomWidth, "0px");
  assert.equal(style(".road-results article").borderTopWidth, "0px");
});

test("結果標語與右上角組數維持單列清楚層級", () => {
  const { style } = exploreFixture();
  const disclaimer = style(".explore-result-disclaimer");
  const count = style(".result-count");
  const number = style(".result-count .numeric-text");

  assert.match(exploreCss, /\.matrix-explore-main-screen \.explore-result-disclaimer\s*\{[^}]*font-size:\s*clamp\(7px, 2vw, 8px\);/s);
  assert.equal(disclaimer.fontWeight, "700");
  assert.equal(disclaimer.whiteSpace, "nowrap");
  assert.equal(disclaimer.paddingLeft, "6px");
  assert.equal(disclaimer.paddingRight, "6px");
  assert.equal(count.fontSize, "10px");
  assert.equal(count.paddingRight, "8px");
  assert.equal(number.fontSize, "12px");
  assert.equal(number.color, "rgb(167, 216, 234)");
});

test("六個結果標題與版路結果之間使用共用表頭分隔線", () => {
  const { style } = exploreFixture();
  const head = style(".road-results-head");
  assertDeclarations(exploreCss, ".matrix-explore-main-screen .road-results-head", { "border-bottom": "1px solid var(--pwa-frame-divider)" });
  assert.equal(head.marginBottom, "4px");
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
  assertDeclarations(featureCss, ".matrix-explore-main-screen .validation-summary-card em", { border: "1px solid var(--pwa-frame-tertiary)" });
  assert.equal(style(".validation-summary-primary").color, "rgb(239, 83, 80)");
  assert.equal(style(".validation-summary-position").color, "rgb(53, 191, 240)");
  assert.equal(style(".validation-summary-lookback").color, "rgb(167, 139, 250)");
  assert.equal(style(".validation-summary-future").color, "rgb(126, 226, 168)");
  assert.equal(style(".validation-summary-formula").color, "rgb(246, 201, 95)");
  assert.equal(style(".validation-summary-card > span i").fontWeight, "800");
  assert.match(featureCss, /\.validation-summary-card > span i\s*\{[^}]*font-weight:\s*inherit;/s);
  assert.match(featureCss, /\.matrix-explore-main-screen \.validation-summary-card > span i\s*\{[^}]*font-weight:\s*800;/s);
});


test("探索與天衍同碼及號碼小卡的選取框色與文字比照連準次數", () => {
  for (const selector of ['.repeat-stats-heading button[data-selected="true"]', '.result-summary > button[data-selected="true"]', '.explore-consecutive-filter-option[aria-pressed="true"]']) {
    assertDeclarations(exploreCss, `.matrix-explore-main-screen ${selector}`, {
      "border-color": "var(--pwa-frame-secondary)", color: "var(--pwa-frame-secondary)",
    });
  }
  assertDeclarations(exploreCss, '.matrix-explore-main-screen:not(.matrix-tiangong-screen) .result-summary > button[data-selected="true"] b', { color: "inherit" });
  assertDeclarations(previewCss, '.explore-consecutive-filter-option[aria-pressed="true"]', { background: "var(--pwa-control-selected)", "box-shadow": "none" });
  assertDeclarations(exploreCss, '.matrix-explore-main-screen .result-summary > button[data-selected="true"]', { background: "var(--pwa-control-selected)" });
});

test("同碼保留共用控制表面，號碼小卡與連準選項使用選取表面", () => {
  // a7122ce replaced #412's grouped color/background override with the PWA
  // frame owners: same-code keeps its resting surface and selected frame/text.
  assertDeclarations(exploreCss, ".matrix-explore-main-screen .repeat-stats-heading button", {
    background: "var(--pwa-control-surface)",
  });
  const selected = ruleBodies(exploreCss, /^\.matrix-explore-main-screen \.repeat-stats-heading button\[data-selected="true"\]$/);
  assert.equal(selected.length, 1);
  assert.doesNotMatch(selected[0], /(?:background(?:-color)?|box-shadow)\s*:/);
  assertDeclarations(previewCss, '.explore-consecutive-filter-option[aria-pressed="true"]', { background: "var(--pwa-control-selected)" });
  assertDeclarations(exploreCss, '.matrix-explore-main-screen .result-summary > button[data-selected="true"]', { background: "var(--pwa-control-selected)" });
});
