import test from "node:test";
import assert from "node:assert/strict";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const css = readLocalCss("src/homepage-repair.css");

test("homepage uses four equal lottery card surfaces with the previous artwork", () => {
  assert.match(css, /\.lottery-switcher--home-style \.lottery-switcher-hit-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);[^}]*gap:\s*6px;/s);
  assert.match(css, /\.lottery-switcher--home-style[^}]*\.lottery-card\s*\{[^}]*background-image:\s*url\("\/assets\/lottery\/status\/Matrixbba\.png"\);/s);
  assert.match(css, /\.lottery-switcher--home-style[^}]*\.lottery-card\s*\{[^}]*background-size:\s*calc\(400% \+ 24px\) 100%;/s);
});

test("each lottery button restores its previous artwork quarter and logo size", () => {
  assert.match(css, /data-lottery="今彩539"[^}]*\{[^}]*background-position:\s*0% 50%/);
  assert.match(css, /data-lottery="天天樂"[^}]*\{[^}]*background-position:\s*33\.333% 50%/);
  assert.match(css, /data-lottery="六合彩"[^}]*\{[^}]*background-position:\s*66\.667% 50%/);
  assert.match(css, /data-lottery="大樂透"[^}]*\{[^}]*background-position:\s*100% 50%/);
  assert.doesNotMatch(css, /lottery-card-logo|--lottery-logo-scale|lottery-switcher--independent-logos/);
});

test("homepage keeps the approved unselected readability adjustment", () => {
  assert.match(css, /\.home-screen \.home-switcher-box > \.lottery-switcher-hit-grid > \.lottery-card:not\(\[data-selected="true"\]\)\s*\{[^}]*grayscale\(\.35\) brightness\(\.82\);/s);
});
