import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ruleBodies } from "./helpers/css-rules.mjs";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const featurePages = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const brandHeaderStyles = readFileSync(new URL("../src/brand-header-unify.css", import.meta.url), "utf8");
const homepageStyles = readLocalCss(new URL("../src/homepage-repair.css", import.meta.url));
const exploreSpacingStyles = readFileSync(new URL("../src/matrix-explore-spacing.css", import.meta.url), "utf8");

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
    ["Matrix Pro 會員方案與收費標準", "會員方案標題K.png"],
    ["Matrix 自訂觸發狀態", "自訂觸發標題K.png"],
  ];

  for (const [title, file] of expectedArtwork) {
    assert.match(featurePages, new RegExp(`"${title}": "/assets/lottery/functions/${file.replace(".", "\\.")}"`));
  }
});

test("integrated title artwork uses current sixteen-pixel side margins and proportional height", () => {
  assert.match(styles, /\.matrix-title-banner\s*\{[^}]*width:\s*calc\(100% - 32px\)[^}]*margin:\s*0 auto/s);
  assert.match(styles, /\.matrix-title-banner\s*>\s*img\s*\{[^}]*width:\s*100%[^}]*height:\s*auto[^}]*object-fit:\s*contain/s);
  assert.match(styles, /\.integrated-title-back\s*\{[^}]*width:\s*44px[^}]*height:\s*44px[^}]*background:\s*transparent/s);
  assert.match(brandHeaderStyles, /\.feature-brand-header,\s*\.feature-brand-header\[data-compact="true"\]\s*\{[^}]*margin:\s*0 auto var\(--layout-section-gap\)/s);
  assert.match(brandHeaderStyles, /\.feature-brand-header\.integrated-title-header\s*\{[^}]*padding-top:\s*8px/s);
  assert.doesNotMatch(brandHeaderStyles, /\.feature-brand-header\.integrated-title-header\s*\{[^}]*margin-bottom\s*:/s);
});

