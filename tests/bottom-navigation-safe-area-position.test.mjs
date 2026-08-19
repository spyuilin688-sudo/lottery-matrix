import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const navigationCss = await readFile(new URL("../src/prototype.css", import.meta.url), "utf8");
const tokenCss = await readFile(new URL("../src/design-tokens.css", import.meta.url), "utf8");

test("底部導覽固定貼底並只把 safe area 算進導覽本身", () => {
  assert.match(navigationCss, /\.bottom-navigation\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*auto 0 0;/);
  assert.match(navigationCss, /--bottom-nav-safe-area:\s*max\(var\(--mobile-safe-area-height,\s*0px\),\s*env\(safe-area-inset-bottom,\s*0px\)\);/);
  assert.match(navigationCss, /height:\s*calc\(var\(--bottom-navigation-height\) \+ var\(--bottom-nav-safe-area\)\);/);
  assert.match(navigationCss, /padding:\s*0 0 var\(--bottom-nav-safe-area\);/);
  assert.doesNotMatch(navigationCss, /\.bottom-navigation\s*\{[^}]*?(?:margin(?:-[a-z]+)?\s*:\s*-|transform\s*:|top\s*:)/s);
});

test("內容底部保留導覽高度加安全區但不額外增加 12px 黑色空白", () => {
  assert.match(tokenCss, /--layout-bottom-nav-clearance:\s*calc\(var\(--bottom-navigation-height\) \+ max\(var\(--mobile-safe-area-height,\s*0px\), env\(safe-area-inset-bottom,\s*0px\)\)\);/);
  assert.doesNotMatch(tokenCss, /--layout-bottom-nav-clearance:[^;]*\+\s*12px/);
  assert.match(navigationCss, /\.bottom-nav-brand-screen:not\(\.notifications-screen\) > \.feature-body\s*\{\s*padding-bottom:\s*var\(--layout-bottom-nav-clearance\);\s*\}/);
});
