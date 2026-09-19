import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const feature = readFileSync("src/feature-pages.css", "utf8");
const responsive = readFileSync("src/responsive-feature-pages.css", "utf8");
const explore = readFileSync("src/matrix-explore-spacing.css", "utf8");
const prototype = readFileSync("src/prototype.css", "utf8");
const balls = readFileSync("src/number-ball.css", "utf8");
const home = readFileSync("src/homepage/base.css", "utf8");
const notification = readFileSync("src/feature-page-adjustments.css", "utf8");
const switcher = readFileSync("src/homepage/lottery-switcher.css", "utf8");
const tokens = readFileSync("src/design-tokens.css", "utf8");
const source = readFeaturePagesSource();

test("Matrix 狀態保留共用彩種切換與頁面間距", () => {
  assert.match(feature, /\.matrix-status-screen \.matrix-status-lottery-switcher\s*\{[^}]*width:\s*100%;[^}]*margin:\s*0 0 8px;/s);
  assert.match(tokens, /--layout-page-inline:\s*16px;/);
  assert.match(feature, /\.feature-body\s*\{[^}]*padding-inline:\s*var\(--layout-page-inline\);/s);
  assert.doesNotMatch(`${feature}\n${switcher}`, /matrix-custom-status-screen/);
});

test("Matrix 指南移除標題下方重複卡片", () => {
  assert.doesNotMatch(source, /<section className="guide-intro panel">/);
  assert.match(source, /<nav[^>]*className="guide-category-strip"/);
});

test("Matrix 探索、天衍、天工共用設定標題同列的文字切換器", () => {
  assert.doesNotMatch(source, /headerAction=\{<MatrixPageSwitcher/);
  assert.match(feature, /\.matrix-settings-heading\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*space-between;/s);
  assert.match(feature, /\.matrix-page-switcher\s*\{[^}]*width:\s*176px;[^}]*height:\s*26px;[^}]*gap:\s*0;[^}]*border-radius:\s*var\(--pwa-frame-radius\);/s);
  assert.match(feature, /\.matrix-page-switcher button\[aria-current="page"\]\s*\{[^}]*font-weight:\s*700;/s);
});

test("六合彩三色球號在首頁、近10期與歷史紀錄共用白色球心定位", () => {
  assert.match(balls, /\.number-ball-component\[data-lottery="六合彩"\] \.number-ball-value\s*\{[^}]*position:\s*absolute;[^}]*top:\s*50%;[^}]*left:\s*50%;[^}]*width:\s*2ch;[^}]*min-width:\s*0;[^}]*font-weight:\s*900;[^}]*transform:\s*translate\(-50%, -50%\) translate\(var\(--number-optical-x\), var\(--number-optical-y\)\);/s);
  assert.match(balls, /\.number-ball-component\[data-lottery="六合彩"\]\[data-tone="green"\]\s*\{[^}]*--number-optical-y:\s*-\.5px;/s);
  assert.doesNotMatch(balls, /\.matrix-explore-main-screen[^}]*\[data-tone="(?:red|green|blue)"\][^{]*\{[^}]*(?:--number-x|--number-y):/s);
  assert.doesNotMatch(balls, /\.draw-history-screen[^}]*\.number-ball-value\s*\{[^}]*(?:--number-x|--number-y|top:\s*calc\(50% \+ var\(--number-ball-asset-y\)\)|left:\s*calc\(50% \+ var\(--number-ball-asset-x\)\))/s);
});

test("六合彩紅球與藍03、10、14、15及綠16避開白色球心右下邊界", () => {
  assert.match(balls, /\.number-ball-component\[data-lottery="六合彩"\]\[data-tone="red"\]\s*\{[^}]*--number-optical-x:\s*-\.25px;[^}]*--number-optical-y:\s*-\.25px;/s);
  assert.match(balls, /\.number-ball-component\[data-lottery="六合彩"\]\[data-tone="blue"\]\[data-number="03"\]\s*\{[^}]*--number-optical-x:\s*-\.25px;[^}]*--number-optical-y:\s*-\.25px;/s);
  assert.match(balls, /\.number-ball-component\[data-lottery="六合彩"\]\[data-tone="blue"\]\[data-number="10"\]\s*\{[^}]*--number-optical-x:\s*-\.25px;[^}]*--number-optical-y:\s*-\.25px;/s);
  assert.match(balls, /\.number-ball-component\[data-lottery="六合彩"\]\[data-tone="blue"\]\[data-number="14"\]\s*\{[^}]*--number-optical-x:\s*-\.25px;[^}]*--number-optical-y:\s*-\.25px;/s);
  assert.match(balls, /\.number-ball-component\[data-lottery="六合彩"\]\[data-tone="blue"\]\[data-number="15"\]\s*\{[^}]*--number-optical-x:\s*-\.75px;[^}]*--number-optical-y:\s*-\.5px;/s);
  assert.match(balls, /\.number-ball-component\[data-lottery="六合彩"\]\[data-tone="green"\]\[data-number="16"\]\s*\{[^}]*--number-optical-x:\s*-\.75px;[^}]*--number-optical-y:\s*-\.75px;/s);
});

