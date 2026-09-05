import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const featureSource = readFeaturePagesSource();
const featureCss = fs.readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const guideAdjustmentsCss = fs.readFileSync(new URL("../src/feature-page-adjustments.css", import.meta.url), "utf8");
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
  assert.match(featureSource, /標準範圍：上1～7、當期、下 N 至結果期前一期；不包含結果期。/);
  assert.match(featureSource, /完整範圍：上1～14、當期、下 N 至結果期前一期；不包含結果期。/);
  assert.match(featureSource, /title: "自訂觸發條件"/);
  assert.match(featureSource, /title: "四狀態條件設定"/);
  assert.doesNotMatch(featureSource, /投注通知/);
});

test("Matrix Guide documents the current Explore date controls and fixed Tiangong contract", () => {
  const guide = featureSource.slice(featureSource.indexOf("const GUIDE_LOOP_GROUPS"));
  const explore = guide.slice(guide.indexOf('title: "Matrix 探索"'), guide.indexOf('title: "Matrix 天衍"'));
  const tiangongStart = guide.indexOf('title: "Matrix 天工"');
  const tiangong = guide.slice(tiangongStart, guide.indexOf('title: "Matrix 狀態"', tiangongStart));
  const tongxingStart = guide.indexOf('title: "Matrix 同星"');
  const tongxing = guide.slice(tongxingStart, guide.indexOf('title: "號碼對照單"', tongxingStart));

  assert.match(explore, /探索日期：可選本日 \(最新\)、昨日 \(上1期\)、前日 \(上2期\)。/);
  assert.match(tiangong, /固定以二段式與準2進3/);
  assert.match(tiangong, /流程固定為二段式。/);
  assert.match(tiangong, /命中條件固定為準2進3。/);
  assert.doesNotMatch(tiangong, /一段式|準3進4|二段式可另外/);
  assert.doesNotMatch(tongxing, /近10期開獎號碼/);
});

test("Matrix Guide matches the current history filters and uses spaced halfwidth parentheses", () => {
  const guideStart = featureSource.indexOf("const GUIDE_LOOP_GROUPS");
  const guideEnd = featureSource.indexOf("  const [selected, setSelected]", guideStart);
  const guide = featureSource.slice(guideStart, guideEnd);
  const sectionsStart = guide.indexOf("  const sections: GuideSection[] = [");
  const sectionsEnd = guide.indexOf("  ];", sectionsStart) + 4;
  const sections = guide.slice(sectionsStart, sectionsEnd);
  const historyStart = guide.indexOf('title: "歷史開獎紀錄"');
  const history = guide.slice(historyStart, guide.indexOf('title: "Matrix 探索"', historyStart));

  assert.match(history, /依彩種、號碼順序、日期或探索範圍查詢歷史開獎資料。/);
  assert.match(history, /選擇彩種與號碼順序。/);
  assert.match(history, /可依年、月、日設定日期條件，或選擇1000期、3000期、5000期、所有期數的探索範圍。/);
  assert.match(history, /最後變更日期時，以日期條件為主；最後變更探索範圍時，以探索範圍為主。/);
  assert.doesNotMatch(history, /期數查詢|或期數設定|期數，以期數條件/);
  assert.doesNotMatch(sections, /[（）]/);
  assert.doesNotMatch(sections, /(?<! )\(/);
});

test("Matrix Guide documents thirteen-period validation totals for every Matrix road", () => {
  const guide = featureSource.slice(featureSource.indexOf("const GUIDE_LOOP_GROUPS"));
  const explore = guide.slice(guide.indexOf('title: "Matrix 探索"'), guide.indexOf('title: "Matrix 天衍"'));
  const tianyan = guide.slice(guide.indexOf('title: "Matrix 天衍"'), guide.indexOf('title: "Matrix 天工"'));
  const tiangongStart = guide.indexOf('title: "Matrix 天工"');
  const tiangong = guide.slice(tiangongStart, guide.indexOf('title: "Matrix 狀態"', tiangongStart));

  assert.match(explore, /今彩539：依號碼由小到大排序 65 個；依實際開獎順序排序 65 個鎖定條件。/);
  assert.match(explore, /天天樂：依號碼由小到大排序 65 個鎖定條件。/);
  assert.match(explore, /加減版路驗證球位：每種排序合計 6,760 個。/);
  assert.match(explore, /合值版路驗證球位：每種排序合計 6,760 個。/);
  assert.match(explore, /拖牌版路驗證球位：每種排序合計 65 個。/);
  assert.match(explore, /六合彩、大樂透：依號碼由小到大排序 91 個；依實際開獎順序排序 91 個鎖定條件。/);
  assert.match(explore, /加減版路驗證球位：每種排序合計 13,286 個。/);
  assert.match(explore, /合值版路驗證球位：每種排序合計 13,286 個。/);
  assert.match(explore, /拖牌版路驗證球位：每種排序合計 91 個。/);
  assert.doesNotMatch(explore, /74、79、84、89/);
  assert.doesNotMatch(explore, /104、111、118、125/);
  assert.match(explore, /四彩種近十三期合計 147,407 個比對球位。/);
  assert.match(tianyan, /複合版路每組使用 1 個鎖定條件與 2 條規則。/);
  assert.match(tianyan, /每條規則各驗證 1 個球位；同一球位時，兩條規則必須使用不同演算法。/);
  assert.match(tiangong, /定位版路不使用鎖定條件；探索、第一段與第二段各使用1個球位路徑。/);
  assert.match(tiangong, /第一段驗證3個球位；第二段驗證前2個球位，第3個球位產生預測。/);
});

test("Matrix Guide keeps its content card compact without fixed empty height", () => {
  assert.match(guideAdjustmentsCss, /\.matrix-guide-screen \.guide-preview\s*\{[^}]*min-height:\s*0;[^}]*margin-top:\s*0;[^}]*padding:\s*14px;/s);
  assert.match(guideAdjustmentsCss, /\.matrix-guide-screen \.guide-preview \.guide-summary\s*\{[^}]*margin:\s*10px 0 0;[^}]*padding-bottom:\s*6px;/s);
  assert.match(guideAdjustmentsCss, /\.matrix-guide-screen \.guide-detail-block\s*\{[^}]*padding:\s*8px 0;/s);
  assert.match(guideAdjustmentsCss, /\.matrix-guide-screen \.guide-detail-block h3\s*\{[^}]*margin:\s*0 0 6px;/s);
  assert.match(guideAdjustmentsCss, /\.matrix-guide-screen \.guide-detail-block ul\s*\{[^}]*gap:\s*5px;/s);
  assert.match(guideAdjustmentsCss, /\.matrix-guide-screen \.guide-category-strip\s*\{[^}]*margin:\s*8px 4px 6px;/s);
});

