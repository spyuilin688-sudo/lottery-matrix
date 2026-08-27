import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/BottomNavigation.tsx", import.meta.url), "utf8");
const prototype = readFileSync(new URL("../src/Prototype.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/prototype.css", import.meta.url), "utf8");

test("快捷設定僅在首頁顯示並由連續兩次點擊開啟", () => {
  assert.match(source, /showQuickSettings\?: boolean/);
  assert.match(source, /const QUICK_SETTINGS_DOUBLE_TAP_MS = 400;/);
  assert.match(source, /handleQuickSettingsClick/);
  assert.match(source, /showQuickSettings && onQuickConfigure \? \(/);
  assert.match(prototype, /<BottomNavigation[\s\S]*?showQuickSettings \/>/);
  assert.doesNotMatch(source, /QUICK_LONG_PRESS_MS|onPointerDown|onPointerUp|onPointerCancel|setPointerCapture|長按/);
});

test("快捷設定縮小約 15% 並由原位置向左上各移動 4px", () => {
  assert.match(css, /\.bottom-navigation-quick-settings\s*\{[^}]*right:\s*max\(5px, calc\(env\(safe-area-inset-right, 0px\) \+ 4px\)\);[^}]*bottom:\s*calc\(var\(--bottom-nav-safe-area\) \+ 5px\);/s);
  assert.match(css, /\.bottom-navigation-quick-settings\s*\{[^}]*width:\s*25\.5px;[^}]*height:\s*25\.5px;/s);
  assert.match(css, /\.bottom-navigation-quick-settings-visual\s*\{[^}]*width:\s*25\.5px;[^}]*height:\s*25\.5px;/s);
});
