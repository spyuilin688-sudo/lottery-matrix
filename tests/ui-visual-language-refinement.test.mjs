import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const homeCss = readLocalCss("src/homepage-repair.css");
const navCss = readFileSync(new URL("../src/prototype.css", import.meta.url), "utf8");
const featureCss = readFileSync(new URL("../src/feature-page-adjustments.css", import.meta.url), "utf8");
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

test("homepage status frame owns 12px viewport inset, 4px padding and 4px card gaps", () => {
  assert.equal(finalDeclaration(homeCss, ".home-screen .matrix-status-section", "width"), "calc(min(100vw, 390px) - 24px)");
  assert.equal(finalDeclaration(homeCss, ".home-screen .matrix-status-section", "padding"), "4px");
  assert.match(finalDeclaration(homeCss, ".home-screen .matrix-status-section", "border"), /^1px solid/);
  assert.equal(finalDeclaration(homeCss, ".home-screen .matrix-status-card-grid", "gap"), "4px");
  assert.match(homeCss, /--home-gap-draw-status:\s*8px;/);
  assert.match(homeCss, /--home-gap-status-core:\s*8px;/);
});

test("homepage status logos are 80 percent larger and shift left without a max-width lock", () => {
  assert.equal(finalDeclaration(homeCss, ".home-screen .matrix-status-lottery-logo", "width"), "54%");
  assert.equal(finalDeclaration(homeCss, ".home-screen .matrix-status-lottery-logo", "left"), "calc(83.5% - 8px)");
  assert.notEqual(finalDeclaration(homeCss, ".home-screen .matrix-status-lottery-logo", "max-width"), "56px");
});

test("homepage logo grows by 40 percent and five features use 8px responsive gaps", () => {
  assert.equal(finalDeclaration(homeCss, ".home-screen .home-logo-image", "width"), "95.2%");
  assert.equal(finalDeclaration(homeCss, ".home-screen .home-bottom-group", "--home-feature-gap"), "8px");
  assert.equal(finalDeclaration(homeCss, ".home-screen .home-shortcut-row", "column-gap"), "var(--home-feature-gap, 8px)");
});

test("draw order reference uses two independent rounded controls instead of an outer segmented shell", () => {
  const order = ruleBodies(homeCss, ".home-screen .latest-draw-card .draw-order").join("\n");
  const button = ruleBodies(homeCss, ".home-screen .latest-draw-card .draw-order button").join("\n");
  assert.match(order, /gap:\s*3px;/);
  assert.match(order, /border:\s*0;/);
  assert.match(order, /background:\s*transparent;/);
  assert.match(button, /border:\s*1px solid rgba\(230, 177, 76, \.58\);/);
  assert.match(button, /border-radius:\s*14px;/);
  assert.doesNotMatch(order, /transform\s*:/);
});

test("draw footer reference is composed from two rounded containers, not parent divider lines", () => {
  const footer = ruleBodies(homeCss, ".home-screen .latest-draw-card .next-draw-info--embedded").join("\n");
  const item = ruleBodies(homeCss, ".home-screen .latest-draw-card .next-draw-info--embedded .next-draw-item").join("\n");
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
  assert.equal(finalDeclaration(navCss, ".bottom-navigation", "grid-template-columns"), "repeat(4, minmax(0, 1fr))");
  assert.equal(finalDeclaration(navCss, ".bottom-navigation-quick-settings", "position"), "absolute");
});

test("guide categories are horizontal native-scroll controls and status title action is visually subdued", () => {
  assert.equal(finalDeclaration(featureCss, ".matrix-guide-screen .guide-category-strip", "display"), "flex");
  assert.equal(finalDeclaration(featureCss, ".matrix-guide-screen .guide-category-strip", "overflow-x"), "auto");
  assert.equal(finalDeclaration(featureCss, ".matrix-guide-screen .guide-category-strip", "scroll-snap-type"), "x mandatory");
  assert.equal(finalDeclaration(featureCss, ".matrix-status-screen .status-title-trigger img", "opacity"), ".58");
  assert.equal(finalDeclaration(featureCss, ".matrix-status-screen .status-title-trigger img", "filter"), "saturate(.55) brightness(.9)");
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
