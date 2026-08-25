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
    /\.notifications-screen-v2 \.notification-actions > \.toggle\s*\{[^}]*align-self:\s*start;/s,
  );
  assert.doesNotMatch(
    notificationStyles,
    /\.notifications-screen-v2 \.notification-actions > \.toggle\s*\{[^}]*(?:top|transform):/s,
  );
});
