import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import { ruleBodies } from "./helpers/css-rules.mjs";

test("號碼對照單標題卡只顯示一個刷新與探索設定文字", () => {
  const source = readFeaturePagesSource();
  const start = source.indexOf('title="號碼對照單"');
  const end = source.indexOf('className="reference-query-panel"', start);
  const header = source.slice(start, end);

  assert.equal((header.match(/刷新<\/button>/g) ?? []).length, 1);
  assert.match(header, /<ReloadIcon className="reference-refresh-icon" \/>/);
  assert.match(header, /探索設定/);
});

test("刷新與探索設定共用標題卡控制項尺寸，刷新圖示縮減為 8px [header migration]", () => {
  const css = readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
  const actions = ruleBodies(css, /^\.product-header__actions$/);
  assert.equal(actions.length, 1);
  assert.match(actions[0], /grid-area:\s*actions;/);
  assert.match(actions[0], /min-width:\s*0;/);
  assert.doesNotMatch(actions[0], /translate|position:\s*absolute/);
  const responsiveCss = readFileSync(new URL('../src/responsive-feature-pages.css', import.meta.url), 'utf8');
  const icon = ruleBodies(responsiveCss, /^\.reference-refresh-icon$/);
  assert.equal(icon.length, 1);
  assert.match(icon[0], /width:\s*8px;/);
  assert.match(icon[0], /height:\s*8px;/);
});


test("刷新按鈕不再覆寫共用控制項圖示尺寸", () => {
  const responsiveCss = readFileSync(new URL("../src/responsive-feature-pages.css", import.meta.url), "utf8");
  assert.doesNotMatch(responsiveCss, /\.number-reference-screen \.reference-refresh-trigger > svg\s*\{/);
});

