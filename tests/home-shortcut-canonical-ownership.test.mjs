import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const base = readFileSync(new URL("../src/homepage/base.css", import.meta.url), "utf8");
const visual = readFileSync(new URL("../src/homepage/visual-language.css", import.meta.url), "utf8");

test("五大功能的外距、間距與比例只由 base.css 的共用變數控制", () => {
  assert.match(base, /--home-feature-inline:\s*6px;/);
  assert.match(base, /--home-feature-gap:\s*clamp\(2px, \.77vw, 3px\);/);
  assert.match(base, /--home-feature-card-aspect:\s*386 \/ 496;/);
  assert.match(base, /\.home-screen \.home-shortcut-row\s*\{[^}]*width:\s*100%;[^}]*padding-inline:\s*var\(--home-feature-inline\);[^}]*column-gap:\s*var\(--home-feature-gap\);/s);
  assert.match(base, /\.home-screen \.home-shortcut\s*\{[^}]*aspect-ratio:\s*var\(--home-feature-card-aspect\);/s);
});

test("五大功能的八角框與互動狀態只由 base.css 擁有", () => {
  assert.match(base, /\.home-screen \.home-shortcut::before\s*\{/);
  assert.match(base, /\.home-screen \.home-shortcut::after\s*\{/);
  assert.match(base, /\.home-screen \.home-shortcut:active\s*\{/);
  assert.match(base, /\.home-screen \.home-shortcut:focus-visible\s*\{/);
  assert.doesNotMatch(visual, /\.home-shortcut(?:\b|[.: ])/);
});
