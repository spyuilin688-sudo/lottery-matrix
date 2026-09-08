import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const css = await Promise.all([
  "src/homepage/base.css",
  "src/homepage/lottery-switcher.css",
  "src/homepage/visual-language.css",
  "src/homepage/logo-spacing.css",
].map((path) => readFile(new URL(`../${path}`, import.meta.url), "utf8"))).then((parts) => parts.join("\n"));
const normalizedCss = css.replaceAll(" ", "").replaceAll("\n", "");

function renderHomepageStyles() {
  const dom = new JSDOM(`<!doctype html><style>${css}</style>
    <div class="home-screen">
      <div class="home-layout">
        <main class="lottery-screen">
          <header class="brand-header"><img class="home-logo-image" alt="" /></header>
          <div class="lottery-switcher lottery-switcher--home-style">
            <div class="lottery-switcher-hit-grid">
              <button class="lottery-card" data-selected="true" data-lottery="今彩539"></button>
              <button class="lottery-card" data-selected="true" data-lottery="天天樂"></button>
              <button class="lottery-card" data-selected="true" data-lottery="六合彩"></button>
              <button class="lottery-card" data-selected="true" data-lottery="大樂透"></button>
            </div>
          </div>
          <section class="latest-draw-card"></section>
          <section class="matrix-status-section"><div class="matrix-status-card-grid"></div></section>
        </main>
        <div class="home-bottom-group">
          <button class="matrix-core-banner"></button>
          <nav class="home-shortcut-row"></nav>
        </div>
      </div>
    </div>`);

  return dom.window;
}

test("homepage keeps the logo in normal flow with a bounded responsive top gap and preserves the requested section rhythm", () => {
  const window = renderHomepageStyles();
  const style = (selector) => window.getComputedStyle(window.document.querySelector(selector));
  const layout = style(".home-layout");
  const lotteryScreen = style(".lottery-screen");
  const bottomGroup = style(".home-bottom-group");
  const brandHeader = style(".brand-header");

  assert.equal(layout.gridTemplateRows, "minmax(min-content, 1fr) auto");
  assert.equal(lotteryScreen.height, "100%");
  assert.equal(brandHeader.display, "flex");
  assert.equal(brandHeader.flexGrow, "0");
  assert.equal(brandHeader.alignItems, "center");
  assert.ok(normalizedCss.includes("padding-top:clamp(8px,1dvh,12px);"));
  assert.equal(style(".home-logo-image").height, "auto");
  assert.equal(style(".home-logo-image").objectPosition, "center bottom");
  assert.equal(layout.getPropertyValue("--home-feature-inline").trim(), "10px");
  assert.equal(layout.getPropertyValue("--home-feature-gap").trim(), "4px");
  assert.equal(layout.getPropertyValue("--home-gap-status-core").replaceAll(" ", ""), "clamp(9px,1.35dvh,12px)");
  assert.equal(layout.getPropertyValue("--home-gap-core-features").replaceAll(" ", ""), "clamp(14px,1.75dvh,17px)");
  assert.equal(layout.getPropertyValue("--home-gap-features-nav").replaceAll(" ", ""), "clamp(8px,1.15dvh,12px)");
  assert.equal(lotteryScreen.getPropertyValue("--home-gap-logo-switcher").replaceAll(" ", ""), "clamp(13px,calc(1.15dvh+5px),16px)");
  assert.equal(lotteryScreen.getPropertyValue("--home-gap-switcher-draw").replaceAll(" ", ""), "clamp(7px,calc(0.9dvh+1px),9px)");
  assert.equal(lotteryScreen.getPropertyValue("--home-gap-draw-status").replaceAll(" ", ""), "clamp(9px,calc(1.15dvh+1px),12px)");
  assert.match(bottomGroup.getPropertyValue("--home-core-width"), /- 28px/);
  assert.equal(style(".matrix-status-section").paddingInline, "0px");
});

test("homepage selected lottery cards use the original per-lottery palettes", () => {
  const window = renderHomepageStyles();
  const palettes = new Map([
    ["今彩539", "linear-gradient(90deg, #34c759, #ffd640, #3484ff, #ff3b30)"],
    ["天天樂", "linear-gradient(90deg, #1e76ff, #ffffff, #1e76ff)"],
    ["六合彩", "linear-gradient(90deg, #ff3b30, #1e76ff, #34c759)"],
    ["大樂透", "linear-gradient(90deg, #ffd640, #1e76ff, #ffd640)"],
  ]);

  for (const [lottery, expected] of palettes) {
    const card = window.document.querySelector(`.lottery-card[data-lottery="${lottery}"]`);
    const computed = window.getComputedStyle(card);
    assert.equal(
      computed.getPropertyValue("--lottery-selected-horizontal-gradient").replaceAll(" ", ""),
      expected.replaceAll(" ", ""),
    );
    assert.equal(computed.filter, "none");
  }
});
