import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const prototype = read("src/Prototype.tsx");
const switcher = read("src/homepage/lottery-switcher.css");
const spacing = read("src/matrix-explore-spacing.css");
const featureCss = read("src/feature-pages.css");
const pages = readFeaturePagesSource();

test("首頁彩種以單層圓角框、淡金底與 Logo 透明度表示選取狀態", () => {
  assert.doesNotMatch(prototype, /className="lottery-selected-frame"/);
  assert.match(switcher, /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\s*\{[^}]*border:\s*1px solid color-mix\(in srgb, var\(--home-frame-gold\) 22%, transparent\);[^}]*border-radius:\s*var\(--home-frame-radius\);[^}]*background:\s*var\(--lottery-neutral-950\);/s);
  assert.match(switcher, /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]\s*\{[^}]*border-color:\s*color-mix\(in srgb, var\(--home-frame-bright\) 55%, transparent\);[^}]*background:\s*color-mix\(in srgb, var\(--home-frame-gold\) 6%, var\(--lottery-neutral-950\)\);/s);
  assert.match(switcher, /\.lottery-switcher--home-style \.lottery-selector-logo\s*\{[^}]*opacity:\s*\.6;/s);
  assert.match(switcher, /\.lottery-card\[data-selected="true"\] \.lottery-selector-logo\s*\{\s*opacity:\s*1;/);
  assert.doesNotMatch(switcher, /background-blend-mode|Matrixbba/);
  assert.doesNotMatch(switcher, /\.lottery-card(?:\[data-selected="true"\])?::(?:before|after)\s*\{/);
});

test("探索命中列無分隔線，天工階段之間保留 8px 金色分隔", () => {
  assert.match(
    spacing,
    /\.matrix-explore-main-screen \.hit-options\s*\{[^}]*margin:\s*0;[^}]*padding:\s*0;/s,
  );
  assert.doesNotMatch(spacing, /\.matrix-explore-main-screen \.hit-options\s*\{[^}]*border-bottom:/s);
  assert.match(
    pages,
    /className="tiangong-setting-row tiangong-advanced-divider"[^>]*aria-label="天工球位"/s,
  );
  // 12a4f59 removed the old general-settings divider and aligned stage spacing.
  assert.doesNotMatch(spacing, /\.tiangong-advanced-divider(?:\s|\{|\+)/);
  assert.match(spacing, /\.matrix-tiangong-screen \.tiangong-stage-settings \.tiangong-stage-block \+ \.tiangong-stage-block\s*\{[^}]*margin-top:\s*8px;[^}]*padding-top:\s*8px;[^}]*border-top:\s*1px solid var\(--pwa-frame-secondary\);/s);
});

test("天工指定選項共用探索期數的右側欄寬並平均分配", () => {
  assert.match(
    spacing,
    /\.matrix-tiangong-screen \.tiangong-settings \.setting-grid > label > \.segmented,[\s\S]*?\.matrix-tiangong-screen \.tiangong-settings \.tiangong-setting-row > \.segmented,[\s\S]*?\.matrix-tiangong-screen \.tiangong-general-settings \.tiangong-advanced-panel label > \.segmented\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;/s,
  );
  assert.match(
    spacing,
    /\.matrix-explore-main-screen \.segmented\.two\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s,
  );
  assert.match(
    spacing,
    /\.matrix-explore-main-screen \.segmented\.three\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/s,
  );
});


test("天工一般設定沿用共用右側欄寬，不再疊加舊版列外距", () => {
  assert.match(
    spacing,
    /\.matrix-tiangong-screen \.tiangong-settings\s*\{[^}]*--tiangong-label-column:\s*88\.8px;/s,
  );
  assert.match(
    spacing,
    /\.matrix-tiangong-screen \.tiangong-general-settings \.setting-grid\s*\{[^}]*row-gap:\s*0;/s,
  );
  assert.doesNotMatch(spacing, /\.tiangong-general-settings \.setting-grid > (?:\* \+ \*|label:first-child \+ label)/);
  assert.match(featureCss, /\.matrix-tiangong-screen \.tiangong-settings \.tiangong-setting-row\s*\{[^}]*margin:\s*0;[^}]*padding:\s*0;[^}]*grid-template-columns:\s*var\(--tiangong-label-column\) minmax\(0, 1fr\);/s);
  assert.match(
    spacing,
    /@media \(min-width:\s*40rem\)[\s\S]*?\.matrix-tiangong-screen \.tiangong-settings\s*\{[^}]*--tiangong-label-column:\s*104\.8px;/s,
  );
});
