import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

const featureCss = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const responsiveIssueRules = [
  featureCss.match(/\.matrix-explore-main-screen\s*\{[^}]*\}/s)?.[0],
  featureCss.match(/\.history-row:not\(\.history-head\) > span:first-child\s*\{[^}]*\}/s)?.[0],
].join("\n");
const css = [
  responsiveIssueRules,
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
        <header class="panel-heading">
          <div class="history-panel-title"><h2 class="section-title"><span></span>近10期開獎號碼</h2></div>
          <div class="history-panel-actions"><button class="history-panel-collapse-button"><svg data-open="true"></svg></button><button>查看更多紀錄</button></div>
        </header>
        <div class="history-table">
          <div class="history-row">
            <span data-testid="period">026090</span>
            <span><span class="history-date-stack"><strong>2026</strong><small>08/18 (二)</small></span></span>
            <span class="history-numbers" data-has-special="${hasSpecial}">
              <span class="history-main-numbers">${mainBalls}</span>
              ${special}
            </span>
          </div>
        </div>
      </section>
    </main>
  `, { pretendToBeVisual: true });

  const { document } = dom.window;
  const style = (selector) => dom.window.getComputedStyle(document.querySelector(selector));
  return { style };
}

test("近10期期數、年份與日期使用指定響應式字級並保留期數粗體", () => {
  const { style } = historyFixture("六合彩", 6, true);
  const screen = style(".matrix-explore-main-screen");
  const period = style('[data-testid="period"]');
  const year = style(".history-date-stack strong");
  const date = style(".history-date-stack small");
  const row = style(".history-row");

  assert.equal(period.color, "rgb(255, 255, 255)");
  assert.doesNotMatch(period.fontFamily, /monospace/i);
  assert.equal(screen.getPropertyValue("--mx-history-issue-size").trim(), "clamp(6px,2.1vw,8px)");
  assert.equal(period.fontSize, "var(--mx-history-issue-size, 14px)");
  assert.equal(period.fontWeight, "800");
  assert.equal(year.getPropertyValue("--history-year-font-size").trim(), "clamp(8px,2.6vw,10px)");
  assert.equal(date.getPropertyValue("--history-date-font-size").trim(), "clamp(7px,2.1vw,8px)");
  assert.equal(style(".history-date-stack").rowGap, "2px");
  assert.equal(row.gridTemplateColumns, "minmax(0, .65fr) minmax(0, .85fr) minmax(0, 3.5fr)");
});

test("六合彩使用 36px 列高、18–22px 彩球及指定數字與底線比例", () => {
  const { style } = historyFixture("六合彩", 6, true);
  const panel = style(".history-panel");
  const row = style(".history-row");
  const numbers = style(".history-numbers");
  const main = style(".history-main-numbers");
  const special = style(".history-special-number");
  const specialBall = style(".history-special-ball");
  const mainBall = style(".history-main-numbers .history-lottery-ball");

  assert.equal(row.height, "36px");
  assert.equal(row.minHeight, "36px");
  assert.equal(panel.getPropertyValue("--matrix-history-ball-size").trim(), "clamp(18px,5.64vw,22px)");
  assert.equal(numbers.justifyContent, "center");
  assert.equal(numbers.alignItems, "center");
  assert.equal(numbers.gap, "clamp(4px, 1.5vw, 7px)");
  assert.equal(main.flex, "0 0 auto");
  assert.equal(main.alignItems, "center");
  assert.equal(main.gap, "clamp(4px, 1.5vw, 7px)");
  assert.equal(special.marginLeft, "0px");
  assert.equal(special.alignItems, "center");
  assert.equal(special.gap, "clamp(4px, 1.5vw, 7px)");
  assert.equal(specialBall.rowGap, "2px");
  assert.equal(style(".history-special-label").getPropertyValue("--history-special-label-size").trim(), "clamp(5px,1.67vw,6.5px)");
  assert.equal(mainBall.getPropertyValue("--number-font-size").trim(), "clamp(7px,2.31vw,9px)");
  assert.equal(mainBall.getPropertyValue("--underline-width").trim(), "clamp(8px,2.56vw,10px)");
  assert.equal(mainBall.getPropertyValue("--underline-height").trim(), ".7px");
  assert.equal(mainBall.getPropertyValue("--underline-y").trim(), ".3px");

  const expectedGeometry = [
    { viewport: 320, ball: 18.048, gap: 4.8 },
    { viewport: 360, ball: 20.304, gap: 5.4 },
    { viewport: 375, ball: 21.15, gap: 5.625 },
    { viewport: 390, ball: 21.996, gap: 5.85 },
  ];
  for (const { viewport, ball, gap } of expectedGeometry) {
    const rowWidth = viewport - 32 - 2;
    const numberColumnWidth = rowWidth * 3.3 / 5;
    const sixPlusGroupWidth = 7 * ball + 7 * gap + 8;
    assert.ok(sixPlusGroupWidth <= numberColumnWidth, `${viewport}px viewport must contain the 6+1 group`);
    assert.ok(ball / 36 >= .5, `${viewport}px ball must remain proportional to the 36px row`);
  }
});

test("大樂透使用 36px 列高並讓正碼及特別號球同步下移 3px", () => {
  const { style } = historyFixture("大樂透", 6, true);
  const row = style(".history-row");
  const panel = style(".history-panel");
  const mainBall = style(".history-main-numbers .history-lottery-ball");
  const specialGroup = style(".history-special-ball");
  const specialBall = style(".history-special-ball .history-lottery-ball");
  const specialLabel = style(".history-special-label");

  assert.equal(row.height, "36px");
  assert.equal(row.minHeight, "36px");
  assert.equal(panel.getPropertyValue("--matrix-history-ball-size").trim(), "clamp(20px,6.15vw,24px)");
  assert.equal(mainBall.transform, "translateY(3px)");
  assert.equal(specialBall.transform, "translateY(3px)");
  assert.equal(specialGroup.height, "36px");
  assert.equal(specialGroup.gridTemplateRows, "1fr");
  assert.equal(specialLabel.bottom, "calc(50% + var(--matrix-history-ball-size) / 2 - 1px)");
  assert.equal(mainBall.getPropertyValue("--underline-height").trim(), ".7px");
  assert.equal(mainBall.getPropertyValue("--underline-y").trim(), ".3px");
});

test("五顆玩法使用 32px 列高，數字為 12–14px 且底線符合指定比例", () => {
  const { style } = historyFixture("今彩539", 5, false);
  const row = style(".history-row");
  const numbers = style(".history-numbers");
  const main = style(".history-main-numbers");
  const ball = style(".history-lottery-ball");

  assert.equal(row.height, "32px");
  assert.equal(row.minHeight, "32px");
  assert.equal(numbers.justifyContent, "center");
  assert.equal(main.flex, "0 0 auto");
  assert.equal(main.gap, "clamp(4px, 1.8vw, 8px)");
  assert.equal(ball.getPropertyValue("--number-ball-size").trim(), "clamp(24px,7.18vw,28px)");
  assert.equal(ball.getPropertyValue("--number-font-size").trim(), "clamp(12px,3.59vw,14px)");
  assert.equal(ball.getPropertyValue("--underline-width").trim(), "clamp(9px,2.82vw,11px)");
  assert.equal(ball.getPropertyValue("--underline-height").trim(), ".7px");
  assert.equal(ball.getPropertyValue("--underline-y").trim(), ".3px");
});

test("近10期表格外框與欄列分隔線明確呈現", () => {
  const { style } = historyFixture("今彩539", 5, false);
  const panel = style(".history-panel");
  const heading = style(".panel-heading");
  const period = style('[data-testid="period"]');
  const row = style(".history-row");

  assert.equal(panel.borderTopWidth, "1px");
  assert.equal(panel.borderTopColor, "rgb(117, 83, 41)");
  assert.equal(heading.borderBottomWidth, "1px");
  assert.equal(heading.paddingTop, "5px");
  assert.equal(heading.paddingBottom, "5px");
  assert.equal(style(".history-panel-actions").gap, "6px");
  assert.equal(period.borderRightWidth, "1px");
  assert.equal(row.borderBottomWidth, "1px");
});
