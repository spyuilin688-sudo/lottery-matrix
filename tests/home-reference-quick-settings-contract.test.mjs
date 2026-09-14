import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const homeCss = readFileSync(new URL("../src/homepage/base.css", import.meta.url), "utf8");
const logoCss = readFileSync(new URL("../src/homepage/logo-spacing.css", import.meta.url), "utf8");
const featureCss = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const navigationCss = readFileSync(new URL("../src/prototype.css", import.meta.url), "utf8");

test("首頁內容由安全區頂部開始排列且不再把剩餘高度堆到 Logo 上方", () => {
  assert.match(
    homeCss,
    /\.home-screen\s*\{[^}]*inset:\s*0;[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\);[^}]*padding-top:\s*var\(--layout-safe-area-top\);/s,
  );
  assert.match(
    homeCss,
    /\.home-screen \.home-layout\s*\{[^}]*grid-template-rows:\s*auto auto;[^}]*align-content:\s*start;[^}]*padding-top:\s*0;/s,
  );
  assert.doesNotMatch(
    homeCss,
    /\.home-screen \.home-layout\s*\{[^}]*align-content:\s*safe end;/s,
  );
});

test("首頁狀態卡間距為 4px 且彩種圖示維持核准位置", () => {
  assert.match(
    homeCss,
    /\.home-screen \.matrix-status-card-grid\s*\{[^}]*gap:\s*4px;/s,
  );
  assert.match(
    homeCss,
    /\.home-screen \.matrix-status-lottery-logo\s*\{[^}]*left:\s*calc\(83\.5% - 24px\);/s,
  );
});

test("號碼對照單第二列與浮動設定共用 26px 控制高度", () => {
  assert.match(
    featureCss,
    /\.reference-query-panel\s*\{[^}]*--reference-control-height:\s*26px;/s,
  );
  assert.match(
    featureCss,
    /\.reference-query-panel \.reference-search input,\s*\.reference-query-panel \.reference-search \.gold-button\s*\{[^}]*height:\s*var\(--reference-control-height\);/s,
  );
  assert.doesNotMatch(
    featureCss,
    /\.reference-search input,\s*\.reference-search \.gold-button\s*\{[^}]*height:\s*36px;/s,
  );
  assert.match(
    featureCss,
    /\.reference-search input\s*\{[^}]*min-width:\s*0;[^}]*border:\s*1px solid #6e4a1e;[^}]*background:\s*#030a10;[^}]*color:\s*#efe8dc;[^}]*text-align:\s*center;/s,
  );
});

test("首頁快捷設定位於 Logo 卡右上角並維持 44px 觸控區", () => {
  assert.match(
    logoCss,
    /\.home-screen \.home-brand-frame > \.header-settings-button\s*\{[^}]*position:\s*absolute;[^}]*top:\s*0;[^}]*right:\s*0;/s,
  );
  assert.match(
    navigationCss,
    /\.header-settings-button\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;[^}]*place-items:\s*center;/s,
  );
  assert.match(
    navigationCss,
    /\.header-settings-button svg\s*\{[^}]*width:\s*22px;[^}]*height:\s*22px;/s,
  );
  assert.doesNotMatch(navigationCss, /\.bottom-navigation-quick-settings\s*\{/);
});
