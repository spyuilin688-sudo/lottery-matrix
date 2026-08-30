import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(
  new URL("../src/notification-visual-refinement.css", import.meta.url),
  "utf8",
);
const source = readFileSync(
  new URL("../src/NotificationsPagePatched.tsx", import.meta.url),
  "utf8",
);

test("通知頁批次操作與群組間距提高但不改標題卡及底部導覽", () => {
  assert.match(css, /\.notifications-screen-v2 \.notification-content\s*\{[^}]*row-gap:\s*16px;/s);
  assert.match(css, /\.notifications-screen-v2 \.notification-list\s*\{[^}]*gap:\s*12px;/s);
  assert.match(css, /\.notifications-screen-v2 \.notification-heading\s*\{[^}]*padding:\s*5px 8px 5px 4px;/s);
  assert.doesNotMatch(css, /feature-brand-header|matrix-title-banner|bottom-navigation|feature-bottom-nav/);
});

test("全部開啟及全部關閉維持同層級且移除開啟按鈕額外粒子", () => {
  assert.match(css, /\.notifications-screen-v2 \.notification-bulk-actions button\s*\{[^}]*border:[^;]+;[^}]*color:[^;]+;/s);
  assert.match(css, /\.notifications-screen-v2 \.notification-bulk-enable\s*\{[^}]*background:/s);
  assert.match(css, /\.notifications-screen-v2 \.notification-bulk-disable\s*\{[^}]*background:/s);
  assert.match(css, /\.notifications-screen-v2 \.notification-bulk-enable::before,[\s\S]*?\.notifications-screen-v2 \.notification-bulk-enable::after\s*\{[^}]*display:\s*none;/s);
});

test("通知列控制寬度與 Matrix Pro 間距符合手機版調整", () => {
  assert.match(css, /\.notifications-screen-v2 \.notification-actions\s*\{[^}]*grid-template-columns:\s*60px 38px;[^}]*gap:\s*10px;/s);
  assert.match(css, /\.notifications-screen-v2 \.notification-settings-toggle\s*\{[^}]*width:\s*60px;/s);
  assert.match(css, /\.notifications-screen-v2 \.notification-title h2:has\(em\)\s*\{[^}]*gap:\s*3\.5px;/s);
});

test("Matrix 摘星停用時保留可讀性，內部分隔線降低對比", () => {
  assert.match(css, /data-notification-key="collision"[^}]*h2 span\s*\{[^}]*color:\s*rgba\(242, 242, 242, \.84\)/s);
  assert.match(css, /\.notifications-screen-v2 \.notification-group \.notification-row \+ \.notification-row\s*\{[^}]*border-top-color:\s*rgba\(170, 119, 46, \.26\);/s);
  assert.match(css, /\.notifications-screen-v2 \.notification-inline-settings-content\s*\{[^}]*border-top-color:\s*rgba\(170, 119, 46, \.26\);/s);
});

test("系統通知縮短標題副標距離並縮小設定按鈕", () => {
  assert.match(source, /data-notification-key=\{key\}/);
  assert.match(css, /data-notification-key="system"[^}]*\.notification-title\s*\{[^}]*flex-direction:\s*column;[^}]*gap:\s*0;/s);
  assert.match(css, /data-notification-key="system"[^}]*\.notification-push-status\s*\{[^}]*margin:\s*0;/s);
  assert.match(css, /data-notification-key="system"[^}]*\.notification-actions\s*\{[^}]*grid-template-columns:\s*58px 38px;/s);
  assert.match(css, /data-notification-key="system"[^}]*\.notification-settings-toggle\s*\{[^}]*width:\s*58px;/s);
});
