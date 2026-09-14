import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const base = read("src/homepage/base.css");
const visual = read("src/homepage/visual-language.css");

const shortcutLabelSelector = ".home-screen .home-shortcut-label";
const labelRuleMatch = base.match(/\.home-screen \.home-shortcut-label\s*\{([^}]*)\}/s);

test("四大功能文字使用指定中英文字型規格與收斂標準金", () => {
  assert.ok(labelRuleMatch, "home-shortcut-label rule must exist in canonical homepage CSS");
  const rule = labelRuleMatch[1];
  assert.match(rule, /font-family:\s*"Noto Sans TC",\s*"Source Han Sans TC",\s*sans-serif;/);
  assert.match(rule, /font-size:\s*16px;/);
  assert.match(rule, /font-weight:\s*600;/);
  assert.match(rule, /letter-spacing:\s*0\.3px;/);
  assert.match(rule, /line-height:\s*1\.25;/);
  assert.match(rule, /color:\s*var\(--lottery-gold-300\);/);
  assert.match(rule, /text-shadow:\s*none;/);
  assert.doesNotMatch(rule, /!important/);
});

test("四大功能文字只保留一個正式 selector，不新增覆寫層", () => {
  const baseCount = (base.match(/\.home-screen \.home-shortcut-label\s*\{/g) ?? []).length;
  const visualCount = (visual.match(/\.home-screen \.home-shortcut-label\s*\{/g) ?? []).length;
  assert.equal(baseCount, 1);
  assert.equal(visualCount, 0);
});