test("Matrix explore title owns Tianyan and Tiangong controls", () => {
  const start = featurePages.indexOf("function MatrixPageSwitcher");
  const end = featurePages.indexOf("const ROAD_VALIDATION_SAMPLE_HISTORY", start);
  const switcher = featurePages.slice(start, end);
  assert.match(featurePages, /\{ screen: "explore", label: "Matrix 探索", image: "[^"]*Matrix探索\.png" \}/);
  assert.match(featurePages, /\{ screen: "tianyan", label: "Matrix 天衍", image: "[^"]*Matrix天衍\.png" \}/);
  assert.match(featurePages, /\{ screen: "tiangong", label: "Matrix 天工", image: "[^"]*Matrix天工\.png" \}/);
  assert.match(switcher, /MATRIX_LOOP_ITEMS\.map/);
  assert.match(featurePages, /headerAction=\{<MatrixPageSwitcher current=\{title === "Matrix 天衍" \? "tianyan" : "explore"\}/);
  assert.match(exploreSpacingStyles, /\.matrix-explore-main-screen \.matrix-title-banner-actions\s*\{[^}]*left:\s*calc\(83% \+ 4px\);[^}]*width:\s*2\.34rem;[^}]*height:\s*2\.34rem;/s);
  assert.doesNotMatch(exploreSpacingStyles, /\.matrix-explore-main-screen \.matrix-title-banner-actions \.matrix-page-switcher\s*\{[^}]*(?:gap:\s*4px|width:\s*auto|height:\s*auto)/s);
  assert.doesNotMatch(styles, /\.matrix-title-banner-actions \.matrix-page-switcher button\s*\{[^}]*opacity:\s*0;/s);
});

test("status and profile flows use the supplied title artwork and status trigger icon", () => {
  assert.match(featurePages, /headerArtwork="\/assets\/lottery\/functions\/我的標題K\.png"/);
  assert.match(featurePages, /headerArtwork = "\/assets\/lottery\/functions\/我的標題K2\.png"/);
  assert.match(featurePages, /\/assets\/lottery\/functions\/自訂觸發條件\.png/);
});

test("history title card owns the filter trigger while the panel owns the lottery dropdown", () => {
  const start = featurePages.indexOf("export function DrawHistoryPage");
  const end = featurePages.indexOf("function RoadValidationProcess", start);
  const historyPage = featurePages.slice(start, end);
  assert.match(historyPage, /className="history-title-actions title-card-compact-actions"/);
  assert.match(historyPage, /aria-label="彩種"/);
  assert.match(historyPage, /篩選設定/);
  const titleActions = historyPage.slice(
    historyPage.indexOf("const historyTitleActions"),
    historyPage.indexOf("return (", historyPage.indexOf("const historyTitleActions")),
  );
  assert.doesNotMatch(titleActions, /aria-label="彩種"/);
  assert.doesNotMatch(historyPage, /<LotteryTabs/);
});

test("number reference title card owns refresh and explore settings", () => {
  const start = featurePages.indexOf("export function NumberReferencePage");
  const end = featurePages.indexOf("export function CalculatorPage", start);
  const referencePage = featurePages.slice(start, end);
  assert.match(referencePage, /className="reference-title-actions title-card-compact-actions"/);
  assert.match(referencePage, /刷新/);
  assert.match(referencePage, /探索設定/);
});

test("home and Matrix status use the shared Matrixbba switcher and preserve selected outline only", () => {
  assert.match(featurePages, /className="lottery-switcher--home-style matrix-status-lottery-switcher" \/>/);
  assert.doesNotMatch(featurePages, /className="matrix-status-lottery-switcher" independentCards/);
  const switcherBodies = ruleBodies(homepageStyles, /^\.lottery-switcher--home-style$/);
  assert.ok(switcherBodies.some((body) => /width:\s*calc\(100% - 32px\);/.test(body) && /margin-inline:\s*0;/.test(body)));
  assert.ok(switcherBodies.some((body) => /padding-inline:\s*0;/.test(body)));
  const homeFlowBodies = ruleBodies(homepageStyles, /^\.home-screen \.lottery-switcher$/);
  assert.ok(homeFlowBodies.some((body) => /margin-block-start:\s*var\(--home-gap-logo-switcher\);/.test(body)));
  const selectedOutline = ruleBodies(
    homepageStyles,
    /^\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\[data-selected="true"\]::after$/,
  );
  assert.equal(selectedOutline.length, 1);
  assert.match(selectedOutline[0], /mask-composite:\s*exclude;/);
  assert.doesNotMatch(homepageStyles, /lottery-switcher\[data-independent-cards="true"\][^{]*home-asset-image[^}]*display:\s*none/s);
});

test("history filter keeps lottery date order range and submit controls without the obsolete reset", () => {
  for (const content of ["彩種", "年份", "月份", "日期", "號碼順序", "1000期", "3000期", "5000期", "所有期數", "開始探索"]) {
    assert.match(featurePages, new RegExp(content));
  }
  assert.doesNotMatch(featurePages.slice(featurePages.indexOf("export function DrawHistoryPage"), featurePages.indexOf("function RoadValidationProcess")), /history-reset-trigger/);
});

test("calculator keeps the approved compact responsive layout source", () => {
  assert.match(styles, /\.calculator-screen\s*\{[^}]*display:\s*flex[^}]*height:\s*100vh[^}]*flex-direction:\s*column[^}]*overflow:\s*hidden/s);
  assert.match(styles, /\.calculator-screen\s*>\s*\.feature-body\s*\{[^}]*padding:\s*0 var\(--layout-page-inline\) var\(--layout-bottom-nav-clearance\);[^}]*overflow-y:\s*auto/s);
  assert.match(styles, /\.number-grid\s*\{[^}]*grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)[^}]*gap:\s*6px/s);
  assert.match(styles, /\.column-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(styles, /\.calculation-results\s*>\s*div\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)[^}]*gap:\s*8px/s);
  for (const selector of [".calculator-panel > header > div", ".calculator-panel > header .calculator-actions", ".calculator-panel header strong"]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.equal((styles.match(new RegExp(`(^|\\n)\\s*${escaped}\\s*\\{`, "g")) ?? []).length, 1, `${selector} must have one source`);
  }
});
