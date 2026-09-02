import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ruleBodies } from "./helpers/css-rules.mjs";

const css = readFileSync(new URL("../src/feature-page-adjustments.css", import.meta.url), "utf8");

test("全部關閉維持共用探索按鈕的次要邊框層級", () => {
  const base = ruleBodies(css, /^\.notifications-screen-v2 \.notification-bulk-disable$/);
  assert.equal(base.length, 1);
  assert.match(base[0], /border:\s*1px solid rgba\(216, 195, 141, \.72\);/);
  assert.match(base[0], /color:\s*#D8C38D;/);
  assert.doesNotMatch(base[0], /background\s*:/);
  assert.equal(ruleBodies(css, /^\.notifications-screen-v2 \.notification-bulk-disable:active$/).length, 0);
});

test("Matrix 摘星停用列的設定與關閉開關提高一級亮度", () => {
  const setting = ruleBodies(css, /^\.notifications-screen-v2 \.notification-row\[data-notification-key="collision"\] \.notification-settings-toggle:disabled$/);
  assert.equal(setting.length, 1);
  assert.match(setting[0], /border-color:\s*rgba\(211, 166, 66, \.58\);/);
  assert.match(setting[0], /color:\s*rgba\(224, 196, 137, \.7\);/);

  const toggle = ruleBodies(css, /^\.notifications-screen-v2 \.notification-row\[data-notification-key="collision"\] \.notification-actions > \.toggle:disabled$/);
  assert.equal(toggle.length, 1);
  assert.match(toggle[0], /opacity:\s*\.68;/);

  const track = ruleBodies(css, /^\.notifications-screen-v2 \.notification-row\[data-notification-key="collision"\] \.notification-actions > \.toggle:disabled::before$/);
  assert.equal(track.length, 1);
  assert.match(track[0], /border-color:\s*#68727e;/);
  assert.match(track[0], /background:\s*#172029;/);
});

test("通知圖示降低亮度，讓名稱維持每列主閱讀點", () => {
  const icon = ruleBodies(css, /^\.notifications-screen-v2 \.notification-icon img$/);
  assert.ok(icon.some((body) => /filter:\s*brightness\(\.92\) saturate\(\.86\);/.test(body)));

  const disabledIcon = ruleBodies(css, /^\.notifications-screen-v2 \.notification-row:has\(\.toggle:disabled\) \.notification-icon img$/);
  assert.ok(disabledIcon.some((body) => /filter:\s*brightness\(\.88\) saturate\(\.76\);/.test(body)));
});

test("Matrix Pro 標籤以既有比例縮減 30%", () => {
  const badge = ruleBodies(css, /^\.notifications-screen-v2 \.notification-pro-badge$/);
  assert.equal(badge.length, 1);
  assert.match(badge[0], /padding:\s*0 1\.4px;/);
  assert.match(badge[0], /border:\s*\.7px solid #f6c95f;/);
  assert.match(badge[0], /border-radius:\s*2\.1px;/);
  assert.match(badge[0], /font-size:\s*4\.2px;/);
  assert.match(badge[0], /line-height:\s*5\.6px;/);
});

test("Matrix 系列上內距為 3px，標籤與上框的視覺間距為 1px", () => {
  const generalHeading = ruleBodies(css, /^\.notifications-screen-v2 \.notification-heading$/);
  const matrixHeading = ruleBodies(css, /^\.notifications-screen-v2 \.notification-heading:has\(\.notification-pro-badge\)$/);
  const badge = ruleBodies(css, /^\.notifications-screen-v2 \.notification-pro-badge$/);

  assert.equal(generalHeading.length, 1);
  assert.equal(matrixHeading.length, 1);
  assert.equal(badge.length, 1);

  const generalTop = Number(generalHeading[0].match(/padding:\s*(\d+)px/)?.[1]);
  const matrixTop = Number(matrixHeading[0].match(/padding-top:\s*(-?\d+)px/)?.[1]);
  const badgeOffset = Number(badge[0].match(/transform:\s*translateY\((-?\d+)px\)/)?.[1]);

  assert.equal(generalTop, 4);
  assert.equal(matrixTop, 3);
  assert.equal(badgeOffset, -2);
  assert.equal(matrixTop + badgeOffset, 1);
});
