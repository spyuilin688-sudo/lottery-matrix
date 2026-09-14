import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const base = read("src/homepage/base.css");
const visual = read("src/homepage/visual-language.css");

const labelRuleMatch = base.match(/\.home-screen \.home-shortcut-label\s*\{([^}]*)\}/s);

test("四大功能文字在手機四欄維持單行、收斂標準金與一致粗細", () => {
  assert.ok(labelRuleMatch, "home-shortcut-label rule must exist in canonical homepage CSS");
  const rule = labelRuleMatch[1];
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

test("四大功能文字只保留一個正式 selector，不新增覆寫層", () => {
  const baseCount = (base.match(/\.home-screen \.home-shortcut-label\s*\{/g) ?? []).length;
  const visualCount = (visual.match(/\.home-screen \.home-shortcut-label\s*\{/g) ?? []).length;
  assert.equal(baseCount, 1);
  assert.equal(visualCount, 0);
});
