import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
const overrideJs = readFileSync(new URL("../src/project-overrides.js", import.meta.url), "utf8");
const overrideCss = readFileSync(new URL("../src/project-overrides.css", import.meta.url), "utf8");

test("歷史開獎分頁資料先依曆週分組再渲染資訊卡", () => {
  assert.match(source, /groupHistoryByCalendarWeek\(paginatedHistory\.items\)/);
  assert.match(source, /historyWeekGroups\.map\(\(weekRecords\)/);
  assert.match(source, /className="panel draw-history-panel"/);
});

test("歷史開獎固定頁首並只允許中間內容捲動", () => {
  assert.match(overrideJs, /history-scroll-lock/);
  assert.match(overrideCss, /\.mobile-page\.history-scroll-lock \.mobile-scroll\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(overrideCss, /\.history-scroll-lock \.draw-history-screen \.feature-body\s*\{[^}]*overflow-y:\s*auto/s);
});
