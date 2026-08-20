import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

const css = [
  readFileSync(new URL("../src/number-ball.css", import.meta.url), "utf8"),
  readFileSync(new URL("../src/matrix-explore-spacing.css", import.meta.url), "utf8"),
].join("\n");

function historyFixture(lottery, mainCount, hasSpecial) {
  const mainBalls = Array.from(
    { length: mainCount },
    (_, index) => `<span class="number-ball-component history-lottery-ball" data-lottery="${lottery}">${String(index + 1).padStart(2, "0")}</span>`,
  ).join("");
  const special = hasSpecial
    ? `<span class="history-special-number">
        <span aria-hidden="true">+</span>
        <span class="history-special-ball">
          <small class="history-special-label">特別號</small>
          <span class="number-ball-component history-lottery-ball" data-lottery="${lottery}">49</span>
        </span>
      </span>`
    : "";
  const dom = new JSDOM(`
    <style>${css}</style>
    <main class="matrix-explore-main-screen">
      <section class="history-panel" data-lottery="${lottery}">
        <div class="history-row">
          <span data-testid="period">026090</span>
          <span>2026/08/18（二）</span>
          <span class="history-numbers" data-has-special="${hasSpecial}">
            <span class="history-main-numbers">${mainBalls}</span>
            ${special}
          </span>
        </div>
      </section>
    </main>
  `, { pretendToBeVisual: true });

  const { document } = dom.window;
  const style = (selector) => dom.window.getComputedStyle(document.querySelector(selector));
  return { style };
}

test("近10期期數為白色 12px 粗體，欄寬把剩餘空間留給開獎號碼", () => {
  const { style } = historyFixture("六合彩", 6, true);
  const period = style('[data-testid="period"]');
  const row = style(".history-row");

  assert.equal(period.color, "rgb(255, 255, 255)");
  assert.equal(period.fontSize, "12px");
  assert.equal(period.fontWeight, "800");
  assert.equal(row.gridTemplateColumns, "54px 62px minmax(0, 1fr)");
});

test("6+1 維持 50px 列高，以 24px 彩球和 3px 間距形成置中連續群組", () => {
  const { style } = historyFixture("六合彩", 6, true);
  const panel = style(".history-panel");
  const row = style(".history-row");
  const numbers = style(".history-numbers");
  const main = style(".history-main-numbers");
  const special = style(".history-special-number");

  assert.equal(row.minHeight, "50px");
  assert.equal(panel.getPropertyValue("--matrix-history-ball-size").trim(), "24px");
  assert.equal(numbers.justifyContent, "center");
  assert.equal(numbers.gap, "3px");
  assert.equal(main.flex, "0 0 auto");
  assert.equal(main.gap, "3px");
  assert.equal(special.marginLeft, "0px");
  assert.equal(special.gap, "3px");

  const sixPlusGroupWidth = 6 * 24 + 5 * 3 + 3 + 8 + 3 + 24;
  for (const viewport of [360, 375, 390]) {
    const rowWidth = viewport - 32 - 2;
    const numberColumnWidth = rowWidth - 54 - 62;
    assert.ok(sixPlusGroupWidth <= numberColumnWidth, `${viewport}px viewport must contain the 6+1 group`);
  }
});

test("五顆玩法維持 34px 列高，以 22px 彩球和 8px 間距整組置中", () => {
  const { style } = historyFixture("今彩539", 5, false);
  const row = style(".history-row");
  const numbers = style(".history-numbers");
  const main = style(".history-main-numbers");
  const ball = style(".history-lottery-ball");

  assert.equal(row.minHeight, "34px");
  assert.equal(numbers.justifyContent, "center");
  assert.equal(main.flex, "0 0 auto");
  assert.equal(main.gap, "8px");
  assert.equal(ball.getPropertyValue("--number-ball-size").trim(), "22px");
});
