import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const homeCss = readFileSync(new URL("../src/homepage/base.css", import.meta.url), "utf8");
const featureCss = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const navigationCss = readFileSync(new URL("../src/prototype.css", import.meta.url), "utf8");

test("首頁內容由安全區頂部開始排列且不再把剩餘高度堆到 Logo 上方", () => {
  assert.match(
    homeCss,
    /\.home-screen \.home-layout\s*\{[^}]*align-content:\s*safe start;[^}]*padding-top:\s*var\(--layout-safe-area-top\);/s,
  );
  assert.doesNotMatch(
    homeCss,
    /\.home-screen \.home-layout\s*\{[^}]*align-content:\s*safe end;/s,
  );
});

test("首頁狀態卡間距為 0.8px 且彩種圖示向左移動 6px", () => {
  assert.match(
    homeCss,
    /\.home-screen \.matrix-status-card-grid\s*\{[^}]*gap:\s*0\.8px;/s,
  );
  assert.match(
    homeCss,
    /\.home-screen \.matrix-status-lottery-logo\s*\{[^}]*left:\s*calc\(83\.5% - 24px\);/s,
  );
});

test("號碼對照單第二列與浮動設定共用 Matrix 同星的 44px 控制高度", () => {
  assert.match(
    featureCss,
    /\.reference-query-panel\s*\{[^}]*--reference-control-height:\s*44px;/s,
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
    /\.reference-search input,\s*\.note-form input\s*\{[^}]*min-width:\s*0;[^}]*border:\s*1px solid #6e4a1e;[^}]*background:\s*#030a10;[^}]*color:\s*#efe8dc;[^}]*text-align:\s*center;/s,
  );
  assert.match(featureCss, /\.note-form input\s*\{[^}]*height:\s*42px;/s);
});

test("首頁快捷設定移至左側安全邊界 6px 並等比例縮小 10%", () => {
  assert.match(
    navigationCss,
    /\.bottom-navigation-quick-settings\s*\{[^}]*left:\s*max\(6px, env\(safe-area-inset-left, 0px\)\);[^}]*right:\s*auto;[^}]*width:\s*44px;[^}]*height:\s*44px;[^}]*place-items:\s*end start;/s,
  );
  assert.match(
    navigationCss,
    /\.bottom-navigation-quick-settings-visual\s*\{[^}]*width:\s*22\.95px;[^}]*height:\s*22\.95px;[^}]*border-radius:\s*7\.65px;/s,
  );
  assert.match(
    navigationCss,
    /\.bottom-navigation-quick-settings svg\s*\{[^}]*width:\s*12\.15px;[^}]*height:\s*12\.15px;/s,
  );
  assert.doesNotMatch(
    navigationCss,
    /\.bottom-navigation-quick-settings\s*\{[^}]*right:\s*max\(5px,/s,
  );
});

test("首頁快捷設定保留一般手機兩次點擊的有效時間", () => {
  const navigationSource = readFileSync(new URL("../src/BottomNavigation.tsx", import.meta.url), "utf8");
  assert.match(navigationSource, /const QUICK_SETTINGS_DOUBLE_TAP_MS = 800;/);
});
