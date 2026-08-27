import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const homeCss = readLocalCss("src/homepage-repair.css");
const navCss = readFileSync(new URL("../src/prototype.css", import.meta.url), "utf8");
const featureCss = readFileSync(new URL("../src/feature-page-adjustments.css", import.meta.url), "utf8");
const navSource = readFileSync(new URL("../src/BottomNavigation.tsx", import.meta.url), "utf8");

function rule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...source.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "gs"))].at(-1)?.[1] ?? "";
}

test("homepage status frame owns 12px viewport inset, 4px padding and 4px card gaps", () => {
  assert.match(rule(homeCss, ".home-screen .matrix-status-section"), /width:\s*calc\(min\(100vw, 390px\) - 24px\);/);
  assert.match(rule(homeCss, ".home-screen .matrix-status-section"), /padding:\s*4px;/);
  assert.match(rule(homeCss, ".home-screen .matrix-status-section"), /border:\s*1px solid/);
  assert.match(rule(homeCss, ".home-screen .matrix-status-card-grid"), /gap:\s*4px;/);
  assert.match(homeCss, /--home-gap-draw-status:\s*8px;/);
  assert.match(homeCss, /--home-gap-status-core:\s*8px;/);
});

test("homepage status logos are 80 percent larger and shift left without a max-width lock", () => {
  const logo = rule(homeCss, ".home-screen .matrix-status-lottery-logo");
  assert.match(logo, /width:\s*54%;/);
  assert.match(logo, /left:\s*calc\(83\.5% - 8px\);/);
  assert.doesNotMatch(logo, /max-width:\s*56px/);
});

test("homepage logo grows by 40 percent and five features use 8px responsive gaps", () => {
  assert.match(rule(homeCss, ".home-screen .home-logo-image"), /width:\s*95\.2%;/);
  assert.match(rule(homeCss, ".home-screen .home-bottom-group"), /--home-feature-gap:\s*8px;/);
  assert.match(rule(homeCss, ".home-screen .home-shortcut-row"), /column-gap:\s*var\(--home-feature-gap, 8px\);/);
});

test("draw order reference uses two independent rounded controls instead of an outer segmented shell", () => {
  const order = rule(homeCss, ".home-screen .latest-draw-card .draw-order");
  const button = rule(homeCss, ".home-screen .latest-draw-card .draw-order button");
  assert.match(order, /gap:\s*3px;/);
  assert.match(order, /border:\s*0;/);
  assert.match(order, /background:\s*transparent;/);
  assert.match(button, /border:\s*1px solid rgba\(230, 177, 76, \.58\);/);
  assert.match(button, /border-radius:\s*14px;/);
  assert.doesNotMatch(order, /transform\s*:/);
});

test("draw footer reference is composed from two rounded containers, not parent divider lines", () => {
  const footer = rule(homeCss, ".home-screen .latest-draw-card .next-draw-info--embedded");
  const item = rule(homeCss, ".home-screen .latest-draw-card .next-draw-info--embedded .next-draw-item");
  assert.match(footer, /gap:\s*3px;/);
  assert.match(footer, /border:\s*0;/);
  assert.match(footer, /background:\s*transparent;/);
  assert.match(item, /border:\s*1px solid rgba\(232, 177, 76, \.52\);/);
  assert.match(item, /background:\s*linear-gradient/);
  assert.doesNotMatch(footer, /border-top\s*:/);
});

test("bottom navigation exposes a dedicated quick-settings button without changing four primary columns", () => {
  assert.match(navSource, /aria-label="快捷設定"/);
  assert.match(navSource, /onClick=\{onQuickConfigure\}/);
  assert.match(rule(navCss, ".bottom-navigation"), /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/);
  assert.match(rule(navCss, ".bottom-navigation-quick-settings"), /position:\s*absolute;/);
});

test("guide categories are horizontal native-scroll controls and status title action is visually subdued", () => {
  const guide = rule(featureCss, ".matrix-guide-screen .guide-category-strip");
  assert.match(guide, /display:\s*flex;/);
  assert.match(guide, /overflow-x:\s*auto;/);
  assert.match(guide, /scroll-snap-type:\s*x mandatory;/);
  const triggerImage = rule(featureCss, ".matrix-status-screen .status-title-trigger img");
  assert.match(triggerImage, /opacity:\s*\.58;/);
  assert.match(triggerImage, /filter:\s*saturate\(\.55\) brightness\(\.9\);/);
});

test("profile expiry column no longer draws the unwanted vertical rule", () => {
  const expiry = rule(featureCss, ".subscription-status-content > div:last-child");
  assert.match(expiry, /border-left:\s*0;/);
});

test("refined responsive owners avoid forced layout compensation", () => {
  const selectors = [
    ".home-screen .matrix-status-section",
    ".home-screen .home-shortcut-row",
    ".home-screen .latest-draw-card .draw-order",
    ".home-screen .latest-draw-card .next-draw-info--embedded",
  ];
  for (const selector of selectors) {
    const body = rule(homeCss, selector);
    assert.doesNotMatch(body, /!important|margin(?:-[a-z]+)?:\s*-|translate\(/, selector);
  }
});
