import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/BottomNavigation.tsx", import.meta.url), "utf8");

test("快捷設定由長按 1.5 秒觸發並移除上滑門檻", () => {
  assert.match(source, /const QUICK_LONG_PRESS_MS = 1_500;/);
  assert.match(source, /setTimeout\([\s\S]*?onQuickConfigure\?\.\(\)[\s\S]*?QUICK_LONG_PRESS_MS/);
  assert.doesNotMatch(source, /QUICK_SWIPE_TRIGGER_PX|moveQuickPress|quickDragOffset|translateY\(/);
  assert.match(source, /快捷；長按 1\.5 秒開啟設定/);
});
