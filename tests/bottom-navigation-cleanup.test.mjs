import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const prototype = await readFile(new URL("../src/prototype.css", import.meta.url), "utf8");
const homepage = readLocalCss("src/homepage-repair.css");

test("底部導覽只由共用樣式控制，不再受首頁覆寫", () => {
  assert.doesNotMatch(homepage, /\.bottom-navigation/);
  assert.doesNotMatch(prototype, /calc\(var\(--layout-bottom-nav-clearance\) \+ 36px\)/);
});

test("底部導覽不再使用可拉伸裝飾底圖，正式容器直接貼底", () => {
  const navigationRule = prototype.match(/\.bottom-navigation\s*\{[^}]+\}/s)?.[0] ?? "";

  assert.doesNotMatch(prototype, /\.bottom-navigation-artwork\s*\{/);
  assert.match(navigationRule, /inset:\s*auto 0 0;/);
  assert.match(navigationRule, /width:\s*100%;/);
  assert.match(navigationRule, /height:\s*calc\(var\(--bottom-navigation-height\) \+ var\(--bottom-nav-safe-area\)\);/);
  assert.doesNotMatch(navigationRule, /-2%|-1px|104%|\+ 2px/);
});
