import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shared = readFileSync("src/features/shared.tsx", "utf8");
const css = readFileSync("src/feature-pages.css", "utf8");
const spacingCss = readFileSync("src/matrix-explore-spacing.css", "utf8");

test("Matrix settings switcher exposes readable labels and preserves page navigation", () => {
  const switcher = shared.slice(shared.indexOf("export function MatrixPageSwitcher"), shared.indexOf("export const ROAD_VALIDATION_SAMPLE_HISTORY"));
  for (const label of ["探索", "天衡", "天衍", "天工"]) {
    assert.ok(shared.includes('shortLabel: "' + label + '"'));
  }
  assert.ok(switcher.includes("{item.shortLabel}"));
  assert.ok(switcher.includes('aria-label={item.label}'));
  assert.ok(switcher.includes('aria-current={item.screen === current ? "page" : undefined}'));
  assert.ok(switcher.includes('onClick={() => onNavigate(item.screen)}'));
  assert.doesNotMatch(switcher, /<img|onScroll/);
});

test("Matrix settings switcher has one style owner and an explicit current-page state", () => {
  assert.doesNotMatch(spacingCss, /matrix-page-switcher/);
  assert.equal((css.match(/(?:^|\n)\.matrix-page-switcher\s*\{/g) ?? []).length, 1);
  assert.ok(css.includes('.matrix-page-switcher button[aria-current="page"]'));
  assert.ok(css.includes('.matrix-page-switcher button:focus-visible'));
  assert.doesNotMatch(css, /matrix-page-switcher-image--tianheng/);
});
