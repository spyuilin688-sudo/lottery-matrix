import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const featurePages = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const brandHeaderStyles = readFileSync(new URL("../src/brand-header-unify.css", import.meta.url), "utf8");
const homepageStyles = readFileSync(new URL("../src/homepage-repair.css", import.meta.url), "utf8");

test("confirmed feature pages use the latest integrated title artwork", () => {
  const expectedArtwork = [
    ["Matrix 探索", "探索標題K.png"],
    ["Matrix 天衍", "天衍標題K.png"],
    ["Matrix 天工", "天工標題K.png"],
    ["Matrix 指南", "指南標題K.png"],
    ["Matrix 同星", "同星標題K.png"],
    ["Matrix 牌單", "牌單標題K.png"],
    ["Matrix 狀態", "狀態標題K.png"],
    ["Matrix 筆記本", "筆記本標題K.png"],
    ["號碼對照單", "對照單標題K.png"],
    ["歷史開獎號碼", "歷史開獎標題K.png"],
    ["連碰計算機", "連碰標題K.png"],
    ["立柱計算機", "立柱標題K.png"],
    ["Matrix Pro 方案與收費標準", "會員方案標題K.png"],
    ["Matrix 自訂觸發狀態", "自訂觸發標題K.png"],
  ];

  for (const [title, file] of expectedArtwork) {
    assert.match(featurePages, new RegExp(`"${title}": "/assets/lottery/functions/${file.replace(".", "\\.")}"`));
  }
});

test("integrated title artwork uses twelve-pixel side margins, proportional height, and eight-pixel spacing", () => {
  assert.match(styles, /\.matrix-title-banner\s*\{[^}]*width:\s*calc\(100% - 24px\)[^}]*margin:\s*0 auto/s);
  assert.match(styles, /\.matrix-title-banner\s*>\s*img\s*\{[^}]*width:\s*100%[^}]*height:\s*auto[^}]*object-fit:\s*contain/s);
  assert.match(styles, /\.integrated-title-back\s*\{[^}]*width:\s*44px[^}]*height:\s*44px[^}]*background:\s*transparent/s);
  assert.match(brandHeaderStyles, /\.feature-brand-header\.integrated-title-header\s*\{[^}]*margin-bottom:\s*8px[^}]*padding-top:\s*8px/s);
});

test("Matrix explore title owns Tianyan and Tiangong controls", () => {
  const start = featurePages.indexOf("function MatrixPageSwitcher");
  const end = featurePages.indexOf("const ROAD_VALIDATION_SAMPLE_HISTORY", start);
  const switcher = featurePages.slice(start, end);
  assert.match(switcher, /Matrix天衍\.png/);
  assert.match(switcher, /Matrix天工\.png/);
  assert.doesNotMatch(switcher, /Matrix探索\.png/);
  assert.match(featurePages, /headerAction=\{title === "Matrix 探索" \? <MatrixPageSwitcher/);
});

test("history title card owns the lottery dropdown and filter trigger", () => {
  const start = featurePages.indexOf("export function DrawHistoryPage");
  const end = featurePages.indexOf("function RoadValidationProcess", start);
  const historyPage = featurePages.slice(start, end);
  assert.match(historyPage, /className="history-title-actions"/);
  assert.match(historyPage, /aria-label="彩種"/);
  assert.match(historyPage, /篩選條件/);
  assert.doesNotMatch(historyPage, /<LotteryTabs/);
});

test("number reference title card owns refresh and explore settings", () => {
  const start = featurePages.indexOf("export function NumberReferencePage");
  const end = featurePages.indexOf("export function CalculatorPage", start);
  const referencePage = featurePages.slice(start, end);
  assert.match(referencePage, /className="reference-title-actions"/);
  assert.match(referencePage, /刷新/);
  assert.match(referencePage, /探索設定/);
});

test("home and Matrix status use the shared Matrixbba switcher and preserve selected outline only", () => {
  assert.match(featurePages, /className="matrix-status-lottery-switcher" \/>/);
  assert.doesNotMatch(featurePages, /className="matrix-status-lottery-switcher" independentCards/);
  assert.match(homepageStyles, /\.home-screen \.lottery-switcher\s*\{[^}]*width:\s*calc\(100% - 24px\)[^}]*margin-inline:\s*12px[^}]*margin-block-end:\s*8px/s);
  assert.doesNotMatch(homepageStyles, /lottery-switcher\[data-independent-cards="true"\][^{]*home-asset-image[^}]*display:\s*none/s);
});

test("history filter keeps issue date order range reset and submit controls", () => {
  for (const content of ["期數", "日期", "號碼順序", "1000期", "3000期", "5000期", "所有期數", "重設", "開始探索"]) {
    assert.match(featurePages, new RegExp(content));
  }
});

test("calculator keeps the current single formal responsive layout source", () => {
  assert.match(styles, /\.calculator-screen\s*>\s*\.feature-body\s*\{[^}]*padding-inline:\s*12px[^}]*overflow-x:\s*hidden/s);
  assert.match(styles, /\.number-grid\s*\{[^}]*grid-template-columns:\s*repeat\(7,\s*42px\)[^}]*justify-content:\s*space-between[^}]*row-gap:\s*8px/s);
  assert.match(styles, /\.column-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(styles, /\.calculation-results\s*>\s*div\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*79px\)[^}]*justify-content:\s*space-between/s);
  for (const selector of [".calculator-panel > header > div", ".calculator-panel > header .calculator-actions", ".calculator-panel header strong"]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.equal((styles.match(new RegExp(`(^|\\n)\\s*${escaped}\\s*\\{`, "g")) ?? []).length, 1, `${selector} must have one source`);
  }
});
