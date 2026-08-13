import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const featurePages = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");

test("BrandHeader renders the title and actions inside one shared card", () => {
  assert.match(featurePages, /className="feature-title-card"/);
  assert.match(featurePages, /className="feature-title-actions"/);
  assert.match(styles, /\.feature-title-card\s*\{/);
});

test("Matrix pages use the three uploaded PNG icons in one page switcher", () => {
  assert.match(featurePages, /function MatrixPageSwitcher/);
  for (const asset of ["Matrix探索.png", "Matrix天衍.png", "Matrix天工.png"]) {
    assert.match(featurePages, new RegExp(asset));
  }
  assert.match(featurePages, /title === "Matrix 天衍" \? "tianyan" : "explore"/);
  assert.match(featurePages, /current="tiangong"/);
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

test("history filter keeps issue date order range reset and submit controls", () => {
  for (const content of ["期數", "日期", "號碼順序", "1000期", "3000期", "5000期", "所有期數", "重設", "開始探索"]) {
    assert.match(featurePages, new RegExp(content));
  }
});
