import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const prototype = readFileSync(new URL("../src/Prototype.tsx", import.meta.url), "utf8");
const navigationCss = readFileSync(new URL("../src/prototype.css", import.meta.url), "utf8");
const notificationCss = readFileSync(new URL("../src/feature-page-adjustments.css", import.meta.url), "utf8");

test("首頁快捷設定按鈕由左下角原位置向右與向上各移動 4px", () => {
  assert.match(
    navigationCss,
    /\.bottom-navigation-quick-settings\s*\{[^}]*left:\s*max\(10px, calc\(env\(safe-area-inset-left, 0px\) \+ 4px\)\);[^}]*right:\s*auto;[^}]*bottom:\s*calc\(var\(--bottom-nav-safe-area\) \+ 9px\);/s,
  );
});

test("快捷設定雙擊後的對話框固定在可視區且內容使用緊湊響應式尺寸", () => {
  const backdrop = navigationCss.match(/\.quick-settings-backdrop\s*\{([^}]*)\}/s)?.[1] ?? "";
  assert.match(backdrop, /position:\s*fixed;/);
  assert.match(backdrop, /inset:\s*0;/);
  assert.match(backdrop, /z-index:\s*var\(--z-backdrop\);/);
  assert.match(
    navigationCss,
    /\.quick-settings-dialog\s*\{[^}]*width:\s*min\(calc\(100% - 40px\), 330px\);[^}]*max-height:\s*calc\(100dvh - 40px\);/s,
  );
  assert.match(
    navigationCss,
    /\.quick-settings-dialog > div > button\s*\{[^}]*min-height:\s*44px;[^}]*grid-template-columns:\s*32px minmax\(0, 1fr\) 8px;/s,
  );
  assert.match(
    navigationCss,
    /\.quick-settings-dialog img\s*\{[^}]*width:\s*32px;[^}]*height:\s*32px;[^}]*object-fit:\s*contain;/s,
  );
});

test("快捷設定使用指定的五個最新圖示", () => {
  for (const filename of [
    "快捷同星.png",
    "快捷歷史號碼.png",
    "快捷計算機.png",
    "快捷對照單.png",
    "快捷筆記本.png",
  ]) {
    assert.match(prototype, new RegExp(`/assets/lottery/functions/${filename.replace(".", "\\.")}`));
  }
});

test("通知卡與操作列使用確認後的響應式間距與尺寸", () => {
  assert.match(
    notificationCss,
    /\.notifications-screen-v2 \.feature-body\s*\{[^}]*padding:\s*0 20px calc\(var\(--layout-bottom-nav-clearance\) \+ 8px\);/s,
  );
  assert.match(notificationCss, /\.notifications-screen-v2 \.notification-list\s*\{[^}]*gap:\s*8px;/s);
  assert.match(
    notificationCss,
    /\.notifications-screen-v2 \.notification-actions\s*\{[^}]*grid-template-columns:\s*64px 38px;[^}]*gap:\s*12px;/s,
  );
  assert.match(
    notificationCss,
    /\.notifications-screen-v2 \.notification-actions > \.toggle\s*\{[^}]*height:\s*18px;/s,
  );
  assert.match(
    notificationCss,
    /\.notifications-screen-v2 \.toggle::before\s*\{[^}]*height:\s*18px;/s,
  );
  assert.match(
    notificationCss,
    /\.notifications-screen-v2 \.toggle span\s*\{[^}]*width:\s*14px;[^}]*height:\s*14px;/s,
  );
});

test("通知 Matrix Pro 標籤縮小約 15% 並與名稱保持 1.5px 間距", () => {
  assert.match(
    notificationCss,
    /\.notifications-screen-v2 \.notification-title h2:has\(em\)\s*\{[^}]*gap:\s*1\.5px;/s,
  );
  assert.match(
    notificationCss,
    /\.notifications-screen-v2 \.notification-title h2 em\s*\{[^}]*height:\s*12px;[^}]*padding:\s*0 3\.5px;[^}]*border-radius:\s*4px;[^}]*font-size:\s*7px;/s,
  );
});
