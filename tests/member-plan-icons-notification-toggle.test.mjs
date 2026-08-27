import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const featurePages = readFileSync("src/FeaturePages.tsx", "utf8");
const featureStyles = readFileSync("src/feature-pages.css", "utf8");
const notificationStyles = readFileSync("src/feature-page-adjustments.css", "utf8");

test("會員方案的天衍與天工圖示使用可裁切容器並填滿背景", () => {
  assert.match(
    featurePages,
    /<span className="plan-tool-icon" key=\{icon\.alt\}><img src=\{icon\.src\} alt=\{icon\.alt\} \/><\/span>/,
  );
  assert.match(
    featureStyles,
    /\.plan-tool-icon\s*\{[^}]*width:\s*72px;[^}]*height:\s*72px;[^}]*overflow:\s*hidden;/s,
  );
  assert.match(
    featureStyles,
    /\.plan-tool-icon img\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*object-fit:\s*cover;/s,
  );
});

test("通知頁右側開關由最終專用規則解除垂直置中限制", () => {
  assert.match(
    notificationStyles,
    /\.notifications-screen-v2 \.notification-actions > \.toggle\s*\{[^}]*align-self:\s*center;/s,
  );
  assert.doesNotMatch(
    notificationStyles,
    /\.notifications-screen-v2 \.notification-actions > \.toggle\s*\{[^}]*(?:top|transform):/s,
  );
});


test("推薦碼與啟動碼輸入卡不顯示重複的灰色說明文字", () => {
  assert.doesNotMatch(featurePages, /<label htmlFor="referral-code">輸入推薦碼<\/label>/);
  assert.doesNotMatch(featurePages, /<label htmlFor="activation-code">輸入啟動碼<\/label>/);
  assert.match(featurePages, /<input id="referral-code".*aria-label="推薦碼"/);
  assert.match(featurePages, /<input id="activation-code".*aria-label="啟動碼"/);
});
