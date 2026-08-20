import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tokens = readFileSync(new URL("../src/design-tokens.css", import.meta.url), "utf8");
const baseCss = readFileSync(new URL("../src/prototype.css", import.meta.url), "utf8");
const featureCss = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const exploreCss = readFileSync(new URL("../src/matrix-explore-spacing.css", import.meta.url), "utf8");
const tongxingCss = readFileSync(new URL("../src/tongxing-compact.css", import.meta.url), "utf8");

test("全專案按鈕由單一 24px 高度與緊湊文字圖示尺寸控制", () => {
  assert.match(tokens, /--button-height:\s*24px;/);
  assert.match(tokens, /--button-font-size:\s*10px;/);
  assert.match(tokens, /--button-icon-size:\s*14px;/);
  assert.match(baseCss, /button\s*\{[^}]*height:\s*var\(--button-height\);[^}]*min-height:\s*var\(--button-height\);[^}]*font-size:\s*var\(--button-font-size\);/s);
  assert.match(baseCss, /button svg,[\s\S]*?button img\s*\{[^}]*max-width:\s*var\(--button-icon-size\);[^}]*max-height:\s*var\(--button-icon-size\);/s);
});

test("全專案頁面左右間距使用正式 12px token 且移除探索與同星衝突值", () => {
  assert.match(tokens, /--layout-page-inline:\s*12px;/);
  assert.match(featureCss, /\.feature-body\s*\{[^}]*padding-inline:\s*var\(--layout-page-inline\);/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.feature-body\s*\{[^}]*padding:\s*0 var\(--layout-page-inline\) 1rem;/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.matrix-title-banner\s*\{[^}]*width:\s*calc\(100% - var\(--layout-page-inline\) - var\(--layout-page-inline\)\);/s);
  assert.match(tongxingCss, /\.tongxing-screen \.feature-body\s*\{[^}]*padding-inline:\s*var\(--layout-page-inline\);/s);
  assert.doesNotMatch(exploreCss, /padding:\s*0 16px 1rem|width:\s*calc\(100% - 32px\)/);
  assert.doesNotMatch(tongxingCss, /padding-left:\s*8px|padding-right:\s*16px/);
});

test("探索標籤與文字分欄顯示且探索日期三個選項置中", () => {
  assert.match(exploreCss, /\.matrix-explore-main-screen \.segmented button em\s*\{[^}]*position:\s*static;[^}]*flex:\s*0 0 auto;/s);
  assert.doesNotMatch(exploreCss, /\.matrix-explore-main-screen \.segmented button em\s*\{[^}]*position:\s*absolute;/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.advanced-panel \.segmented\.three button\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*center;[^}]*text-align:\s*center;/s);
});

test("探索近10期表格使用緊湊表頭資料列與更大的號碼欄", () => {
  assert.match(exploreCss, /grid-template-columns:\s*minmax\(48px, \.8fr\) minmax\(62px, 1fr\) minmax\(0, 3\.55fr\);/);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-row,[\s\S]*?min-height:\s*32px;[\s\S]*?padding:\s*0;/);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-row\.history-head\s*\{[^}]*min-height:\s*24px;/s);
  assert.match(exploreCss, /\.matrix-explore-main-screen \.history-row:has\(\.history-numbers\[data-has-special="true"\]\)\s*\{[^}]*min-height:\s*36px;/s);
});
