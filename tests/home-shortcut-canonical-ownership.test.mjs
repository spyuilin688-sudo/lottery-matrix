import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const base = readFileSync(new URL("../src/homepage/base.css", import.meta.url), "utf8");
const visual = readFileSync(new URL("../src/homepage/visual-language.css", import.meta.url), "utf8");

test("四大功能的外距、間距與高度只由 base.css 的共用變數控制", () => {
  assert.match(base, /--home-feature-inline:\s*16px;/);
  assert.match(base, /--home-feature-gap:\s*6px;/);
  assert.match(base, /\.home-screen \.home-shortcut-row\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);[^}]*width:\s*calc\(100% - var\(--home-feature-inline\) \* 2\);[^}]*gap:\s*var\(--home-feature-gap\);/s);
  assert.match(base, /\.home-screen \.home-shortcut\s*\{[^}]*height:\s*76px;[^}]*min-height:\s*76px;/s);
});

test("四大功能的低亮度細金框與互動狀態只由 base.css 擁有", () => {
  assert.match(base, /\.home-screen \.home-shortcut\s*\{[^}]*border:\s*1px solid var\(--home-frame-muted\);[^}]*border-radius:\s*var\(--home-frame-radius\);/s);
  assert.doesNotMatch(base, /\.home-screen \.home-shortcut::(?:before|after)\s*\{/);
  assert.match(base, /\.home-screen \.home-shortcut:active\s*\{/);
  assert.match(base, /\.home-screen \.home-shortcut:focus-visible\s*\{/);
  assert.doesNotMatch(visual, /\.home-screen \.home-shortcut(?:::before|::after|:active|:focus-visible)\s*\{/);
  assert.doesNotMatch(visual, /--home-octagon-frame/);
});
