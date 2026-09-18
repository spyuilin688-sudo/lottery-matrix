import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/homepage/base.css", import.meta.url), "utf8");

test("Matrix Core 保留參考圖比例且素材等比例填滿", () => {
  assert.match(
    css,
    /--home-core-height:\s*calc\(var\(--home-core-width\) \* 181 \/ 654\);/,
  );

  const bannerRules = [...css.matchAll(/\.home-screen \.matrix-core-banner \{[\s\S]*?\n\}/g)].map(
    ([rule]) => rule,
  );
  const bannerRule = bannerRules.find((rule) => /core-artwork\.webp/.test(rule)) ?? "";

  assert.match(bannerRule, /background:\s*url\("\/assets\/lottery\/home-premium\/core-artwork\.webp"\) center \/ cover no-repeat;/);
  assert.doesNotMatch(bannerRule, /100% 100%/);
});