test("Matrix Guide uses the same restrained gold system for its chapter controls and content", () => {
  assert.match(guideAdjustmentsCss, /\.matrix-guide-screen \.guide-category-strip \.guide-category-card\s*\{[^}]*border:\s*1px solid rgba\(196, 145, 69, \.42\);[^}]*border-radius:\s*12px;[^}]*color:\s*#d4cdc2;/s);
  assert.match(guideAdjustmentsCss, /\.matrix-guide-screen \.guide-category-strip \.guide-category-card > span\s*\{[^}]*color:\s*#c49145;/s);
  assert.match(guideAdjustmentsCss, /\.matrix-guide-screen \.guide-category-strip \.guide-category-card\[data-selected="true"\]\s*\{[^}]*border-color:\s*#f4ce67;[^}]*background:\s*rgba\(196, 145, 69, \.12\);[^}]*color:\s*#f4ce67;[^}]*box-shadow:\s*none;/s);
  assert.match(guideAdjustmentsCss, /\.matrix-guide-screen \.guide-preview h2\s*\{[^}]*color:\s*#f4ce67;/s);
  assert.match(guideAdjustmentsCss, /\.matrix-guide-screen \.guide-preview header > span\s*\{[^}]*border:\s*1px solid rgba\(196, 145, 69, \.42\);[^}]*border-radius:\s*50%;[^}]*color:\s*#c49145;/s);
  assert.match(guideAdjustmentsCss, /\.matrix-guide-screen \.guide-preview \.guide-summary\s*\{[^}]*border-bottom:\s*1px solid rgba\(196, 145, 69, \.42\);[^}]*color:\s*#d4cdc2;/s);
  assert.match(guideAdjustmentsCss, /\.matrix-guide-screen \.guide-detail-block\s*\{[^}]*border-bottom:\s*1px solid rgba\(196, 145, 69, \.42\);/s);
  assert.match(guideAdjustmentsCss, /\.matrix-guide-screen \.guide-detail-block h3\s*\{[^}]*color:\s*#c49145;/s);
  assert.match(guideAdjustmentsCss, /\.matrix-guide-screen \.guide-detail-block li::before\s*\{[^}]*background:\s*#c49145;/s);
  assert.match(guideAdjustmentsCss, /\.matrix-guide-screen \.guide-detail-block ul\s*\{[^}]*color:\s*#bbb4aa;/s);
});
