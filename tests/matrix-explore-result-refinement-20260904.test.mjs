import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const featurePages = readFeaturePagesSource();
const previewPage = readFileSync(new URL("../src/ExploreResultPreviewPage.tsx", import.meta.url), "utf8");
const previewCss = readFileSync(new URL("../src/explore-result-preview.css", import.meta.url), "utf8");
const spacingCss = readFileSync(new URL("../src/matrix-explore-spacing.css", import.meta.url), "utf8");
const migrationUrl = new URL("../supabase/migrations/20260904040000_matrix_explore_prediction_number_group_order.sql", import.meta.url);

test("Matrix 探索依命中條件與版路類型套用正確預設連準", () => {
  assert.match(featurePages, /const defaultFiltersFor = \(hitValue: string, roadValue: string\): ConsecutiveOption\[\] =>/);
  assert.match(featurePages, /hitValue === "準4\+（鎖定1碼）"[\s\S]*?isTrailer[\s\S]*?"準5進6", "準6進7", "準7進8"[\s\S]*?"準6進7", "準7進8"/);
  assert.match(featurePages, /"準6進7", "準7進8", "準9進10", "準11進12"[\s\S]*?"準9進10", "準11進12"/);
});

test("切換版路會同步切換對應的預設連準", () => {
  assert.match(featurePages, /const changeRoad = \(value: string\) => \{[\s\S]*?setRoad\(value\);[\s\S]*?setSelectedFilters\(defaultFiltersFor\(hit, value\)\)/);
  assert.match(featurePages, /onClick=\{\(\) => changeRoad\(v\)\}/);
});

test("同碼模式在不同預測號碼群組交界建立明確分隔線", () => {
  assert.match(featurePages, /data-number-group-start=\{sameCode && index > 0 && paginatedResults\[index - 1\]\?\.prediction !== item\.prediction \? "true" : undefined\}/);
  assert.match(spacingCss, /article\[data-number-group-start="true"\][\s\S]*?border-top:\s*0\.7px solid rgba\(230, 183, 106, \.72\)/);
});

test("點擊重複號碼小卡後使用與同碼相同的群組排序", () => {
  assert.equal(existsSync(migrationUrl), true, "缺少 prediction-number 群組排序 migration");
  const migration = readFileSync(migrationUrl, "utf8");
  assert.match(migration, /case when v_same or v_prediction_number is not null then filtered\.prediction_numbers::text else '' end/);
});

test("探索結果表頭文字到底部分隔線保留 5px", () => {
  assert.match(spacingCss, /matrix-explore-main-screen \.road-results-head[\s\S]*?align-items:\s*end;[\s\S]*?padding-bottom:\s*5px;/);
});

test("探索展開內容上下分隔線到摘要與本期預測皆為 12px", () => {
  assert.match(previewCss, /matrix-explore-main-screen:not\(\.matrix-tianyan-screen\) \.explore-validation-card[\s\S]*?padding-block:\s*12px;/);
});

test("探索右欄公式的第、球位、顆使用 1px 間距", () => {
  const positionStructure = /explore-validation-formula-position[\s\S]*?<span>第<\/span>[\s\S]*?<span>\{position\}<\/span>[\s\S]*?<span>顆<\/span>/;
  assert.match(featurePages, positionStructure);
  assert.match(previewPage, positionStructure);
  assert.match(previewCss, /\.explore-validation-formula-position[\s\S]*?gap:\s*1px;/);
});

test("今彩539與天天樂中欄五碼間距增加 1px 且不改欄寬列高", () => {
  assert.match(previewCss, /data-lottery="今彩539"[\s\S]*?data-lottery="天天樂"[\s\S]*?data-wide-numbers="false"[\s\S]*?gap:\s*calc\(clamp\(4px, 1\.5vw, 6px\) \+ 1px\);[\s\S]*?padding-inline:\s*4px;/);
});

test("探索右欄第三列結果數字縮小 2px 並增加左右各 2px 間距", () => {
  assert.match(previewCss, /matrix-explore-main-screen:not\(\.matrix-tianyan-screen\) \.explore-validation-result-number[\s\S]*?font-size:\s*calc\(\.8em - 2px\);[\s\S]*?margin-inline:\s*2px;/);
});
