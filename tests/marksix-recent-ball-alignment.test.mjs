import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

test("近10期六合彩數字使用已載入粗體並讓數字與底線貼合球心", () => {
  const css = readFileSync(new URL("../src/number-ball.css", import.meta.url), "utf8");
  const dom = new JSDOM(`
    <style>${css}</style>
    <section class="history-panel">
      <span class="history-numbers" data-has-special="true">
        <span class="number-ball-component history-lottery-ball" data-lottery="六合彩" data-tone="red">
          <span class="number-ball-value">18</span>
        </span>
      </span>
    </section>
  `);
  const ball = dom.window.document.querySelector(".number-ball-component");
  const value = dom.window.document.querySelector(".number-ball-value");
  const ballStyle = dom.window.getComputedStyle(ball);
  const valueStyle = dom.window.getComputedStyle(value);

  assert.equal(valueStyle.fontWeight, "700");
  assert.equal(ballStyle.getPropertyValue("--number-y").trim(), "-.5px");
  assert.equal(ballStyle.getPropertyValue("--underline-y").trim(), "-.5px");
});
