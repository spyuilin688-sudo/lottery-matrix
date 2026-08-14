import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("底部導覽使用 95px 高度，內容保留完整導覽與安全區空間", () => {
  const tokens = fs.readFileSync(new URL("../src/design-tokens.css", import.meta.url), "utf8");
  const prototype = fs.readFileSync(new URL("../src/prototype.css", import.meta.url), "utf8");

  assert.match(tokens, /--bottom-navigation-height:\s*95px;/);
  assert.match(
    tokens,
    /--layout-bottom-nav-clearance:\s*calc\(var\(--bottom-navigation-height\) \+ var\(--mobile-safe-area-height, 34px\) \+ 16px\);/,
  );
  const artworkRule = prototype.match(/\.bottom-navigation-artwork\s*\{[^}]+\}/s)?.[0] ?? "";
  assert.doesNotMatch(artworkRule, /clip-path/);

  assert.match(
    prototype,
    /\.bottom-nav-brand-screen > \.feature-body\s*\{[^}]*padding-bottom:\s*calc\(var\(--layout-bottom-nav-clearance\) \+ 36px\);/s,
  );
});
