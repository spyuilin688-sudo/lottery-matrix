import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const base = readFileSync("src/homepage/base.css", "utf8");
const visualLanguage = readFileSync("src/homepage/visual-language.css", "utf8");
const homepageEntry = readFileSync("src/homepage-repair.css", "utf8");

test("loads the visual-language layer as a separate CSS import", () => {
  assert.equal(
    homepageEntry,
    '@import "./homepage/base.css";\n@import "./homepage/lottery-switcher.css";\n@import "./homepage/visual-language.css";\n',
  );
});

test("visual-language layer does not override homepage spacing geometry", () => {
  assert.doesNotMatch(visualLanguage, /\.home-screen \.home-layout\s*\{[^}]*(?:grid-template-rows|align-content|padding-bottom)\s*:/s);
  assert.doesNotMatch(visualLanguage, /\.home-screen \.matrix-status-section\s*\{[^}]*(?:flex|height|overflow)\s*:/s);
  assert.doesNotMatch(visualLanguage, /\.home-screen \.matrix-status-card-grid\s*\{[^}]*(?:height|grid-template-rows|align-content)\s*:/s);
  assert.match(visualLanguage, /\.home-screen \.home-bottom-group\s*\{[^}]*margin-block-start:\s*var\(--home-gap-status-core\);/s);
});

test("uses one restrained frame treatment with homepage shortcuts owned by base", () => {
  assert.match(visualLanguage, /--home-octagon-cut:\s*clamp\(4px, 1\.54vw, 6px\);/);
  assert.match(visualLanguage, /--home-frame-inset:\s*2px;/);
  assert.match(visualLanguage, /--home-frame-shadow:/);
  assert.match(visualLanguage, /\.home-screen \.home-shortcut\s*\{[^}]*--home-octagon-frame:/s);
  assert.match(base, /\.home-screen \.home-shortcut\s*\{[^}]*border:\s*0;[^}]*border-radius:\s*0;[^}]*clip-path:\s*polygon\([^}]*box-shadow:\s*var\(--home-frame-shadow\);/s);
  assert.match(base, /\.home-screen \.home-shortcut::before\s*\{/);
  assert.match(base, /\.home-screen \.home-shortcut::after\s*\{[^}]*background:\s*var\(--home-octagon-frame\);/s);
  assert.match(base, /\.home-screen \.home-shortcut:active\s*\{[^}]*box-shadow:\s*var\(--home-frame-shadow-active\);/s);
  assert.match(base, /\.home-screen \.home-shortcut:focus-visible\s*\{/);
  assert.doesNotMatch(visualLanguage, /\.home-screen \.home-shortcut(?::active|:focus-visible|::before|::after)\s*\{/);
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
  assert.match(visualLanguage, /--home-status-glow:\s*color-mix\(in srgb, var\(--home-status-tone\) 18%, transparent\);/);
  assert.match(visualLanguage, /\.home-screen \.matrix-status-card:active\s*\{[^}]*26%/s);
});

test("does not replace or redraw existing homepage artwork", () => {
  assert.doesNotMatch(visualLanguage, /background-image:\s*url\(/);
  assert.doesNotMatch(visualLanguage, /content:\s*["'][^"']+["']/);
});

test("derives homepage colors from the canonical runtime tokens", () => {
  assert.match(visualLanguage, /var\(--lottery-gold-500\)/);
  assert.match(visualLanguage, /var\(--lottery-gold-300\)/);
  assert.match(visualLanguage, /var\(--matrix-status-active\)/);
  assert.match(visualLanguage, /var\(--matrix-status-focus\)/);
  assert.match(visualLanguage, /var\(--matrix-status-resonance\)/);
  assert.match(visualLanguage, /var\(--matrix-status-critical\)/);
});
