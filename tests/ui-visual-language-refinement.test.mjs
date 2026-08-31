import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const homeCss = readLocalCss("src/homepage-repair.css");
const navCss = readFileSync(new URL("../src/prototype.css", import.meta.url), "utf8");
const featureCss = readFileSync(new URL("../src/feature-page-adjustments.css", import.meta.url), "utf8");
const canonicalFeatureCss = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const navSource = readFileSync(new URL("../src/BottomNavigation.tsx", import.meta.url), "utf8");

function ruleBodies(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...source.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "gs"))].map((match) => match[1]);
}

function rule(source, selector) {
  return ruleBodies(source, selector).at(-1) ?? "";
}

function finalDeclaration(source, selector, property) {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let value = "";
  for (const body of ruleBodies(source, selector)) {
    const match = body.match(new RegExp(`${escapedProperty}:\\s*([^;]+);`));
    if (match) value = match[1].trim();
  }
  return value;
}

test("homepage status frame owns 16px inset, 1.5px vertical padding and card gaps", () => {
  assert.equal(finalDeclaration(homeCss, ".home-screen .matrix-status-section", "width"), "calc(100% - 32px)");
  assert.equal(finalDeclaration(homeCss, ".home-screen .matrix-status-section", "padding-block"), "1.5px");
  assert.equal(finalDeclaration(homeCss, ".home-screen .matrix-status-section", "border"), "0");
  assert.equal(finalDeclaration(homeCss, ".home-screen .matrix-status-card-grid", "gap"), "1.5px");
  assert.match(homeCss, /--home-gap-draw-status:\s*8px;/);
  assert.match(homeCss, /--home-gap-status-core:\s*10px;/);
});

test("homepage status logos are 80 percent larger and shift left 6px without a max-width lock", () => {
  assert.equal(finalDeclaration(homeCss, ".home-screen .matrix-status-lottery-logo", "width"), "54%");
  assert.equal(finalDeclaration(homeCss, ".home-screen .matrix-status-lottery-logo", "left"), "calc(83.5% - 24px)");
  assert.notEqual(finalDeclaration(homeCss, ".home-screen .matrix-status-lottery-logo", "max-width"), "56px");
});

test("homepage logo is reduced by 8 percent and five features keep their current responsive gaps", () => {
  assert.equal(finalDeclaration(homeCss, ".home-screen .home-logo-image", "width"), "87.584%");
  assert.equal(finalDeclaration(homeCss, ".home-screen .home-shortcut-row", "width"), "100%");
  assert.equal(finalDeclaration(homeCss, ".home-screen .home-shortcut-row", "column-gap"), "var(--home-feature-gap)");
  assert.equal(finalDeclaration(homeCss, ".home-screen .home-shortcut-row", "padding-inline"), "var(--home-feature-inline)");
  assert.equal(finalDeclaration(homeCss, ".home-screen .home-shortcut", "width"), "100%");
  assert.equal(finalDeclaration(homeCss, ".home-screen .home-shortcut", "justify-self"), "center");
});

test("draw order moves up 2px, shrinks to 25px and keeps a compact near-flat inner seam", () => {
  const order = ruleBodies(homeCss, ".home-screen .latest-draw-card .draw-order").join("\n");
  const button = ruleBodies(homeCss, ".home-screen .latest-draw-card .draw-order button").join("\n");
  assert.match(order, /gap:\s*2\.5px;/);
  assert.match(order, /align-self:\s*start;/);
  assert.match(order, /height:\s*25px;/);
  assert.match(order, /margin-block-start:\s*1px;/);
  assert.match(order, /border:\s*0;/);
  assert.match(order, /background:\s*transparent;/);
  assert.match(button, /border:\s*1px solid rgba\(230, 177, 76, \.58\);/);
  assert.match(homeCss, /\.home-screen \.latest-draw-card \.draw-order button:first-child\s*\{[^}]*border-radius:\s*14px 2px 2px 14px;/s);
  assert.match(homeCss, /\.home-screen \.latest-draw-card \.draw-order button:last-child\s*\{[^}]*border-radius:\s*2px 14px 14px 2px;/s);
  assert.doesNotMatch(order, /transform\s*:/);
});

test("draw footer reference uses zero parent gap and no parent divider lines", () => {
  const footer = ruleBodies(homeCss, ".home-screen .latest-draw-card .next-draw-info--embedded").join("\n");
  const item = ruleBodies(homeCss, ".home-screen .latest-draw-card .next-draw-info--embedded .next-draw-item").join("\n");
  assert.match(footer, /gap:\s*0;/);
  assert.match(footer, /border:\s*0;/);
  assert.match(footer, /background:\s*transparent;/);
  assert.match(item, /gap:\s*4px;/);
  assert.match(item, /padding-inline:\s*clamp\(6px, 2vw, 10px\);/);
  assert.match(item, /border:\s*0;/);
  assert.match(item, /background:\s*linear-gradient/);
  assert.doesNotMatch(footer, /border-top\s*:/);
});

test("bottom navigation exposes homepage-only double-tap quick settings without changing four primary columns", () => {
  assert.match(navSource, /showQuickSettings\?: boolean/);
  assert.match(navSource, /showQuickSettings && onQuickConfigure \? \(/);
  assert.match(navSource, /handleQuickSettingsClick/);
  assert.doesNotMatch(navSource, /QUICK_LONG_PRESS_MS|onPointerDown|onPointerUp|onPointerCancel|setPointerCapture|長按/);
  assert.equal(finalDeclaration(navCss, ".bottom-navigation", "grid-template-columns"), "repeat(4, minmax(0, 1fr))");
  assert.equal(finalDeclaration(navCss, ".bottom-navigation-quick-settings", "position"), "absolute");
});

test("guide categories scroll horizontally and status settings stays in bottom navigation", () => {
  assert.equal(finalDeclaration(featureCss, ".matrix-guide-screen .guide-category-strip", "display"), "flex");
  assert.equal(finalDeclaration(featureCss, ".matrix-guide-screen .guide-category-strip", "overflow-x"), "auto");
  assert.equal(finalDeclaration(featureCss, ".matrix-guide-screen .guide-category-strip", "scroll-snap-type"), "x proximity");
  assert.doesNotMatch(canonicalFeatureCss, /status-title-trigger/);
  assert.equal(finalDeclaration(featureCss, ".matrix-status-screen .matrix-status-settings-entry", "position"), "fixed");
  assert.equal(finalDeclaration(featureCss, ".matrix-status-screen .matrix-status-settings-entry", "right"), "max(10px, calc(env(safe-area-inset-right, 0px) + 4px))");
});

test("profile expiry column no longer draws the unwanted vertical rule", () => {
  assert.equal(finalDeclaration(featureCss, ".subscription-status-content > div:last-child", "border-left"), "0");
});

test("refined responsive owners avoid forced layout compensation", () => {
  const selectors = [
    ".home-screen .matrix-status-section",
    ".home-screen .home-shortcut-row",
    ".home-screen .latest-draw-card .draw-order",
    ".home-screen .latest-draw-card .next-draw-info--embedded",
  ];
  for (const selector of selectors) {
    const body = ruleBodies(homeCss, selector).join("\n");
    assert.doesNotMatch(body, /!important|margin(?:-[a-z]+)?:\s*-|translate\(/, selector);
  }
});
