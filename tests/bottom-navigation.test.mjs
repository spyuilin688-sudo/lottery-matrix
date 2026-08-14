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

test("底部導覽在 390px 基準畫布全寬固定於底部", () => {
  assert.match(tokenCss, /--bottom-navigation-height:\s*95px;/);
  assert.match(navigationCss, /position:\s*fixed;/);
  assert.match(navigationCss, /inset:\s*auto 0 0;/);
  assert.match(navigationCss, /width:\s*100%;/);
  assert.doesNotMatch(homeCss, /home-layout > \.bottom-navigation/);
});

test("正式樣式不再保留重複的選取態規則", () => {
  const selectedItemRules = navigationCss.match(/\.bottom-navigation-item\[data-selected="true"\]\s*\{/g) ?? [];
  assert.equal(selectedItemRules.length, 1);
});
