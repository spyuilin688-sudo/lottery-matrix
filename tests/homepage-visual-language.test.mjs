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
  assert.match(visualLanguage, /\.home-screen \.latest-draw-card,[\s\S]*\.home-screen \.matrix-core-banner/);
});

test("preserves the four semantic Matrix status tones", () => {
  for (const tone of ["ACTIVE", "FOCUS", "RESONANCE", "CRITICAL"]) {
    assert.match(visualLanguage, new RegExp(`data-status="${tone}"`));
  }
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
