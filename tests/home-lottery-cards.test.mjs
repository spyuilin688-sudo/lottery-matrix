import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const css = readLocalCss("src/homepage-repair.css");
const prototype = readFileSync(new URL("../src/Prototype.tsx", import.meta.url), "utf8");

test("homepage uses four equal lottery card surfaces with independent logos", () => {
  assert.match(css, /\.lottery-switcher--home-style \.lottery-switcher-hit-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);[^}]*gap:\s*6px;/s);
  assert.match(prototype, /home-switcher-box" independentLogos/);
  for (const asset of ["jincai-539-logo.png", "fantasy-5-logo.png", "mark-six-logo.png", "lotto-649-logo.png"]) {
    assert.match(prototype, new RegExp(asset.replace(".", "\\.")));
  }
  assert.match(prototype, /independentLogos \? <img className="lottery-card-logo"/);
});

test("homepage logo content boxes are equal and visual weight uses per-lottery scale tokens", () => {
  assert.match(css, /\.lottery-switcher--home-style\.lottery-switcher--independent-logos \.lottery-card-logo\s*\{[^}]*width:\s*76%;[^}]*height:\s*76%;[^}]*object-fit:\s*contain;/s);
  assert.match(css, /data-lottery="今彩539"[^}]*\{[^}]*--lottery-logo-scale:\s*\.88;/);
  assert.match(css, /data-lottery="天天樂"[^}]*\{[^}]*--lottery-logo-scale:\s*\.96;/);
  assert.match(css, /data-lottery="六合彩"[^}]*\{[^}]*--lottery-logo-scale:\s*1\.1;/);
  assert.match(css, /data-lottery="大樂透"[^}]*\{[^}]*--lottery-logo-scale:\s*1\.08;/);
});

test("homepage unselected logos stay readable without changing the shared status switcher", () => {
  assert.match(css, /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card:not\(\[data-selected="true"\]\)\s*\{[^}]*grayscale\(\.65\) brightness\(\.72\);/s);
  assert.match(css, /\.lottery-switcher--home-style\.lottery-switcher--independent-logos > \.lottery-switcher-hit-grid > \.lottery-card:not\(\[data-selected="true"\]\)\s*\{[^}]*grayscale\(\.35\) brightness\(\.82\);/s);
});
