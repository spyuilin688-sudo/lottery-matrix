import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/homepage-repair.css", import.meta.url), "utf8");

test("homepage uses one black-gold hierarchy without per-lottery selected gradients", () => {
  assert.match(css, /\.home-screen \.lottery-switcher > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\][\s\S]*?border-color:/);
  assert.doesNotMatch(css, /border-image:\s*var\(--lottery-selected-gradient\)/);
  assert.doesNotMatch(css, /--lottery-selected-gradient:/);
});

test("secondary image-heavy regions are visibly quieter than Matrix Core", () => {
  assert.match(css, /\.home-screen \.lottery-switcher > \.lottery-switcher-hit-grid > \.lottery-card\s*\{[\s\S]*?filter:\s*brightness\(\.72\) saturate\(\.78\)/);
  assert.match(css, /\.home-screen \.lottery-switcher > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\][\s\S]*?filter:\s*brightness\(1\) saturate\(1\)/);
  assert.match(css, /\.home-screen \.latest-draw-card\s*\{[\s\S]*?background-blend-mode:\s*multiply/);
  assert.match(css, /\.home-screen \.matrix-status-section > \.home-asset-image[\s\S]*?filter:\s*brightness\(\.72\) saturate\(\.8\)/);
  assert.match(css, /\.home-screen \.home-shortcut img[\s\S]*?filter:\s*brightness\(\.7\) saturate\(\.76\)/);
  assert.match(css, /\.home-screen \.bottom-navigation-artwork[\s\S]*?filter:\s*brightness\(\.7\) saturate\(\.62\)/);
  assert.match(css, /\.home-screen \.matrix-core-banner[\s\S]*?animation:\s*matrix-core-pulse 8s ease-in-out infinite/);
});

test("current Matrix status is highlighted by the hit cell rather than filtering a transparent button", () => {
  assert.match(css, /\.home-screen \.matrix-status-hit-grid > button\[data-active="true"\][\s\S]*?box-shadow:/);
  assert.doesNotMatch(css, /\.home-screen \.matrix-status-hit-grid > button\[data-active="true"\][\s\S]*?filter:\s*drop-shadow/);
});

test("homepage hierarchy change does not introduce forced CSS overrides", () => {
  assert.doesNotMatch(css, /!important/);
});
