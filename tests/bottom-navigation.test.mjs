import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const navigationSource = await readFile(new URL("../src/BottomNavigation.tsx", import.meta.url), "utf8");
const navigationCss = await readFile(new URL("../src/prototype.css", import.meta.url), "utf8");
const homeCss = readLocalCss("src/homepage-repair.css");

test("底部導覽只保留四個既有入口與動態選取狀態", () => {
  for (const label of ["首頁", "快捷", "通知", "我的"]) {
    assert.match(navigationSource, new RegExp(`label: "${label}"`));
  }
  assert.match(navigationSource, /data-selected=\{selected\}/);
  assert.match(navigationSource, /aria-current=\{selected \? "page" : undefined\}/);
  assert.doesNotMatch(navigationSource, /bottom-navigation-brand-core/);
});

test("底部導覽維持全寬且不受首頁專屬覆寫", () => {
  assert.match(navigationCss, /\.bottom-navigation\s*\{[^}]*width:\s*100%;/s);
  assert.doesNotMatch(homeCss, /home-layout > \.bottom-navigation/);
});

test("正式樣式由狀態底圖呈現選取態，不保留重複規則", () => {
  const selectedItemRules = navigationCss.match(/\.bottom-navigation-item\[data-selected="true"\]\s*\{/g) ?? [];
  assert.equal(selectedItemRules.length, 0);
  assert.match(navigationSource, /const NAVIGATION_ARTWORK:\s*Record<BottomNavigationLabel, string>/);
  assert.match(navigationSource, /src=\{NAVIGATION_ARTWORK\[displayedActive\]\}/);
});
