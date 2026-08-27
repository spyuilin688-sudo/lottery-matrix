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
const tokens = readFileSync("src/design-tokens.css", "utf8");
const source = readFileSync("src/FeaturePages.tsx", "utf8");

test("Matrix 狀態的自訂觸發條件位於標題文字右側 4px 且垂直置中", () => {
  assert.match(feature, /\.matrix-status-screen \.matrix-title-banner-actions\s*\{[^}]*top:\s*50%;[^}]*right:\s*auto;[^}]*left:\s*calc\(83% \+ 4px\);[^}]*width:\s*1\.8rem;[^}]*height:\s*1\.8rem;[^}]*transform:\s*translateY\(-50%\);/s);
  assert.match(feature, /\.matrix-status-screen \.status-title-trigger\s*\{[^}]*width:\s*1\.8rem;[^}]*height:\s*1\.8rem;/s);
  assert.match(feature, /\.matrix-status-screen \.status-title-trigger img\s*\{[^}]*opacity:\s*\.8;/s);
});

test("自訂觸發條件沿用首頁彩種切換並使用 8px 下間距", () => {
  assert.match(feature, /\.matrix-custom-status-screen \.matrix-status-lottery-switcher\s*\{[^}]*margin:\s*0 0 8px;/s);
  assert.doesNotMatch(feature, /\.matrix-custom-status-screen \.matrix-status-lottery-switcher[^}]*min-height:\s*72px/);
  assert.doesNotMatch(feature, /\.matrix-custom-status-screen \.matrix-status-lottery-switcher > \.home-asset-image/);
  assert.match(tokens, /--layout-page-inline:\s*16px;/);
  assert.match(feature, /\.feature-body\s*\{[^}]*padding-inline:\s*var\(--layout-page-inline\);/s);
  assert.doesNotMatch(feature, /\.matrix-custom-status-screen \.custom-status-tabs\s*\{[^}]*(?:margin-left|margin-right|margin-inline):\s*-/s);
  assert.match(feature, /\.matrix-custom-status-screen \.custom-status-tabs\s*\{[^}]*box-sizing:\s*border-box;[^}]*width:\s*100%;[^}]*aspect-ratio:\s*1532\s*\/\s*214;[^}]*padding-inline:\s*4px;[^}]*gap:\s*6px;/s);
  assert.match(feature, /\.matrix-custom-status-screen \.custom-status-tabs button\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*padding:\s*0;/s);
});

test("自訂觸發條件卡及操作按鍵使用確認後的小字與金色新增按鍵", () => {
  assert.match(feature, /\.matrix-custom-status-screen \.custom-status-hit-header strong\s*\{[^}]*font-size:\s*12px;/s);
  assert.match(feature, /\.matrix-custom-status-screen \.custom-status-add-button\s*\{[^}]*border:\s*1px solid rgba\(196, 145, 69, \.55\);[^}]*background:\s*#030a0f;[^}]*color:\s*var\(--lottery-gold-500\);[^}]*font-size:\s*11px;/s);
  assert.match(feature, /\.matrix-custom-status-screen \.custom-status-actions button\s*\{[^}]*font-size:\s*11px;/s);
});

test("Matrix 指南移除標題下方重複卡片", () => {
  assert.doesNotMatch(source, /<section className="guide-intro panel">/);
  assert.match(source, /<nav[^>]*className="guide-category-strip"/);
});

test("Matrix 探索顯示天衍天工，兩顆圖示為 1.8rem 且間距 4px", () => {
  assert.doesNotMatch(prototype, /\.matrix-explore-main-screen \.matrix-page-switcher\s*\{\s*display:\s*none/);
  assert.match(explore, /\.matrix-explore-main-screen \.matrix-title-banner-actions\s*\{[^}]*top:\s*100%;[^}]*right:\s*4%;[^}]*transform:\s*translateY\(-87\.5%\);/s);
  assert.match(explore, /\.matrix-page-switcher\s*\{[^}]*gap:\s*4px;/s);
  assert.match(explore, /\.matrix-page-switcher button\s*\{[^}]*width:\s*1\.8rem;[^}]*height:\s*1\.8rem;/s);
  assert.doesNotMatch(feature, /\.setting-grid \.matrix-explore-setting-icon\s*\{[^}]*36px/);
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

test("首頁開獎資訊卡維持 16px 外距且高度約縮 10%", () => {
  assert.match(home, /\.home-screen \.latest-draw-card\s*\{[^}]*--draw-card-height:\s*calc\(\(var\(--home-content-width\) \* 732 \/ 1672\) \* \.9\);[^}]*width:\s*100%;[^}]*margin-inline:\s*0;/s);
});

test("我的與通知內容採較緊密比例，通知右側動作固定欄對齊", () => {
  assert.match(feature, /\.profile-card\s*\{[^}]*grid-template-columns:\s*56px minmax\(0, 1fr\) auto;[^}]*gap:\s*8px;/s);
  assert.match(notification, /\.notifications-screen-v2 \.notification-actions\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*64px 38px;[^}]*gap:\s*8px;/s);
});

test("歷史標題卡的既有定位仍是頁面共同比照來源", () => {
  assert.match(responsive, /\.draw-history-screen \.matrix-title-banner-actions,[\s\S]*?top:\s*100%;[\s\S]*?transform:\s*translateY\(-87\.5%\);/);
});
