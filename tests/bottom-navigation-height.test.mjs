import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("底部導覽使用 72px 高度且非首頁保留 8px 可見間距", () => {
  const tokens = fs.readFileSync(new URL("../src/design-tokens.css", import.meta.url), "utf8");
  const prototype = fs.readFileSync(new URL("../src/prototype.css", import.meta.url), "utf8");
  assert.match(tokens, /--bottom-navigation-height:\s*72px;/);
  assert.match(tokens, /--layout-bottom-nav-clearance:\s*calc\(var\(--bottom-navigation-height\) \+ env\(safe-area-inset-bottom,\s*0px\)\);/);
  assert.doesNotMatch(tokens, /--layout-bottom-nav-clearance:[^;]*--mobile-safe-area-height/);
  assert.match(prototype, /\.bottom-nav-brand-screen:not\(\.notifications-screen\) > \.feature-body\s*\{[^}]*padding-bottom:\s*calc\(var\(--layout-bottom-nav-clearance\) \+ 8px\);/s);
});
