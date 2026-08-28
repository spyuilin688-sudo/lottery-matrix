import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const prototype = read("src/Prototype.tsx");
const switcher = read("src/homepage/lottery-switcher.css");
const spacing = read("src/matrix-explore-spacing.css");
const pages = read("src/FeaturePages.tsx");

test("首頁彩種在選取後只保留單一 0.7px SVG 八角外框", () => {
  assert.match(prototype, /isSelected\s*\?\s*\(\s*<svg[^>]*className="lottery-selected-frame"/s);
  assert.match(prototype, /<polygon[^>]*className="lottery-selected-frame-path"/s);
  assert.match(
    switcher,
    /\.lottery-card\[data-selected="true"\]::after\s*\{[^}]*display:\s*none;/s,
  );
  assert.match(
    switcher,
    /\.lottery-selected-frame-path\s*\{[^}]*stroke:\s*url\("#lottery-selected-gradient"\);[^}]*stroke-width:\s*\.7px;[^}]*vector-effect:\s*non-scaling-stroke;/s,
  );
  assert.doesNotMatch(
    switcher,
    /\.lottery-card\[data-selected="true"\]::before\s*\{[^}]*-webkit-mask:/s,
  );
});

test("探索、天衍與天工的進階設定分隔線上方間距統一為 6px", () => {
  assert.match(
    spacing,
    /\.matrix-explore-main-screen \.hit-options\s*\{[^}]*padding:\s*0 0 6px;[^}]*border-bottom:\s*1px solid rgba\(212, 165, 47, \.28\);/s,
  );
  assert.match(
    pages,
    /className="tiangong-setting-row tiangong-advanced-divider"[^>]*aria-label="探索球位"/s,
  );
  assert.match(
    spacing,
    /\.tiangong-advanced-divider\s*\{[^}]*padding-bottom:\s*6px;[^}]*border-bottom:\s*1px solid rgba\(212, 165, 47, \.28\);/s,
  );
});

test("天工指定選項共用探索期數的右側欄寬並平均分配", () => {
  assert.match(
    spacing,
    /\.tiangong-settings \.setting-grid > label > \.segmented,[\s\S]*?\.tiangong-settings \.tiangong-setting-row > \.segmented,[\s\S]*?\.tiangong-advanced-panel label > \.segmented\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;/s,
  );
  assert.match(
    spacing,
    /\.tiangong-settings \.segmented\.two\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s,
  );
  assert.match(
    spacing,
    /\.tiangong-settings \.segmented\.three\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/s,
  );
});
