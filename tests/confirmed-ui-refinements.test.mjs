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

test("Matrix 狀態的自訂觸發條件位於標題文字右側 4px 且垂直置中", () => {
  assert.match(feature, /\.matrix-status-screen \.matrix-title-banner-actions\s*\{[^}]*top:\s*50%;[^}]*right:\s*auto;[^}]*left:\s*calc\(83% \+ 4px\);[^}]*width:\s*1\.8rem;[^}]*height:\s*1\.8rem;[^}]*transform:\s*translateY\(-50%\);/s);
  assert.match(feature, /\.matrix-status-screen \.status-title-trigger\s*\{[^}]*width:\s*1\.8rem;[^}]*height:\s*1\.8rem;/s);
});

test("自訂觸發條件沿用首頁彩種切換並使用 8px 下間距", () => {
  assert.match(feature, /\.matrix-custom-status-screen \.matrix-status-lottery-switcher\s*\{[^}]*margin:\s*0 0 8px;/s);
  assert.doesNotMatch(feature, /\.matrix-custom-status-screen \.matrix-status-lottery-switcher[^}]*min-height:\s*72px/);
  assert.doesNotMatch(feature, /\.matrix-custom-status-screen \.matrix-status-lottery-switcher > \.home-asset-image/);
});

test("自訂觸發條件卡及操作按鍵使用確認後的小字與金色新增按鍵", () => {
  assert.match(feature, /\.matrix-custom-status-screen \.custom-status-hit-header strong\s*\{[^}]*font-size:\s*12px;/s);
  assert.match(feature, /\.matrix-custom-status-screen \.custom-status-add-button\s*\{[^}]*border:\s*1px solid rgba\(196, 145, 69, \.55\);[^}]*background:\s*#030a0f;[^}]*color:\s*var\(--lottery-gold-500\);[^}]*font-size:\s*11px;/s);
  assert.match(feature, /\.matrix-custom-status-screen \.custom-status-actions button\s*\{[^}]*font-size:\s*11px;/s);
});

test("Matrix 探索顯示天衍天工，兩顆圖示為 1.8rem 且間距 4px", () => {
  assert.doesNotMatch(prototype, /\.matrix-explore-main-screen \.matrix-page-switcher\s*\{\s*display:\s*none/);
  assert.match(explore, /\.matrix-explore-main-screen \.matrix-title-banner-actions\s*\{[^}]*top:\s*100%;[^}]*right:\s*4%;[^}]*transform:\s*translateY\(-87\.5%\);/s);
  assert.match(explore, /\.matrix-page-switcher\s*\{[^}]*gap:\s*4px;/s);
  assert.match(explore, /\.matrix-page-switcher button\s*\{[^}]*width:\s*1\.8rem;[^}]*height:\s*1\.8rem;/s);
  assert.doesNotMatch(feature, /\.setting-grid \.matrix-explore-setting-icon\s*\{[^}]*36px/);
});

test("歷史六合彩球號使用一致置中與 0.5px 底線間距", () => {
  assert.match(balls, /\.draw-history-screen \.draw-history-panel\[data-lottery="六合彩"\][^{]*\{[^}]*--number-x:\s*0px;[^}]*--number-y:\s*-\.5px;[^}]*--underline-y:\s*\.5px;/s);
  assert.doesNotMatch(balls, /\.draw-history-screen \.draw-history-panel\[data-lottery="六合彩"\][^{]*\[data-tone=/);
});

test("首頁開獎資訊卡維持 12px 外距且高度約縮 10%", () => {
  assert.match(home, /\.home-screen \.latest-draw-card\s*\{[^}]*--draw-card-height:\s*calc\(\(\(var\(--home-content-width\) \* 732 \/ 1672\) - 4px\) \* \.9\);[^}]*width:\s*100%;/s);
});

test("我的與通知內容採較緊密比例，通知右側動作固定欄對齊", () => {
  assert.match(feature, /\.profile-card\s*\{[^}]*grid-template-columns:\s*56px minmax\(0, 1fr\) auto;[^}]*gap:\s*8px;/s);
  assert.match(notification, /\.notifications-screen-v2 \.notification-actions\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*64px 38px;[^}]*gap:\s*8px;/s);
});

test("歷史標題卡的既有定位仍是頁面共同比照來源", () => {
  assert.match(responsive, /\.draw-history-screen \.matrix-title-banner-actions,[\s\S]*?top:\s*100%;[\s\S]*?transform:\s*translateY\(-87\.5%\);/);
});
