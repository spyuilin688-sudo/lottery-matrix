import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/homepage/base.css", import.meta.url), "utf8");

test("Matrix Core 上下外框內縮但素材維持等比例", () => {
  assert.match(
    css,
    /--home-core-height:\s*clamp\(68px,\s*calc\(\(var\(--home-core-width\) \* 414 \/ 1536\) - 18px\),\s*79px\);/,
  );

  const bannerRule = css.match(/\.home-screen \.matrix-core-banner \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(bannerRule, /background:\s*url\("\/assets\/lottery\/functions\/matrixcore\.png"\) center \/ cover no-repeat;/);
  assert.doesNotMatch(bannerRule, /100% 100%/);
});
