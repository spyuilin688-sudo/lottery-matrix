import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const navigationCss = await readFile(new URL("../src/prototype.css", import.meta.url), "utf8");
const tokenCss = await readFile(new URL("../src/design-tokens.css", import.meta.url), "utf8");
const runtimeCss = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const homepageCss = await readFile(new URL("../src/homepage-repair.css", import.meta.url), "utf8");

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
  assert.match(tokenCss, /--bottom-navigation-height:\s*82px;/);
  assert.match(tokenCss, /--layout-bottom-nav-clearance:\s*calc\(var\(--bottom-navigation-height\) \+ env\(safe-area-inset-bottom,\s*0px\)\);/);
  assert.doesNotMatch(tokenCss, /--layout-bottom-nav-clearance:[^;]*var\(--mobile-safe-area-height/);
  assert.doesNotMatch(tokenCss, /--layout-bottom-nav-clearance:[^;]*\+\s*12px/);
  assert.match(navigationCss, /\.bottom-nav-brand-screen:not\(\.notifications-screen\) > \.feature-body\s*\{\s*padding-bottom:\s*var\(--layout-bottom-nav-clearance\);\s*\}/);
});

test("首頁不再用 mobile safe-area 變數重複撐高底部空白", () => {
  assert.match(homepageCss, /\.home-screen \.home-layout\s*\{\s*padding-bottom:\s*var\(--layout-bottom-nav-clearance\);\s*\}/);
  assert.doesNotMatch(homepageCss, /\.home-screen \.home-layout\s*\{[^}]*var\(--mobile-safe-area-height/s);
});
