import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/homepage-repair.css", import.meta.url), "utf8");

test("homepage uses one black-gold hierarchy without per-lottery selected gradients", () => {
  assert.match(css, /\.home-screen \.lottery-switcher > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\][\s\S]*?border-color:/);
  assert.doesNotMatch(css, /border-image:\s*var\(--lottery-selected-gradient\)/);
  assert.doesNotMatch(css, /--lottery-selected-gradient:/);
});

test("homepage lowers secondary visual layers while leaving Matrix Core as the primary effect", () => {
  assert.match(css, /\.home-screen \.matrix-status-section > \.home-asset-image[\s\S]*?filter:\s*brightness\(\.88\) saturate\(\.9\)/);
  assert.match(css, /\.home-screen \.home-shortcut img[\s\S]*?filter:\s*brightness\(\.84\) saturate\(\.88\)/);
  assert.match(css, /\.home-screen \.bottom-navigation-artwork[\s\S]*?filter:\s*brightness\(\.82\) saturate\(\.72\)/);
  assert.match(css, /\.home-screen \.matrix-core-banner[\s\S]*?animation:\s*matrix-core-pulse 8s ease-in-out infinite/);
});

test("homepage hierarchy change does not introduce forced CSS overrides", () => {
  assert.doesNotMatch(css, /!important/);
});
