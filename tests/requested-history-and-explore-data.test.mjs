import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const featureSource = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
const ballCss = readFileSync(new URL("../src/number-ball.css", import.meta.url), "utf8");
const exploreService = readFileSync(new URL("../backend/matrix-explore-service.ts", import.meta.url), "utf8");
const algorithmSource = readFileSync(new URL("../backend/matrix-algorithm.ts", import.meta.url), "utf8");
const partitionSource = readFileSync(new URL("../backend/matrix-explore-partitions.ts", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../backend/matrix-explore-routes.ts", import.meta.url), "utf8");
const versionSource = readFileSync(new URL("../backend/matrix-analysis-version.ts", import.meta.url), "utf8");

test("近10期只反轉顯示順序，最新期顯示在最下方", () => {
  assert.match(featureSource, /const displayedHistory = useMemo\(\(\) => \[\.\.\.history\]\.reverse\(\), \[history\]\);/);
  assert.match(featureSource, /\{displayedHistory\.map\(\(record, index\) => \{/);
});

test("歷史六合彩的數字與底線共同錨定在正式球圖白色中心", () => {
  assert.match(ballCss, /\.draw-history-screen \.draw-history-panel\[data-lottery="六合彩"\][\s\S]*?\.number-ball-value\s*\{[^}]*position:\s*absolute;[^}]*top:\s*calc\(50% \+ var\(--number-ball-asset-y\)\);[^}]*left:\s*calc\(50% \+ var\(--number-ball-asset-x\)\);[^}]*transform:\s*translate\(-50%, -50%\);/s);
  assert.doesNotMatch(ballCss, /:is\([^}]*draw-history-screen[^}]*\)\[data-lottery="六合彩"\][^}]*\.number-ball-component\.history-lottery-ball\[data-tone=/s);
});

test("探索預計算保留今日昨日與前日的完整十三期來源並寫入精確維度", () => {
  assert.match(exploreService, /Math\.min\(15, history\.length\)/);
  assert.match(exploreService, /function exploreSelectionsForSourceIndex\(lockedSourceIndex: number\)/);
  assert.match(exploreService, /for \(const exploreDateOffset of \[0, 1, 2\] as const\)/);
  assert.match(exploreService, /for \(const explorePeriods of \[2, 7, 13\] as const\)/);
  assert.match(exploreService, /explorePeriods:\s*selection\.explorePeriods/);
  assert.match(exploreService, /exploreDateOffset:\s*selection\.exploreDateOffset/);
  assert.match(exploreService, /item\.explorePeriods === request\.explorePeriods/);
  assert.match(exploreService, /item\.exploreDateOffset === request\.exploreDateOffset/);
  assert.match(algorithmSource, /input\.lockedSourceIndex >= Math\.min\(15, newestFirst\.length\)/);
  assert.match(partitionSource, /exploreDateOffset:\s*0 \| 1 \| 2;/);
  assert.match(partitionSource, /partition\.lockedSourceIndex >= request\.exploreDateOffset/);
  assert.match(partitionSource, /partition\.lockedSourceIndex < request\.exploreDateOffset \+ request\.explorePeriods/);
  assert.match(partitionSource, /matrix-explore-partitioned-v2/);
  assert.doesNotMatch(routeSource, /normalizedRequest/);
  assert.doesNotMatch(routeSource, /resolveDrawPeriod/);
  assert.match(routeSource, /filterPartitionedExplore\([\s\S]*artifact\.data,[\s\S]*request,/);
  assert.match(versionSource, /matrix-v5/);
});