test("六合彩逐號光學校正維持每次四分之一像素", () => {
  assert.match(balls, /\.number-ball-component\[data-lottery="六合彩"\]\[data-tone="red"\]\[data-number="01"\]\s*\{[^}]*--number-optical-x:\s*0px;/s);
  assert.match(balls, /\.number-ball-component\[data-lottery="六合彩"\]\[data-tone="red"\]\[data-number="02"\]\s*\{[^}]*--number-optical-x:\s*0px;/s);
  assert.match(balls, /\.number-ball-component\[data-lottery="六合彩"\]\[data-tone="blue"\]\[data-number="15"\]\s*\{[^}]*--number-optical-x:\s*-\.75px;[^}]*--number-optical-y:\s*-\.5px;/s);
  assert.match(balls, /\.number-ball-component\[data-lottery="六合彩"\]\[data-tone="green"\]\[data-number="16"\]\s*\{[^}]*--number-optical-x:\s*-\.75px;[^}]*--number-optical-y:\s*-\.75px;/s);
  assert.match(balls, /\.number-ball-component\[data-lottery="六合彩"\]\[data-tone="green"\]\[data-number="17"\]\s*\{[^}]*--number-optical-x:\s*-\.25px;[^}]*--number-optical-y:\s*-\.25px;/s);
  assert.match(balls, /\.number-ball-component\[data-lottery="六合彩"\]\[data-tone="blue"\]\[data-number="36"\]\s*\{[^}]*--number-optical-x:\s*-\.25px;[^}]*--number-optical-y:\s*-\.25px;/s);
  assert.match(balls, /\.number-ball-component\[data-lottery="六合彩"\]\[data-tone="green"\]\[data-number="38"\]\s*\{[^}]*--number-optical-x:\s*-\.25px;/s);
  assert.match(balls, /\.number-ball-component\[data-lottery="六合彩"\]\[data-tone="blue"\]\[data-number="41"\]\s*\{[^}]*--number-optical-x:\s*\.25px;/s);
  assert.match(balls, /\.number-ball-component\[data-lottery="六合彩"\]\[data-tone="red"\]\[data-number="46"\]\s*\{[^}]*--number-optical-y:\s*-\.5px;/s);
});

test("六合彩球號載入並使用實際 Roboto 900 字重", () => {
  const main = readFileSync("src/main.tsx", "utf8");
  assert.match(main, /@fontsource\/roboto\/latin-900\.css/);
  assert.match(balls, /font-weight:\s*900;/);
});

test("首頁開獎資訊卡維持獨立 12px 外距且高度約縮 10%", () => {
  assert.match(home, /\.home-screen \.latest-draw-card\s*\{[^}]*--draw-card-height:\s*calc\(\(var\(--home-content-width\) \* 732 \/ 1672\) \* \.9\);[^}]*width:\s*calc\(100% - 32px\);[^}]*margin-inline:\s*0;/s);
});

test("通知內容採較緊密比例，右側動作固定欄對齊", () => {
  assert.match(notification, /\.notifications-screen-v2 \.notification-actions\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*56px 38px;[^}]*gap:\s*8px;/s);
});

test("歷史篩選入口沿用共用標題操作區", () => {
  const history = readFileSync("src/FeaturePagesCore.tsx", "utf8");
  const shell = readFileSync("src/features/shared.tsx", "utf8");
  assert.match(history, /headerAction=\{historyTitleActions\}/);
  assert.match(history, /<HeaderSettingsButton expanded=\{filterExpanded\} controls="history-header-settings" label="篩選設定" onClick=\{toggleHistoryFilters\}/);
  assert.match(history, /headerSettings=\{\{ id: "history-header-settings"/);
  assert.match(shell, /<BrandHeader[\s\S]*?action=\{headerAction\}/);
  assert.doesNotMatch(responsive, /\.draw-history-screen \.matrix-title-banner-actions/);
});
