import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const featureSource = fs.readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
const featureCss = fs.readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const responsiveCss = fs.readFileSync(new URL("../src/responsive-feature-pages.css", import.meta.url), "utf8");

test("all non-home feature pages reserve a visible 8px gap above bottom navigation", () => {
  assert.match(
    featureCss,
    /\.feature-screen:not\(\.home-screen\)\s*>\s*\.feature-body\s*\{[^}]*padding-bottom:\s*calc\(var\(--layout-bottom-nav-clearance\) \+ 8px\)/s,
  );
  assert.doesNotMatch(featureCss, /padding-bottom:\s*106px/);
  assert.doesNotMatch(
    responsiveCss,
    /\.draw-history-screen\s+\.feature-body[\s\S]{0,500}padding:[^;]*var\(--layout-bottom-nav-clearance\)\s*;/,
  );
});

test("Matrix Explore hit and advanced card owns a 6px bottom inset", () => {
  assert.match(
    featureCss,
    /\.matrix-explore-screen\s+\.hit-advanced-panel\s*\{[^}]*padding-bottom:\s*6px/s,
  );
});

test("Tiangong second-stage rows use their matching setting icons", () => {
  assert.match(featureSource, /第二段球位\.png[^\n]*第二段球位/);
  assert.match(featureSource, /版路類型\.png[^\n]*第二段版路類型/);
});

test("Matrix Guide contains the requested chapters and exact notification set", () => {
  for (const title of ["Matrix 天衍", "Matrix 天工", "歷史開獎紀錄"]) {
    assert.match(featureSource, new RegExp(`title: "${title}"`));
  }
  assert.match(
    featureSource,
    /summary: "可設定選號提醒、開獎結果、中獎通知、Matrix 牌單、Matrix 狀態、系統通知。"/,
  );
  assert.match(featureSource, /標準範圍：上1～7、當期、下N至結果期前一期；不包含結果期。/);
  assert.match(featureSource, /完整範圍：上1～14、當期、下N至結果期前一期；不包含結果期。/);
  assert.match(featureSource, /title: "自訂觸發條件"/);
  assert.match(featureSource, /title: "四狀態條件設定"/);
  assert.doesNotMatch(featureSource, /投注通知/);
});
