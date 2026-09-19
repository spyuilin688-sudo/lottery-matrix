import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const featureSource = readFeaturePagesSource();
const guideSource = fs.readFileSync(new URL("../src/features/MatrixGuidePage.tsx", import.meta.url), "utf8");
const featureCss = fs.readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const guideAdjustmentsCss = fs.readFileSync(new URL("../src/feature-page-adjustments.css", import.meta.url), "utf8");
const responsiveCss = fs.readFileSync(new URL("../src/responsive-feature-pages.css", import.meta.url), "utf8");

function guideSection(title) {
  const start = guideSource.indexOf(`      title: "${title}",`);
  assert.ok(start >= 0, `missing guide chapter: ${title}`);
  const end = guideSource.indexOf('\n    {\n', start);
  return guideSource.slice(start, end < 0 ? undefined : end);
}

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
  assert.match(featureSource, /第二段球位\.png[^\n]*天工球位/);
  assert.match(featureSource, /版路類型\.png[^\n]*版路類型/);
});

test("Matrix Guide contains the current chapters and supported notification set", () => {
  for (const title of ["Matrix 天衡", "Matrix 天衍", "Matrix 天工", "歷史開獎號碼"]) {
    assert.match(guideSource, new RegExp(`title: "${title}"`));
  }
  assert.match(
    guideSource,
    /summary: "可設定選號提醒、開獎結果、Matrix 狀態、Matrix 牌單、Matrix Pro 與系統通知；實際可用項目依登入狀態與目前權限顯示。"/,
  );
  assert.match(guideSource, /標準範圍：上 1 ~ 7、當期、下 N 至結果期前一期；不包含結果期。/);
  assert.match(guideSource, /完整範圍：上 1 ~ 14、當期、下 N 至結果期前一期；不包含結果期。/);
  assert.match(guideSource, /title: "自訂觸發條件"/);
  assert.match(guideSource, /title: "四狀態條件設定"/);
  assert.doesNotMatch(guideSource, /投注通知|中獎通知/);
});

test("Matrix Guide documents the current Explore date controls and fixed Tiangong contract", () => {
  const explore = guideSection('Matrix 探索');
  const tiangong = guideSection('Matrix 天工');
  const tongxing = guideSection('Matrix 同星');

  assert.match(explore, /探索日期：可選本日 \(最新\)、昨日 \(上1期\)、前日 \(上2期\)。/);
  assert.match(tiangong, /固定使用五十期、二段式與準 2 進 3/);
  assert.match(tiangong, /流程固定為二段式，命中條件固定為準 2 進 3。/);
  assert.match(tiangong, /天工正式運算使用依號碼由小到大排序的資料。/);
  // 8fe6ee6 documents D-group exclusion; 準 3 進 4 is not another selectable mode.
  assert.match(tiangong, /準 3 進 4，該候選直接排除。/);
  assert.match(tiangong, /若歷史資料不足以完成 D 組排除檢查，正式結果不輸出該候選。/);
  assert.doesNotMatch(tiangong, /一段式|二段式可另外/);
  assert.doesNotMatch(tongxing, /近10期開獎號碼/);
});

