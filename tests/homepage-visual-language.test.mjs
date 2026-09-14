import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const base = readFileSync("src/homepage/base.css", "utf8");
const visualLanguage = readFileSync("src/homepage/visual-language.css", "utf8");
const homepageEntry = readFileSync("src/homepage-repair.css", "utf8");

test("loads the visual-language layer as a separate CSS import", () => {
  const imports = [...homepageEntry.matchAll(/^@import\s+"([^"]+)";/gm)].map((match) => match[1]);
  assert.deepEqual(imports, [
    "./homepage/base.css",
    "./homepage/lottery-switcher.css",
    "./homepage/visual-language.css",
    "./homepage/logo-spacing.css",
  ]);
});

test("visual-language layer does not override homepage spacing geometry", () => {
  assert.doesNotMatch(visualLanguage, /\.home-screen \.home-layout\s*\{[^}]*(?:grid-template-rows|align-content|padding-bottom)\s*:/s);
  assert.doesNotMatch(visualLanguage, /\.home-screen \.matrix-status-section\s*\{[^}]*(?:flex|height|overflow)\s*:/s);
  assert.doesNotMatch(visualLanguage, /\.home-screen \.matrix-status-card-grid\s*\{[^}]*(?:height|grid-template-rows|align-content)\s*:/s);
  assert.match(base, /\.home-screen \.home-bottom-group\s*\{[^}]*margin-block-start:\s*var\(--home-gap-status-core\);/s);
});

test("keeps approved thin gold frames owned by base", () => {
  assert.match(visualLanguage, /--home-frame-border:/);
  assert.match(visualLanguage, /--home-frame-shadow:/);
  assert.doesNotMatch(visualLanguage, /\.home-screen \.latest-draw-card(?:::before|::after)?\s*\{/);
  assert.doesNotMatch(visualLanguage, /\.home-screen \.home-shortcut(?:::before|::after|:active|:focus-visible)\s*\{/);
  assert.match(base, /\.home-screen \.home-shortcut\s*\{[^}]*border:\s*1px solid var\(--home-frame-gold\);[^}]*border-radius:\s*var\(--home-frame-radius\);/s);
  assert.match(base, /\.home-screen \.home-shortcut:active\s*\{[^}]*filter:\s*brightness\(1\.15\);/s);
  assert.doesNotMatch(base, /\.home-screen \.home-shortcut::(?:before|after)\s*\{/);
});

test("does not add navigation-height clearance above the fixed homepage navigation", () => {
  assert.doesNotMatch(visualLanguage, /\.home-screen \.home-layout\s*\{[^}]*padding-bottom:\s*var\(--layout-bottom-nav-clearance\);/s);
});

test("preserves the four semantic Matrix status tones", () => {
  for (const tone of ["ACTIVE", "FOCUS", "RESONANCE", "CRITICAL"]) {
    assert.match(visualLanguage, new RegExp(`data-status="${tone}"`));
  }
});

test("keeps idle status glow restrained and strengthens it only while pressed", () => {
  assert.match(base, /--home-status-glow:\s*color-mix\(in srgb, var\(--home-status-tone\) 18%, transparent\);/);
  assert.match(visualLanguage, /\.home-screen \.matrix-status-card:active\s*\{[^}]*26%/s);
});

test("does not replace or redraw existing homepage artwork", () => {
  assert.doesNotMatch(visualLanguage, /background-image:\s*url\(/);
  assert.doesNotMatch(visualLanguage, /content:\s*["'][^"']+["']/);
});

test("derives homepage colors from the canonical runtime tokens", () => {
  assert.match(visualLanguage, /var\(--lottery-gold-500\)/);
  assert.match(visualLanguage, /var\(--lottery-gold-300\)/);
  assert.match(base, /var\(--lottery-card-bg\)/);
  assert.match(visualLanguage, /var\(--matrix-status-active\)/);
});
