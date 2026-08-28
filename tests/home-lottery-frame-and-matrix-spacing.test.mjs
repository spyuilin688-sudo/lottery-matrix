import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const prototype = read("src/Prototype.tsx");
const switcher = read("src/homepage/lottery-switcher.css");
const spacing = read("src/matrix-explore-spacing.css");
const pages = read("src/FeaturePages.tsx");

test("首頁彩種在選取後只保留單一 0.7px 響應式八角外框", () => {
  assert.doesNotMatch(prototype, /className="lottery-selected-frame"/);
  assert.match(
    switcher,
    /\.lottery-card\[data-selected="true"\]::after\s*\{[^}]*display:\s*none;/s,
  );
  const selectedFrame = switcher.match(/\.lottery-card\[data-selected="true"\]::before\s*\{([^}]*)\}/s)?.[1] ?? "";
  assert.match(selectedFrame, /--matrix-selected-frame-width:\s*\.7px;/);
  assert.doesNotMatch(selectedFrame, /clip-path/);
  assert.match(selectedFrame, /var\(--lottery-selected-horizontal-gradient\)/);
  assert.match(selectedFrame, /var\(--lottery-selected-left-edge\)/);
  assert.match(selectedFrame, /var\(--lottery-selected-right-edge\)/);
  assert.doesNotMatch(selectedFrame, /(?:-webkit-)?mask|mask-composite/);
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


test("天工探索期數以下沿用相同右側欄寬，且彩球類型與探索期數保留 10px 間距", () => {
  assert.match(
    spacing,
    /\.matrix-tiangong-screen \.tiangong-settings\s*\{[^}]*--tiangong-label-column:\s*88\.8px;/s,
  );
  assert.match(
    spacing,
    /\.tiangong-general-settings \.setting-grid > label:first-child \+ label\s*\{[^}]*margin-top:\s*10px;/s,
  );
  assert.match(
    spacing,
    /@media \(min-width:\s*40rem\)[\s\S]*?\.matrix-tiangong-screen \.tiangong-settings\s*\{[^}]*--tiangong-label-column:\s*104\.8px;/s,
  );
});
