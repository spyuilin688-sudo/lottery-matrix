import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const headerBackgroundCss = readFileSync("src/matrix-explore-header-background.css", "utf8");
const featureAdjustmentsCss = readFileSync("src/feature-page-adjustments.css", "utf8");

test("Matrix Explore title card has one background owner and no later frame override", () => {
  assert.match(
    headerBackgroundCss,
    /\.matrix-explore-screen\s*>\s*\.product-header\[data-product-header="Matrix 探索"\][\s\S]*--product-header-background:\s*url\("\/assets\/lottery\/header-explore-luxury-flow\.svg"\);/,
  );

  assert.doesNotMatch(featureAdjustmentsCss, /header-explore-planet\.svg/);
  assert.doesNotMatch(
    featureAdjustmentsCss,
    /\.feature-brand-header\[data-product-header="Matrix 探索"\]\s+\.product-header__frame\s*\{[\s\S]*?background(?:-image)?\s*:/,
  );
});
