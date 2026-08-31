import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import { ruleBodies } from "./helpers/css-rules.mjs";

test("號碼對照單標題卡只顯示一個刷新與探索設定文字", () => {
  const source = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
  const start = source.indexOf('title="號碼對照單"');
  const end = source.indexOf('className="reference-query-panel"', start);
  const header = source.slice(start, end);

  assert.equal((header.match(/刷新<\/button>/g) ?? []).length, 1);
  assert.match(header, /<ReloadIcon className="reference-refresh-icon" \/>/);
  assert.match(header, /探索設定/);
});

test("刷新與探索設定共用標題卡控制項尺寸，刷新圖示縮減為 8px", () => {
  const responsiveCss = readFileSync(new URL("../src/responsive-feature-pages.css", import.meta.url), "utf8");

  const actionBodies = ruleBodies(responsiveCss, /^\.number-reference-screen \.matrix-title-banner-actions$/);
  assert.equal(actionBodies.length, 1);
  assert.match(actionBodies[0], /width:\s*auto;/);
  assert.match(actionBodies[0], /min-width:\s*0;/);

  const titleBodies = ruleBodies(responsiveCss, /^\.number-reference-screen \.reference-title-actions$/);
  assert.ok(titleBodies.some((body) => /width:\s*auto;/.test(body)));
  assert.ok(titleBodies.some((body) => /gap:\s*6px;/.test(body)));
  const iconBodies = ruleBodies(responsiveCss, /^\.reference-refresh-icon$/);
  assert.equal(iconBodies.length, 1);
  assert.match(iconBodies[0], /width:\s*8px;/);
  assert.match(iconBodies[0], /height:\s*8px;/);
  assert.match(iconBodies[0], /flex:\s*0 0 8px;/);
});


test("刷新按鈕不再覆寫共用控制項圖示尺寸", () => {
  const responsiveCss = readFileSync(new URL("../src/responsive-feature-pages.css", import.meta.url), "utf8");
  assert.doesNotMatch(responsiveCss, /\.number-reference-screen \.reference-refresh-trigger > svg\s*\{/);
});
