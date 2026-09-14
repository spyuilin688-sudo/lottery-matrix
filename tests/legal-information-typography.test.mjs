import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const css = ["../src/styles.css", "../src/feature-pages.css"]
  .map(path => readLocalCss(new URL(path, import.meta.url))).join("\n");

// Exercise the legal document's typography together with the global paragraph
// rules that caused the production regression.
function fixture(t) {
  const dom = new JSDOM(`<style>${css}</style>
    <main class="feature-screen compact-feature-screen profile-detail-screen profile-info-screen">
      <div class="feature-body"><article class="panel legal-info-document">
        <h1>會員服務條例</h1>
        <section class="legal-info-section"><h2>一、服務範圍</h2>
          <div class="legal-info-copy">
            <p>使用者透過 LINE 登入後使用會員功能。</p>
            <ul><li>Matrix Pro 訂閱狀態</li></ul>
            <p><a href="mailto:matrix.lottery@gmail.com">matrix.lottery@gmail.com</a></p>
          </div>
        </section>
      </article></div>
    </main>
    <section class="detail-card"><p>目前沒有付款紀錄。</p></section>
    <p id="global-paragraph">樂彩 Matrix</p>`);
  t.after(() => dom.window.close());
  return selector => dom.window.getComputedStyle(dom.window.document.querySelector(selector));
}

test("法律段落載入全域樣式後仍與清單使用可讀的正文顏色", t => {
  const style = fixture(t);
  assert.equal(style(".legal-info-copy p").color, "rgb(201, 194, 184)");
  assert.equal(style(".legal-info-copy li").color, "rgb(201, 194, 184)");
});

test("法律段落保持核准的 13px 字級與 1.65 行高", t => {
  const style = fixture(t);
  assert.equal(style(".legal-info-copy p").fontSize, "13px");
  assert.equal(style(".legal-info-copy p").lineHeight, "1.65");
});

test("正文修復保留金色連結與其他頁面的段落樣式", t => {
  const style = fixture(t);
  assert.equal(style(".legal-info-copy a").color, "rgb(229, 195, 110)");
  assert.equal(style(".legal-info-copy a").textDecoration, "underline");
  assert.equal(style(".detail-card p").color, "rgb(201, 194, 184)");
  assert.equal(style("#global-paragraph").color, "rgb(85, 85, 85)");
  assert.equal(style("#global-paragraph").fontSize, "14px");
});
