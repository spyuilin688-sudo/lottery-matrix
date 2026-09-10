import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const css = [
  "../src/feature-pages.css",
  "../src/number-reference-visual-refinement.css",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");

function renderReferenceList() {
  return new JSDOM(`
    <style>${css}</style>
    <main class="number-reference-screen">
      <section class="reference-table-panel">
        <div class="reference-table">
          <div class="reference-row head"><span>期數</span><span>開獎號碼</span></div>
          <div class="reference-row" data-striped="true"><button class="reference-issue">115204</button><span><button>09</button></span></div>
          <div class="reference-row"><button class="reference-issue">115205</button><span><button>26</button></span></div>
          <div class="reference-row" data-striped="true" data-row-marked="true"><button class="reference-issue">115206</button><span><button>31</button></span></div>
        </div>
        <div class="reference-results-end"></div>
      </section>
    </main>
  `, { pretendToBeVisual: true });
}

test("號碼對照單列表提高交錯列差異且降低整列標記透明度", () => {
  const dom = renderReferenceList();
  const rows = dom.window.document.querySelectorAll(".reference-row:not(.head)");
  const styles = [...rows].map((row) => dom.window.getComputedStyle(row).backgroundColor);

  assert.equal(styles[0], "rgba(20, 36, 48, 0.72)");
  assert.equal(styles[1], "rgba(0, 0, 0, 0)");
  assert.equal(styles[2], "rgba(225, 184, 39, 0.16)");
});

test("號碼對照單列表底部保留 12px 額外安全間距", () => {
  const dom = renderReferenceList();
  const end = dom.window.document.querySelector(".reference-results-end");

  assert.equal(dom.window.getComputedStyle(end).height, "12px");
});

test("號碼對照單期數與號碼使用等寬數字並垂直置中", () => {
  const dom = renderReferenceList();
  const issue = dom.window.document.querySelector(".reference-issue");
  const number = dom.window.document.querySelector(".reference-row:not(.head) > span > button");

  for (const element of [issue, number]) {
    const style = dom.window.getComputedStyle(element);

    assert.equal(style.display, "flex");
    assert.equal(style.alignItems, "center");
    assert.equal(style.justifyContent, "center");
    assert.match(style.fontVariantNumeric, /tabular-nums/);
    assert.match(style.fontFeatureSettings, /"tnum" 1/);
    assert.equal(style.lineHeight, "1");
  }
});
