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

test("通知批次按鈕列使用 18px 外距且不靠負 margin 或超寬補償", () => {
  const screen = ruleBodies(css, /^\.notifications-screen-v2$/);
  const featureBody = ruleBodies(css, /^\.notifications-screen-v2 \.feature-body$/);
  const bulk = ruleBodies(css, /^\.notifications-screen-v2 \.notification-bulk-actions$/);
  const list = ruleBodies(css, /^\.notifications-screen-v2 \.notification-list$/);

  assert.equal(screen.length, 1);
  assert.equal(featureBody.length, 1);
  assert.equal(bulk.length, 1);
  assert.equal(list.length, 1);

  assert.match(screen[0], /--notification-bulk-inline:\s*18px;/);
  assert.match(screen[0], /--notification-list-inline:\s*20px;/);
  assert.match(featureBody[0], /padding-inline:\s*var\(--notification-bulk-inline\);/);
  assert.match(bulk[0], /width:\s*100%;/);
  assert.match(bulk[0], /margin-inline:\s*0;/);
  assert.doesNotMatch(bulk[0], /width:\s*calc\([^)]*\+[^)]*\)/);
  assert.doesNotMatch(bulk[0], /margin-inline:\s*-/);
  assert.match(list[0], /margin-inline:\s*calc\(var\(--notification-list-inline\) - var\(--notification-bulk-inline\)\);/);
});

test("四個 Matrix Pro 標籤由單一 3px owner 往下重疊圖示", () => {
  const screen = ruleBodies(css, /^\.notifications-screen-v2$/);
  const matrixHeading = ruleBodies(css, /^\.notifications-screen-v2 \.notification-heading:has\(\.notification-pro-badge\)$/);
  const badge = ruleBodies(css, /^\.notifications-screen-v2 \.notification-pro-badge$/);

  assert.equal(screen.length, 1);
  assert.equal(matrixHeading.length, 0);
  assert.equal(badge.length, 1);

  assert.match(screen[0], /--notification-pro-badge-overlap:\s*3px;/);
  assert.match(badge[0], /translate:\s*0 var\(--notification-pro-badge-overlap\);/);
  assert.doesNotMatch(badge[0], /transform\s*:/);
  assert.doesNotMatch(badge[0], /(?:top|bottom|inset-block|margin-block-end)\s*:/);
});


test("通知批次按鈕區與通知列表維持 8px 間距", () => {
  const mobileCss = readFileSync(new URL("../src/mobile-layout-polish.css", import.meta.url), "utf8");
  const content = ruleBodies(mobileCss, /^\.notifications-screen-v2 \.notification-content$/);
  assert.equal(content.length, 1);
  assert.match(content[0], /row-gap:\s*8px;/);
});

test("Matrix 通知群組上框線與列分隔線由下移 3px 的偽元素繪製", () => {
  const group = ruleBodies(css, /^\.notifications-screen-v2 \.notification-group$/);
  const groupBefore = ruleBodies(css, /^\.notifications-screen-v2 \.notification-group::before$/);
  const rowBefore = ruleBodies(css, /^\.notifications-screen-v2 \.notification-group \.notification-row \+ \.notification-row::before$/);

  assert.equal(group.length, 1);
  assert.equal(groupBefore.length, 1);
  assert.equal(rowBefore.length, 1);
  assert.match(group[0], /position:\s*relative;/);
  assert.match(group[0], /border-top-color:\s*transparent;/);
  assert.match(groupBefore[0], /top:\s*3px;/);
  assert.match(rowBefore[0], /top:\s*3px;/);
});
