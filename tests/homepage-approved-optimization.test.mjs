import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const css = readLocalCss("src/homepage-repair.css");
const tokens = readFileSync(new URL("../src/design-tokens.css", import.meta.url), "utf8");

test("approved homepage uses the 16px primary inset and canonical rhythm", () => {
  assert.match(css, /\.home-screen \.lottery-screen\s*\{[^}]*--layout-page-inline:\s*16px;[^}]*--home-gap-logo-switcher:\s*8px;[^}]*--home-gap-switcher-draw:\s*2\.5px;[^}]*--home-gap-draw-status:\s*8px;[^}]*--home-gap-status-core:\s*8px;/s);
  assert.match(css, /--home-content-width:\s*calc\(min\(100vw, 390px\) - \(var\(--layout-page-inline\) \* 2\)\);/);
  assert.match(css, /\.home-screen \.matrix-status-section\s*\{[^}]*width:\s*calc\(min\(100vw, 390px\) - 32px\);/s);
});

test("approved homepage uses 1.5px status gaps and 8px feature gaps without artwork collisions", () => {
  assert.match(css, /\.lottery-switcher--home-style \.lottery-switcher-hit-grid\s*\{[^}]*gap:\s*6px;/s);
  assert.match(css, /\.home-screen \.matrix-status-card-grid\s*\{[^}]*gap:\s*1\.5px;/s);
  assert.match(css, /\.home-screen \.home-bottom-group\s*\{[^}]*--home-feature-gap:\s*8px;/s);
  assert.match(css, /\.home-screen \.home-shortcut\s*\{[^}]*overflow:\s*visible;/s);
});

test("approved homepage enlarges the logo while keeping the responsive shell free of hard positioning", () => {
  assert.match(css, /\.home-screen \.home-logo-image\s*\{[^}]*width:\s*95\.2%;/s);
  assert.match(tokens, /--bottom-navigation-height:\s*72px;/);
  assert.doesNotMatch(css, /\.home-screen \.lottery-screen\s*\{[^}]*width:\s*\d+px/s);
  assert.doesNotMatch(css, /\.home-screen \.lottery-screen\s*\{[^}]*transform:/s);
});

test("draw information remains a responsive three-zone layout with equal footer columns", () => {
  assert.match(css, /\.home-screen \.latest-draw-card\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(104px, 30%\) minmax\(0, 1fr\)/s);
  assert.match(css, /\.home-screen \.latest-draw-card \.next-draw-info--embedded\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
});
