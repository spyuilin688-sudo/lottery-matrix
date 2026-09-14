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

test("status cards share the thin gold frame in every load and press state", () => {
  assert.match(base, /\.home-screen \.matrix-status-card\s*\{[^}]*border-radius:\s*var\(--home-frame-radius\);[^}]*box-shadow:\s*inset 0 0 0 1px var\(--home-frame-gold\);/s);
  assert.doesNotMatch(base, /\.home-screen \.matrix-status-card\s*\{[^}]*clip-path:/s);
  assert.doesNotMatch(visualLanguage, /--home-status-(?:tone|glow)|matrix-status-card:active/);
  assert.doesNotMatch(base, /\.matrix-status-card\[data-load-state="(?:loading|error)"\]\s*\{[^}]*box-shadow:/s);
  assert.match(base, /\.matrix-status-card:active,[\s\S]*?filter:\s*brightness\(1\.15\);/);
});

test("removes only the artwork perimeter without moving or resizing the content", () => {
  const artwork = base.match(/\.home-screen \.matrix-status-artwork\s*\{([^}]*)\}/s)[1];
  assert.match(artwork, /clip-path:\s*inset\(6% 4% round 4px\);/);
  assert.match(artwork, /width:\s*100%;/);
  assert.match(artwork, /height:\s*auto;/);
  assert.doesNotMatch(artwork, /(?:^|;)\s*(?:transform|position|margin|scale):/);
});

test("does not replace or redraw existing homepage artwork", () => {
  assert.doesNotMatch(visualLanguage, /background-image:\s*url\(/);
  assert.doesNotMatch(visualLanguage, /content:\s*["'][^"']+["']/);
});

test("derives homepage colors from the canonical runtime tokens", () => {
  assert.match(visualLanguage, /var\(--lottery-gold-500\)/);
  assert.match(visualLanguage, /var\(--lottery-gold-300\)/);
  assert.match(base, /var\(--lottery-card-bg\)/);
  assert.match(base, /var\(--home-frame-gold\)/);
});
