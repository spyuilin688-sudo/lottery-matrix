import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const prototype = await readFile(new URL("../src/prototype.css", import.meta.url), "utf8");
const homepage = await readFile(new URL("../src/homepage-repair.css", import.meta.url), "utf8");

test("底部導覽只由共用樣式控制，不再受首頁覆寫", () => {
  assert.doesNotMatch(homepage, /\.bottom-navigation/);
  assert.doesNotMatch(prototype, /calc\(var\(--layout-bottom-nav-clearance\) \+ 36px\)/);
});

test("底部導覽底圖不使用超寬、負位移或額外高度強制拉伸", () => {
  const artworkRule = prototype.match(/\.bottom-navigation-artwork\s*\{[^}]+\}/s)?.[0] ?? "";

  assert.match(artworkRule, /inset:\s*0;/);
  assert.match(artworkRule, /width:\s*100%;/);
  assert.match(artworkRule, /height:\s*var\(--bottom-navigation-height\);/);
  assert.doesNotMatch(artworkRule, /-2%|-1px|104%|\+ 2px/);
});
