import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const navigationSource = await readFile(new URL("../src/BottomNavigation.tsx", import.meta.url), "utf8");
const navigationCss = await readFile(new URL("../src/prototype.css", import.meta.url), "utf8");
const homeCss = readLocalCss("src/homepage-repair.css");

test("底部導覽只保留四個既有入口與動態選取狀態", () => {
  for (const label of ["首頁", "快捷", "計算機", "我的"]) {
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

test("底部導覽移除 PD01 裝飾，四個真實按鈕與選中態只有一個正式來源", () => {
  const selectedItemRules = navigationCss.match(/\.bottom-navigation-item\[data-selected="true"\]\s*\{/g) ?? [];
  assert.equal(selectedItemRules.length, 1);
  assert.doesNotMatch(navigationSource, /pd01-frame\.svg|pd01-active\.svg|bottom-navigation-artwork/);
  assert.match(navigationCss, /\.bottom-navigation\s*\{[^}]*border-top:\s*1px solid var\(--home-frame-muted\);/s);
  assert.match(navigationCss, /\.bottom-navigation-item\[data-selected="true"\]\s*\{[^}]*border-color:\s*var\(--home-frame-gold\);[^}]*background:\s*rgba\(214, 182, 111, \.10\);/s);
  assert.match(navigationSource, /className="bottom-navigation-label">\{label\}/);
  assert.doesNotMatch(navigationSource, /NAVIGATION_ARTWORK|matrixWW[1-4]\.png/);
});
