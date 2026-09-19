import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const css = await readFile(new URL("../src/number-ball.css", import.meta.url), "utf8");

test("transparent PNG canvases are compensated inside NumberBall", () => {
  assert.match(css, /\.number-ball-asset\s*\{[\s\S]*width:\s*calc\(100% \* var\(--number-ball-asset-scale\)\)/);
  assert.match(css, /\.number-ball-component\[data-lottery="今彩539"\]\s*\{[^}]*--number-ball-asset-scale:\s*1\.228/s);
  assert.match(css, /\.number-ball-component\[data-lottery="天天樂"\]\s*\{[^}]*--number-ball-asset-scale:\s*1\.347/s);
  assert.match(css, /\.number-ball-component\[data-lottery="六合彩"\]\s*\{[^}]*--number-ball-asset-scale:\s*1\.478/s);
  assert.match(css, /\.number-ball-component\[data-lottery="大樂透"\]\s*\{[^}]*--number-ball-asset-scale:\s*1\.478/s);
});


function homeSixPlusOneFixture(lottery) {
  const dom = new JSDOM(`
    <style>${css}</style>
    <main class="home-screen">
      <section class="latest-draw-card" data-lottery="${lottery}">
        <div class="draw-balls" data-has-special="true">
          <div class="main-balls">
            <span class="number-ball-component" data-lottery="${lottery}"></span>
          </div>
          <div class="special-ball-group">
            <span class="number-ball-component" data-lottery="${lottery}" data-special="true"></span>
          </div>
        </div>
      </section>
    </main>
  `);
  const document = dom.window.document;
  return {
    card: dom.window.getComputedStyle(document.querySelector(".latest-draw-card")),
    main: dom.window.getComputedStyle(document.querySelector(".main-balls .number-ball-component")),
    special: dom.window.getComputedStyle(document.querySelector(".special-ball-group .number-ball-component")),
  };
}

test("首頁六合彩正碼與特別號同尺寸，數字大小不變", () => {
  const markSix = homeSixPlusOneFixture("六合彩");
  assert.equal(markSix.main.getPropertyValue("--number-ball-size").trim().replace(/,\s*/g, ", "), "clamp(33.7px, 9.88vw, 38.2px)");
  assert.equal(markSix.special.getPropertyValue("--number-ball-size").trim().replace(/,\s*/g, ", "), "clamp(33.7px, 9.88vw, 38.2px)");
  assert.equal(markSix.main.getPropertyValue("--number-font-size").trim(), "13.5px");
  assert.equal(markSix.special.getPropertyValue("--number-font-size").trim(), "13.5px");
  assert.equal(markSix.card.getPropertyValue("--draw-special-ball-size").trim().replace(/,\s*/g, ", "), "clamp(30px, 8.8vw, 34px)");

  const grandLotto = homeSixPlusOneFixture("大樂透");
  assert.equal(grandLotto.main.getPropertyValue("--number-ball-size").trim().replace(/,\s*/g, ", "), "clamp(33.7px, 9.88vw, 38.2px)");
  assert.equal(grandLotto.special.getPropertyValue("--number-ball-size").trim().replace(/,\s*/g, ", "), "clamp(33.7px, 9.88vw, 38.2px)");

  assert.doesNotMatch(
    css,
    /\.draw-balls\[data-has-special="true"\]:is\(\[data-lottery="六合彩"\], \[data-lottery="大樂透"\]\)/,
  );
});
