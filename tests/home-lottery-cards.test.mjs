import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const css = readLocalCss("src/homepage-repair.css");
const source = readFileSync(new URL("../src/Prototype.tsx", import.meta.url), "utf8");

// DESIGN.md compact Selector replaces Matrixbba with the four independent Logos.
test("homepage uses four equal lottery cards with 8px gaps and a 36px minimum hit height", () => {
  assert.match(css, /\.lottery-switcher--home-style \.lottery-switcher-hit-grid\s*\{[^}]*height:\s*max\(36px, calc\(100cqw \* 214 \/ 1532 - 10px\)\);[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);[^}]*gap:\s*8px;/s);
  assert.doesNotMatch(css, /Matrixbba\.png|background-position:\s*(?:33\.333|66\.667)%/);
});

test("each lottery button uses its original independent logo and intrinsic bounds", () => {
  assert.match(source, /<svg className="lottery-selector-logo" viewBox=\{lottery\.logoViewBox\} aria-hidden="true" focusable="false">/);
  assert.match(source, /<image href=\{lottery\.logo\} width=\{lottery\.logoSize\[0\]\} height=\{lottery\.logoSize\[1\]\} \/>/);
  assert.match(source, /role="radio"\s+aria-checked=\{isSelected\}\s+aria-label=\{lottery\.id\}/);
  assert.match(source, /tabIndex=\{isSelected \? 0 : -1\}/);
  for (const key of ["Home", "End", "ArrowLeft", "ArrowRight"]) assert.ok(source.includes(`event.key === "${key}"`));
  assert.match(source, /\[nextIndex\]\?\.focus\(\)/);
  assert.doesNotMatch(css, /lottery-card-logo|--lottery-logo-scale|lottery-switcher--independent-logos/);
});

test("lottery selection changes logo opacity and one frame without sprite dimming", () => {
  const card = css.match(/\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\s*\{([^}]*)\}/s)?.[1] ?? "";
  const selected = css.match(/\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]\s*\{([^}]*)\}/s)?.[1] ?? "";
  assert.match(card, /border:\s*1px solid color-mix\(in srgb, var\(--home-frame-gold\) 22%, transparent\);/);
  assert.match(card, /background:\s*var\(--lottery-neutral-950\);/);
  assert.match(card, /transition:\s*var\(--home-lottery-transition, border-color 180ms ease, background-color 180ms ease, filter 180ms ease\);/);
  // pwa-frame-system.test.mjs records the later selected-frame refinement.
  assert.match(selected, /border-color:\s*color-mix\(in srgb, var\(--home-frame-bright\) 55%, transparent\);/);
  assert.match(selected, /background:\s*color-mix\(in srgb, var\(--home-frame-gold\) 6%, var\(--lottery-neutral-950\)\);/);
  assert.match(css, /\.lottery-selector-logo\s*\{[^}]*opacity:\s*\.6;/s);
  assert.match(css, /\.lottery-card\[data-selected="true"\] \.lottery-selector-logo\s*\{[^}]*opacity:\s*1;/s);
  assert.doesNotMatch(card + selected, /background-image:|background-blend-mode:|(?:^|;)\s*(?:filter|opacity|transform):/);
  assert.doesNotMatch(css, /\.lottery-card(?:::[a-z]+|\[data-selected="true"\]::[a-z]+)\s*\{/);
});
