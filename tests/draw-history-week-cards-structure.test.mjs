import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const prototypeSource = readFileSync(new URL("../src/Prototype.tsx", import.meta.url), "utf8");
const patchedRouterSource = readFileSync(new URL("../src/FeaturePagesPatched.tsx", import.meta.url), "utf8");
const historySource = readFileSync(new URL("../src/FeaturePagesCore.tsx", import.meta.url), "utf8");
const featurePagesCss = readFileSync(new URL("../src/feature-pages.css", import.meta.url), "utf8");
const responsiveCss = readFileSync(new URL("../src/responsive-feature-pages.css", import.meta.url), "utf8");

test("歷史開獎 live route 由 Prototype 經 patched router 指向 core implementation", () => {
  assert.match(
    prototypeSource,
    /import \{ FeaturePageRouter, QuickNavigationProvider, type ScreenId \} from "\.\/FeaturePagesPatched";/,
  );
  assert.match(
    prototypeSource,
    /if \(screen !== "home"\) \{[\s\S]*?<FeaturePageRouter screen=\{screen\}[^>]*historyReturnScreen=\{historyReturnScreen\}/,
  );
  assert.match(
    patchedRouterSource,
    /FeaturePageRouter as CoreFeaturePageRouter,[\s\S]*?from "\.\/FeaturePagesCore";/,
  );
  assert.match(
    patchedRouterSource,
    /<CoreFeaturePageRouter[\s\S]*?screen=\{screen\}[\s\S]*?historyReturnScreen=\{historyReturnScreen\}/,
  );
  assert.match(historySource, /function PatchedDrawHistoryPage\(/);

  const historyRouteIndex = historySource.indexOf('if (screen === "history") return <PatchedDrawHistoryPage');
  const legacyFallbackIndex = historySource.indexOf("return <OriginalFeaturePageRouter");
  assert.notEqual(historyRouteIndex, -1);
  assert.notEqual(legacyFallbackIndex, -1);
  assert.ok(historyRouteIndex < legacyFallbackIndex, "history must resolve before the legacy router fallback");
});

test("歷史開獎分頁資料先依曆週分組再渲染資訊卡", () => {
  assert.match(historySource, /groupHistoryByCalendarWeek\(paginatedHistory\.items\)/);
  assert.match(historySource, /historyWeekGroups\.map\(\(weekRecords\)/);
  assert.match(historySource, /className="panel history-panel draw-history-panel"/);
});

test("歷史開獎由 sticky 頁首與全寬內容 owner 維持單一頁面流", () => {
  assert.match(historySource, /className="draw-history-screen sticky-title-card-screen"/);
  assert.match(historySource, /className="draw-history-week-list"/);
  assert.match(featurePagesCss, /\.draw-history-week-list\s*\{[^}]*display:\s*grid;[^}]*gap:\s*8px;/s);
  assert.match(
    responsiveCss,
    /\.sticky-title-card-screen \.feature-brand-header,\s*\.number-reference-screen \.feature-brand-header\s*\{[^}]*position:\s*sticky;[^}]*z-index:\s*30;[^}]*top:\s*0;/s,
  );
  assert.match(
    responsiveCss,
    /\.draw-history-history-scope,\s*\.tongxing-screen \.tongxing-results,\s*\.number-reference-screen \.reference-table-panel\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*100%;[^}]*min-width:\s*0;[^}]*margin-inline:\s*0;/s,
  );
});
