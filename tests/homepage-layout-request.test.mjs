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
function renderHomepageStyles() {
  const dom = new JSDOM(`<!doctype html><style>${css}</style>
    <div class="home-screen">
      <header class="brand-header"><img class="home-logo-image" alt="" /></header>
      <section class="app-screen home-content"><div class="mobile-scroll"><div class="mobile-scroll-content">
      <div class="home-layout">
        <main class="lottery-screen">
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
      </div></div></section>
    </div>`);

  return dom.window;
}

test("homepage reserves the logo above its scroller and preserves the requested section rhythm", () => {
  const window = renderHomepageStyles();
  const style = (selector) => window.getComputedStyle(window.document.querySelector(selector));
  const layout = style(".home-layout");
  const lotteryScreen = style(".lottery-screen");
  const bottomGroup = style(".home-bottom-group");
  const brandHeader = style(".brand-header");

  assert.equal(layout.gridTemplateRows, "auto auto");
  assert.equal(lotteryScreen.height, "100%");
  assert.equal(brandHeader.display, "flex");
  assert.equal(style(".home-screen").gridTemplateRows, "auto minmax(0, 1fr)");
  assert.equal(style(".home-content").minHeight, "0px");
  assert.equal(style(".mobile-scroll").overflowY, "auto");
  assert.equal(brandHeader.alignItems, "flex-start");
  assert.equal(brandHeader.paddingTop, "8px");
  assert.equal(style(".home-logo-image").height, "auto");
  assert.equal(style(".home-logo-image").objectPosition, "center bottom");
  assert.equal(layout.getPropertyValue("--home-feature-inline").trim(), "16px");
  assert.equal(layout.getPropertyValue("--home-feature-gap").trim(), "6px");
  assert.equal(layout.getPropertyValue("--home-gap-status-core").replaceAll(" ", ""), "clamp(9px,1.35dvh,12px)");
  assert.equal(layout.getPropertyValue("--home-gap-core-features").replaceAll(" ", ""), "var(--home-gap-status-core)");
  assert.equal(layout.getPropertyValue("--home-gap-features-nav").replaceAll(" ", ""), "clamp(4px,0.7dvh,8px)");
  assert.equal(lotteryScreen.getPropertyValue("--home-gap-logo-switcher").replaceAll(" ", ""), "clamp(13px,calc(1.15dvh+5px),16px)");
  assert.equal(lotteryScreen.getPropertyValue("--home-gap-switcher-draw").replaceAll(" ", ""), "clamp(7px,calc(0.9dvh+1px),9px)");
  assert.equal(lotteryScreen.getPropertyValue("--home-gap-draw-status").replaceAll(" ", ""), "clamp(9px,calc(1.15dvh+1px),12px)");
  assert.match(bottomGroup.getPropertyValue("--home-core-width"), /- 32px/);
  assert.equal(style(".matrix-status-section").paddingInline, "0px");
});

test("homepage selected lottery cards use the current single-frame selected styling", () => {
  assert.match(
    css,
    /\.lottery-card\[data-selected="true"\]\s*\{[^}]*border-color:\s*color-mix\(in srgb, var\(--home-frame-bright\) 55%, transparent\);[^}]*background:\s*color-mix\(in srgb, var\(--home-frame-gold\) 6%, var\(--lottery-neutral-950\)\);/s,
  );
  assert.doesNotMatch(css, /--lottery-selected-horizontal-gradient/);
});
