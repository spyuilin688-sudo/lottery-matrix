import { readFeaturePagesSource } from "./helpers/read-feature-pages-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ruleBodies } from "./helpers/css-rules.mjs";
import { readLocalCss } from "./helpers/read-local-css.mjs";

const featurePages = readFeaturePagesSource();
const styles = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const brandHeaderStyles = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const homepageStyles = readLocalCss(new URL("../src/homepage-repair.css", import.meta.url));
const exploreSpacingStyles = readFileSync(new URL("../src/matrix-explore-spacing.css", import.meta.url), "utf8");

test("confirmed feature pages use the latest integrated title artwork [header migration]", () => {
  const header = readFileSync(new URL('../src/features/BrandHeader.tsx', import.meta.url), 'utf8');
  for (const title of ['Matrix 探索','Matrix 天衡','Matrix 天衍','Matrix 天工','Matrix 指南','Matrix 同星','Matrix 牌單','Matrix 狀態','Matrix 筆記本','號碼對照單','歷史開獎號碼','連碰計算機','立柱計算機']) assert.ok(header.includes(`"${title}":`));
  assert.match(header, /matrixYY\.png/);
  assert.doesNotMatch(featurePages, /MATRIX_TITLE_ARTWORK|integrated-title-header/);
});

test("integrated title artwork uses current sixteen-pixel side margins and proportional height [header migration]", () => {
  assert.match(styles, /\.product-header\s*\{[^}]*width:\s*100%;[^}]*padding:\s*0 var\(--layout-page-inline\);[^}]*margin-bottom:\s*var\(--layout-section-gap\);/s);
  assert.match(styles, /\.product-header__frame\s*\{[^}]*height:\s*var\(--product-header-frame-height, 68px\);/s);
  assert.match(styles, /\.product-header__mark\s*\{[^}]*width:\s*56px;[^}]*height:\s*48px;[^}]*object-fit:\s*contain;/s);
  assert.match(styles, /\.product-header__back\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/s);
});

test("Matrix settings heading owns the fixed four-page control", () => {
  const start = featurePages.indexOf("function MatrixPageSwitcher");
  const end = featurePages.indexOf("const ROAD_VALIDATION_SAMPLE_HISTORY", start);
  const switcher = featurePages.slice(start, end);
  for (const name of ["探索", "天衍", "天工"]) assert.ok(switcher.length > 0 && featurePages.includes(`Matrix${name}-icon.png`));
  assert.match(switcher, /MATRIX_PAGE_ITEMS\.map/);
  assert.match(switcher, /aria-current=\{item\.screen === current \? "page" : undefined\}/);
  assert.match(featurePages, /label: "Matrix 天衡", image: "\/assets\/lottery\/functions\/天衡\.png"/);
  assert.match(featurePages, /className="matrix-settings-heading">\s*<SectionTitle>\{settingsName\}設定<\/SectionTitle>\s*<MatrixPageSwitcher/s);
  assert.match(featurePages, /<SectionTitle>天工設定<\/SectionTitle>/);
  assert.doesNotMatch(featurePages, /headerAction=\{<MatrixPageSwitcher/);
  assert.match(styles, /\.matrix-settings-heading\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*space-between;/s);
});

test("status and profile flows use supplied artwork while status settings stays in the page header [header migration]", () => {
  assert.match(featurePages, /showBack=\{!logoOnlyHeader \|\| \(active === "我的" && backTarget === "profile"\) \|\| title === "Matrix 筆記本"\}/);
  assert.match(featurePages, /className="header-settings-button"[^>]*aria-label="自訂觸發條件，連續點擊兩下開啟"/s);
  assert.doesNotMatch(featurePages, /matrix-status-settings-entry/);
  assert.doesNotMatch(featurePages, /headerArtwork|status-title-trigger/);
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

test("number reference title card owns refresh and explore settings [header migration]", () => {
  const start = featurePages.indexOf("export function NumberReferencePage");
  const end = featurePages.indexOf("export function CalculatorPage", start);
  const referencePage = featurePages.slice(start, end);
  assert.match(referencePage, /headerAction=\{<HeaderSettingsButton[^>]*controls="reference-header-settings"/s);
  assert.match(referencePage, /headerSettings=\{\{ id: "reference-header-settings"/);
  assert.match(referencePage, /刷新/);
  assert.match(referencePage, /探索設定/);
});

test("home and Matrix status retain the shared Matrixbba switcher artwork", () => {
  assert.match(featurePages, /className="lottery-switcher--home-style matrix-status-lottery-switcher" \/>/);
  assert.doesNotMatch(featurePages, /matrix-status-lottery-switcher" independentLogos/);
  const switcherBodies = ruleBodies(homepageStyles, /^\.lottery-switcher--home-style$/);
  assert.ok(switcherBodies.some((body) => /width:\s*calc\(100% - 32px\);/.test(body) && /margin-inline:\s*0;/.test(body)));
  assert.match(homepageStyles, /background-image:\s*url\("\/assets\/lottery\/status\/Matrixbba\.png"\);/);
  assert.doesNotMatch(homepageStyles, /lottery-card-logo|--lottery-logo-scale|lottery-switcher--independent-logos/);
  const homeFlowBodies = ruleBodies(homepageStyles, /^\.home-screen \.lottery-switcher$/);
  assert.ok(homeFlowBodies.some((body) => /margin-block-start:\s*var\(--home-gap-logo-switcher\);/.test(body)));
  assert.match(homepageStyles, /\.lottery-switcher--home-style > \.lottery-switcher-hit-grid > \.lottery-card\s*\{[^}]*border:\s*1px solid var\(--home-frame-muted\);[^}]*border-radius:\s*var\(--home-frame-radius\);/s);
  assert.match(homepageStyles, /\.lottery-card\[data-selected="true"\]\s*\{[^}]*background-color:\s*transparent;/s);
  assert.doesNotMatch(homepageStyles, /\.lottery-card\[data-selected="true"\]::before\s*\{/);
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
