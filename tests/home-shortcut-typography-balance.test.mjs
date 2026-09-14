import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const base = readFileSync(new URL("../src/homepage/base.css", import.meta.url), "utf8");
const match = base.match(/\.home-screen \.home-shortcut-label\s*\{([^}]*)\}/s);

test("四大功能標籤在手機四欄維持單行且使用收斂標準金", () => {
  assert.ok(match, "home-shortcut-label rule must exist");
  const rule = match[1];
  assert.match(rule, /font-family:\s*"Noto Sans TC",\s*"Source Han Sans TC",\s*sans-serif;/);
  assert.match(rule, /font-size:\s*clamp\(11px,\s*3vw,\s*12px\);/);
  assert.match(rule, /font-weight:\s*600;/);
  assert.match(rule, /letter-spacing:\s*0\.1px;/);
  assert.match(rule, /line-height:\s*1\.2;/);
  assert.match(rule, /color:\s*var\(--lottery-gold-500\);/);
  assert.match(rule, /white-space:\s*nowrap;/);
  assert.match(rule, /text-shadow:\s*none;/);
  assert.doesNotMatch(rule, /!important/);
});
