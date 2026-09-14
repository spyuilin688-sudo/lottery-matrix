import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const prototype = read("src/Prototype.tsx");
const switcher = read("src/homepage/lottery-switcher.css");
const spacing = read("src/matrix-explore-spacing.css");
const pages = readFeaturePagesSource();

test("首頁彩種使用單層圓角框並以背景明暗表示選取狀態", () => {
  assert.doesNotMatch(prototype, /className="lottery-selected-frame"/);
  assert.match(switcher, /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\s*\{[^}]*border:\s*1px solid var\(--home-frame-muted\);[^}]*border-radius:\s*var\(--home-frame-radius\);[^}]*background-color:\s*rgba\(0, 0, 0, \.4\);[^}]*background-blend-mode:\s*multiply;/s);
  assert.match(switcher, /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]\s*\{[^}]*background-color:\s*transparent;/s);
  assert.doesNotMatch(switcher, /\.lottery-card(?:\[data-selected="true"\])?::(?:before|after)\s*\{/);
});

test("探索取消分隔線，天工進階設定保留 6px 分隔", () => {
  assert.match(
    spacing,
    /\.matrix-explore-main-screen \.hit-options\s*\{[^}]*margin:\s*0;[^}]*padding:\s*0;/s,
  );
  assert.doesNotMatch(spacing, /\.matrix-explore-main-screen \.hit-options\s*\{[^}]*border-bottom:/s);
  assert.match(
    pages,
    /className="tiangong-setting-row tiangong-advanced-divider"[^>]*aria-label="天工球位"/s,
  );
  assert.match(
    spacing,
    /\.matrix-tiangong-screen \.tiangong-general-settings \.tiangong-advanced-divider\s*\{[^}]*padding-bottom:\s*6px;[^}]*border-bottom:\s*1px solid rgba\(212, 165, 47, \.28\);/s,
  );
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
