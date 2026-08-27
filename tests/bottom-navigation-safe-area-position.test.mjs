import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const navigationCss = await readFile(new URL("../src/prototype.css", import.meta.url), "utf8");
const tokenCss = await readFile(new URL("../src/design-tokens.css", import.meta.url), "utf8");
const runtimeCss = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const homepageCss = readLocalCss("src/homepage-repair.css");

test("底部導覽固定貼底並以瀏覽器 safe area 為唯一底部安全區來源", () => {
  assert.match(navigationCss, /\.bottom-navigation\s*\{[\s\S]*?--bottom-nav-safe-area:\s*env\(safe-area-inset-bottom,\s*0px\);[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*auto 0 0;/);
  assert.match(navigationCss, /height:\s*calc\(var\(--bottom-navigation-height\) \+ var\(--bottom-nav-safe-area\)\);/);
  assert.match(navigationCss, /padding:\s*0 0 var\(--bottom-nav-safe-area\);/);
  assert.doesNotMatch(navigationCss, /\.bottom-navigation\s*\{[^}]*?(?:margin(?:-[a-z]+)?\s*:\s*-|transform\s*:|top\s*:)/s);
});

test("fixed 底部導覽不被 mobile-page transform 改變定位基準", () => {
  assert.doesNotMatch(navigationCss, /\.mobile-page:has\(\.bottom-navigation\)\s*\{[^}]*transform\s*:/s);
});

test("Android viewport 不再額外上縮 device safe area", () => {
  assert.doesNotMatch(runtimeCss, /\.mobile-app-viewport\[data-platform="android"\]\[data-keyboard-visible="false"\]\s*\{[^}]*bottom\s*:\s*var\(--device-safe-area-bottom,\s*48px\)/s);
});

test("內容底部只保留導覽高度加瀏覽器安全區", () => {
  assert.match(tokenCss, /--bottom-navigation-height:\s*72px;/);
  assert.match(tokenCss, /--layout-bottom-nav-clearance:\s*calc\(var\(--bottom-navigation-height\) \+ env\(safe-area-inset-bottom,\s*0px\)\);/);
  assert.doesNotMatch(tokenCss, /--layout-bottom-nav-clearance:[^;]*var\(--mobile-safe-area-height/);
  assert.doesNotMatch(tokenCss, /--layout-bottom-nav-clearance:[^;]*\+\s*12px/);
  assert.match(navigationCss, /\.bottom-nav-brand-screen:not\(\.notifications-screen\) > \.feature-body\s*\{\s*padding-bottom:\s*var\(--layout-bottom-nav-clearance\);\s*\}/);
});

test("首頁五大功能與固定底部導覽實際維持 8px 且不靠位移補償", () => {
  assert.match(homepageCss, /\.home-screen \.home-layout\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\) auto;[^}]*padding-bottom:\s*var\(--layout-bottom-nav-clearance\);/s);
  assert.match(homepageCss, /\.home-screen \.home-bottom-group\s*\{[^}]*padding-bottom:\s*8px;/s);
  assert.doesNotMatch(homepageCss, /\.home-screen \.home-bottom-group\s*\{[^}]*(?:\n\s*|;\s*)(?:transform|bottom|margin-block-end)\s*:/s);
  assert.doesNotMatch(homepageCss, /\.home-screen \.home-layout\s*\{[^}]*var\(--mobile-safe-area-height/s);
});

test("狀態卡與 Matrix Core 使用單一 8px 間距來源並由彈性狀態區承接剩餘高度", () => {
  assert.match(homepageCss, /--home-gap-status-core:\s*8px;/);
  assert.match(homepageCss, /\.home-screen \.matrix-status-section\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;/s);
  assert.match(homepageCss, /\.home-screen \.matrix-status-card-grid\s*\{[^}]*height:\s*100%;[^}]*align-content:\s*end;/s);
  assert.match(homepageCss, /\.home-screen \.home-bottom-group\s*\{[^}]*margin-block-start:\s*var\(--home-gap-status-core\);/s);
  assert.doesNotMatch(homepageCss, /\.home-screen \.home-bottom-group\s*\{[^}]*margin-block-start:\s*16px;/s);
});
