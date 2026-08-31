import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ruleBodies } from "./helpers/css-rules.mjs";

const css = readFileSync(new URL("../src/feature-page-adjustments.css", import.meta.url), "utf8");

test("全部關閉維持次要批次按鈕，僅在按下時加深金棕底色", () => {
  const base = ruleBodies(css, /^\.notifications-screen-v2 \.notification-bulk-disable$/);
  assert.equal(base.length, 1);
  assert.match(base[0], /border:\s*1px solid rgba\(216, 195, 141, \.72\);/);
  assert.match(base[0], /background:\s*#160f08;/);
  assert.match(base[0], /box-shadow:\s*none;/);

  const active = ruleBodies(css, /^\.notifications-screen-v2 \.notification-bulk-disable:active$/);
  assert.equal(active.length, 1);
  assert.match(active[0], /background:\s*#2b1b09;/);
  assert.match(active[0], /filter:\s*none;/);
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
