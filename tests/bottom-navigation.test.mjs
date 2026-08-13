import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const navigationSource = await readFile(new URL("../src/BottomNavigation.tsx", import.meta.url), "utf8");
const navigationCss = await readFile(new URL("../src/prototype.css", import.meta.url), "utf8");
const tokenCss = await readFile(new URL("../src/design-tokens.css", import.meta.url), "utf8");
const homeCss = await readFile(new URL("../src/homepage-repair.css", import.meta.url), "utf8");

test("底部導覽只保留四個既有入口與動態選取狀態", () => {
  for (const label of ["首頁", "快捷", "通知", "我的"]) {
    assert.match(navigationSource, new RegExp(`label: "${label}"`));
  }
  assert.match(navigationSource, /data-selected=\{selected\}/);
  assert.match(navigationSource, /aria-current=\{selected \? "page" : undefined\}/);
  assert.doesNotMatch(navigationSource, /bottom-navigation-brand-core/);
});

test("底部導覽採 390px 基準的 382 × 93 參考圖比例", () => {
  assert.match(tokenCss, /--bottom-navigation-height:\s*93px;/);
  assert.match(navigationCss, /width:\s*min\(calc\(100% - 8px\),\s*382px\);/);
  assert.match(homeCss, /width:\s*min\(calc\(100% - 8px\),\s*382px\);/);
  assert.match(navigationCss, /\.bottom-navigation-active-bar\s*\{[^}]*width:\s*4px;[^}]*height:\s*4px;/s);
  assert.match(navigationCss, /\.bottom-navigation-item\[data-selected="true"\][^{]*\.bottom-navigation-active-bar\s*\{[^}]*width:\s*16px;[^}]*height:\s*3px;/s);
});

test("正式樣式不再保留重複的選取態規則", () => {
  const selectedItemRules = navigationCss.match(/\.bottom-navigation-item\[data-selected="true"\]\s*\{/g) ?? [];
  assert.equal(selectedItemRules.length, 1);
});
