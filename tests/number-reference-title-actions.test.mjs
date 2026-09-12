import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import { ruleBodies } from "./helpers/css-rules.mjs";

test("號碼對照單標題卡只保留探索設定", () => {
  const source = readFileSync(new URL("../src/features/NumberReferencePage.tsx", import.meta.url), "utf8");
  const start = source.indexOf('title="號碼對照單"');
  const end = source.indexOf('headerSettings={', start);
  const header = source.slice(start, end);

  assert.doesNotMatch(header, /reference-refresh-trigger/);
  assert.match(header, /HeaderSettingsButton/);
});

test("三頁共用設定操作固定於標題卡右下各 4px，刷新使用設定區共用尺寸", () => {
  const css = readFileSync(new URL('../src/feature-pages.css', import.meta.url), 'utf8');
  const actions = ruleBodies(css, /^\.product-header__actions$/);
  assert.equal(actions.length, 1);
  assert.match(actions[0], /position:\s*absolute;/);
  assert.match(actions[0], /right:\s*4px;/);
  assert.match(actions[0], /bottom:\s*4px;/);
  assert.match(actions[0], /min-width:\s*0;/);
  assert.doesNotMatch(actions[0], /translate|!important/);
  const responsiveCss = readFileSync(new URL('../src/responsive-feature-pages.css', import.meta.url), 'utf8');
  const icon = ruleBodies(responsiveCss, /^\.tool-settings-reset > svg$/);
  assert.equal(icon.length, 1);
  assert.match(icon[0], /width:\s*10px;/);
  assert.match(icon[0], /height:\s*10px;/);
});


test("刷新按鈕不再覆寫共用控制項圖示尺寸", () => {
  const responsiveCss = readFileSync(new URL("../src/responsive-feature-pages.css", import.meta.url), "utf8");
  assert.doesNotMatch(responsiveCss, /\.number-reference-screen \.reference-refresh-trigger > svg\s*\{/);
});

