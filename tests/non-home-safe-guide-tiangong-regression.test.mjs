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

test("Tiangong second-stage rows keep their matching icons with unified labels", () => {
  assert.match(featureSource, /第二段球位\.png[^\n]*探索球位/);
  assert.match(featureSource, /版路類型\.png[^\n]*版路類型/);
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

test("Matrix Guide only documents the current Explore date and fixed Tiangong contract", () => {
  const guide = featureSource.slice(featureSource.indexOf("const GUIDE_LOOP_GROUPS"));
  const explore = guide.slice(guide.indexOf('title: "Matrix 探索"'), guide.indexOf('title: "Matrix 天衍"'));
  const tiangongStart = guide.indexOf('title: "Matrix 天工"');
  const tiangong = guide.slice(tiangongStart, guide.indexOf('title: "Matrix 狀態"', tiangongStart));
  const tongxingStart = guide.indexOf('title: "Matrix 同星"');
  const tongxing = guide.slice(tongxingStart, guide.indexOf('title: "號碼對照單"', tongxingStart));

  assert.match(explore, /探索日期：只使用本日（最新）。/);
  assert.doesNotMatch(explore, /昨日|前日/);
  assert.match(tiangong, /固定以二段式與準2進3/);
  assert.match(tiangong, /流程固定為二段式。/);
  assert.match(tiangong, /命中條件固定為準2進3。/);
  assert.doesNotMatch(tiangong, /一段式|準3進4|二段式可另外/);
  assert.doesNotMatch(tongxing, /近10期開獎號碼/);
});