test("Matrix Guide matches the current history filters and uses spaced halfwidth parentheses", () => {
  const sectionsStart = guideSource.indexOf("  const allSections: GuideSection[] = [");
  const sectionsEnd = guideSource.indexOf("\n  ];", sectionsStart);
  assert.ok(sectionsStart >= 0 && sectionsEnd > sectionsStart);
  const sections = guideSource.slice(sectionsStart, sectionsEnd);
  const copy = [...sections.matchAll(/"(?:\\.|[^"\\])*"/g)]
    .map(([literal]) => JSON.parse(literal)).join('\n');
  const history = guideSection('歷史開獎號碼');

  assert.match(history, /依彩種、號碼順序、日期或探索範圍查詢歷史開獎資料。/);
  assert.match(history, /選擇彩種與號碼順序；天天樂固定使用順球。/);
  assert.match(history, /可依年、月、日設定日期條件，或選擇1000期、3000期、5000期、所有期數的探索範圍。/);
  assert.match(history, /最後變更日期時，以日期條件為主；最後變更探索範圍時，以探索範圍為主。/);
  assert.doesNotMatch(history, /期數查詢|或期數設定|期數，以期數條件/);
  assert.doesNotMatch(copy, /[（）]/);
  assert.doesNotMatch(copy, /(?<! )\(/);
});

test("Matrix Guide explains current validation rules without obsolete fixed combination totals", () => {
  const explore = guideSection('Matrix 探索');
  const tianyan = guideSection('Matrix 天衍');
  const tiangong = guideSection('Matrix 天工');

  // 8fe6ee6 deliberately replaced fixed totals with the current version's validation contract.
  assert.match(explore, /依所選彩種、探索期數、號碼順序與球位建立鎖定條件/);
  assert.match(explore, /今彩539與天天樂每期使用 5 個球位；六合彩與大樂透使用 6 個正碼球位及特別號/);
  assert.match(explore, /加減、合值與拖牌依各自規則進行驗證，實際結果以目前演算法版本運算為準。/);
  assert.doesNotMatch(explore, /6,760|13,286|147,407/);
  assert.match(tianyan, /複合版路每組使用 1 個鎖定條件與 2 條規則。/);
  assert.match(tianyan, /每條規則各驗證 1 個球位；同一球位時，兩條規則必須使用不同演算法。/);
  assert.match(tiangong, /定位版路不使用鎖定條件；來源以 C、B、A 三組等距排列建立版路。/);
  assert.match(tiangong, /第一段要求 C、B、A 三組使用相同完整規則成立；第二段使用 C、B 驗證相同完整規則，再由 A 產生下一期結果。/);
  assert.match(tiangong, /探索、第一段與第二段各自使用一條球位路徑，球位不可循環越界。/);
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
  assert.match(guideAdjustmentsCss, /\.matrix-guide-screen \.guide-category-strip \.guide-category-card\s*\{[^}]*border:\s*1px solid var\(--pwa-frame-tertiary\);[^}]*border-radius:\s*var\(--pwa-frame-radius\);[^}]*color:\s*#d4cdc2;/s);
  assert.match(guideAdjustmentsCss, /\.matrix-guide-screen \.guide-category-strip \.guide-category-card > span\s*\{[^}]*color:\s*#c49145;/s);
  assert.match(guideAdjustmentsCss, /\.matrix-guide-screen \.guide-category-strip \.guide-category-card\[data-selected="true"\]\s*\{[^}]*border-color:\s*var\(--pwa-frame-secondary\);[^}]*background:\s*var\(--pwa-control-selected\);[^}]*color:\s*var\(--pwa-frame-secondary\);[^}]*box-shadow:\s*none;/s);
  assert.match(guideAdjustmentsCss, /\.matrix-guide-screen \.guide-preview h2\s*\{[^}]*color:\s*#f4ce67;/s);
  assert.match(guideAdjustmentsCss, /\.matrix-guide-screen \.guide-preview header > span\s*\{[^}]*border:\s*1px solid var\(--pwa-frame-tertiary\);[^}]*border-radius:\s*50%;[^}]*color:\s*#c49145;/s);
  assert.match(guideAdjustmentsCss, /\.matrix-guide-screen \.guide-preview \.guide-summary\s*\{[^}]*border-bottom:\s*1px solid var\(--pwa-frame-divider\);[^}]*color:\s*#d4cdc2;/s);
  assert.match(guideAdjustmentsCss, /\.matrix-guide-screen \.guide-detail-block\s*\{[^}]*border-bottom:\s*1px solid var\(--pwa-frame-divider\);/s);
  assert.match(guideAdjustmentsCss, /\.matrix-guide-screen \.guide-detail-block h3\s*\{[^}]*color:\s*#c49145;/s);
  assert.match(guideAdjustmentsCss, /\.matrix-guide-screen \.guide-detail-block li::before\s*\{[^}]*background:\s*#c49145;/s);
  assert.match(guideAdjustmentsCss, /\.matrix-guide-screen \.guide-detail-block ul\s*\{[^}]*color:\s*#bbb4aa;/s);
});
