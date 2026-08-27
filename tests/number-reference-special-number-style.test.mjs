import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const css = [
  "../src/feature-pages.css",
  "../src/number-reference-visual-refinement.css",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");

const refinementCss = readFileSync(new URL("../src/number-reference-visual-refinement.css", import.meta.url), "utf8");

test("號碼對照單特別號使用紫金欄位樣式並取消紅色內框", () => {
  const dom = new JSDOM(`
    <style>${css}</style>
    <main class="number-reference-screen">
      <div class="reference-row" data-has-special="true">
        <button class="reference-issue">106103</button>
        <span>
          <button>16</button>
          <button>19</button>
          <button>28</button>
          <button>37</button>
          <button>38</button>
          <button>41</button>
          <button data-special="true">10</button>
        </span>
      </div>
    </main>
  `, { pretendToBeVisual: true });

  const special = dom.window.document.querySelector('[data-special="true"]');
  const style = dom.window.getComputedStyle(special);

  assert.equal(style.backgroundColor, "rgba(92, 70, 160, 0.22)");
  assert.equal(style.color, "rgb(244, 241, 232)");
  assert.equal(style.fontWeight, "400");
  assert.match(style.textShadow, /^(?:none|rgba\(0, 0, 0, 0\))$/);
  assert.equal(style.borderLeftColor, "rgba(212, 168, 72, 0.55)");
  assert.match(style.boxShadow, /rgba\(212, 168, 72, (?:0?\.)55\)/);
});

test("號碼對照單特別號移除舊有紅色格線覆寫", () => {
  const afterRule = refinementCss.match(/button\[data-special="true"\]::after\s*\{([^}]*)\}/s)?.[1] ?? "";

  assert.match(afterRule, /display:\s*none\s*;/);
  assert.doesNotMatch(refinementCss, /rgba\(198,\s*83,\s*83,\s*\.72\)/i);
});
