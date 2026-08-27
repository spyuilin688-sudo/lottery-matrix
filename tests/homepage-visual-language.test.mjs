import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const visualLanguage = readFileSync("src/homepage/visual-language.css", "utf8");
const homepageEntry = readFileSync("src/homepage-repair.css", "utf8");

test("loads the visual-language layer as a separate CSS import", () => {
  assert.equal(
    homepageEntry,
    '@import "./homepage/base.css";\n@import "./homepage/lottery-switcher.css";\n@import "./homepage/visual-language.css";\n',
  );
});

test("keeps homepage sections in a compact content flow", () => {
  assert.match(visualLanguage, /\.home-screen \.matrix-status-section\s*\{[^}]*flex:\s*0 0 auto;/s);
  assert.match(visualLanguage, /\.home-screen \.home-bottom-group\s*\{[^}]*margin-block-start:\s*var\(--home-gap-status-core\);/s);
});

test("uses one restrained frame treatment for homepage entry surfaces", () => {
  assert.match(visualLanguage, /--home-frame-border:/);
  assert.match(visualLanguage, /--home-frame-shadow:/);
  assert.match(visualLanguage, /\.home-screen \.lottery-switcher--home-style[\s\S]*\.home-screen \.latest-draw-card,[\s\S]*\.home-screen \.matrix-core-banner,[\s\S]*\.home-screen \.home-shortcut\s*\{[^}]*border:\s*var\(--lottery-stroke-default\) solid var\(--home-frame-border\);[^}]*border-radius:\s*var\(--lottery-card-radius\);[^}]*box-shadow:\s*var\(--home-frame-shadow\);/s);
  assert.match(visualLanguage, /\.lottery-card\[data-selected="true"\],[\s\S]*\.home-shortcut:active\s*\{[^}]*border-radius:\s*var\(--lottery-card-radius\);/s);
  assert.match(visualLanguage, /\.home-screen \.home-shortcut img\s*\{[^}]*border-radius:\s*calc\(var\(--lottery-card-radius\) - var\(--lottery-stroke-default\)\);/s);
  assert.match(visualLanguage, /--lottery-stroke-default/);
});

test("reserves navigation clearance above the fixed homepage navigation", () => {
  assert.match(visualLanguage, /\.home-screen \.home-layout\s*\{[^}]*padding-bottom:\s*var\(--layout-bottom-nav-clearance\);/s);
  assert.doesNotMatch(visualLanguage, /\.home-screen \.home-layout\s*\{[^}]*padding-bottom:\s*env\(safe-area-inset-bottom,\s*0px\);/s);
});

test("preserves the four semantic Matrix status tones", () => {
  for (const tone of ["ACTIVE", "FOCUS", "RESONANCE", "CRITICAL"]) {
    assert.match(visualLanguage, new RegExp(`data-status="${tone}"`));
  }
});

test("keeps idle status glow restrained and strengthens it only while pressed", () => {
  assert.match(visualLanguage, /--home-status-glow:\s*color-mix\(in srgb, var\(--home-status-tone\) 18%, transparent\);/);
  assert.match(visualLanguage, /\.home-screen \.matrix-status-card:active\s*\{[^}]*26%/s);
});

test("does not replace or redraw existing homepage artwork", () => {
  assert.doesNotMatch(visualLanguage, /background-image:\s*url\(/);
  assert.doesNotMatch(visualLanguage, /content:\s*["'][^"']+["']/);
});

test("derives homepage colors from the canonical runtime tokens", () => {
  assert.doesNotMatch(visualLanguage, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(visualLanguage, /rgba?\(/i);
  assert.match(visualLanguage, /var\(--lottery-gold-500\)/);
  assert.match(visualLanguage, /var\(--matrix-status-active\)/);
});
