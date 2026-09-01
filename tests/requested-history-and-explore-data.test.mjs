import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const featureSource = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
const ballCss = readFileSync(new URL("../src/number-ball.css", import.meta.url), "utf8");
const exploreService = readFileSync(new URL("../backend/matrix-explore-service.ts", import.meta.url), "utf8");
const exploreDomainSource = readFileSync(new URL("../services/matrix-api/app/domain/explore_v2.py", import.meta.url), "utf8");
const exploreBatchSource = readFileSync(new URL("../services/matrix-api/app/services/explore_batches.py", import.meta.url), "utf8");
const artifactBuilderSource = readFileSync(new URL("../services/matrix-api/app/services/artifact_builders.py", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("../services/matrix-api/app/worker.py", import.meta.url), "utf8");
const exploreRpcMigration = readFileSync(new URL("../supabase/migrations/20260901100000_matrix_explore_v2_ranges.sql", import.meta.url), "utf8");

test("近10期只反轉顯示順序，最新期顯示在最下方", () => {
  assert.match(featureSource, /const displayedHistory = useMemo\(\(\) => \[\.\.\.history\]\.reverse\(\), \[history\]\);/);
  assert.match(featureSource, /\{displayedHistory\.map\(\(record, index\) => \{/);
});

test("歷史六合彩的數字使用共用正式球圖中心", () => {
  assert.match(ballCss, /\.number-ball-component\[data-lottery="六合彩"\] \.number-ball-value\s*\{[^}]*position:\s*absolute;[^}]*top:\s*50%;[^}]*left:\s*50%;[^}]*transform:\s*translate\(-50%, -50%\) translate\(var\(--number-optical-x\), var\(--number-optical-y\)\);/s);
  assert.doesNotMatch(ballCss, /:is\([^}]*draw-history-screen[^}]*\)\[data-lottery="六合彩"\][^}]*\.number-ball-component\.history-lottery-ball\[data-tone=/s);
});

test("探索只使用 Python v10 scoped final rows 與固定來源距離，舊 TypeScript 計算已淘汰", () => {
  assert.match(exploreService, /Compatibility types only/);
  assert.doesNotMatch(exploreService, /runMatrixAlgorithm|calculate|candidateMap/);
  assert.match(exploreDomainSource, /prediction_distance=draw_index \+ 1/);
  assert.match(exploreDomainSource, /ScopeClass\.FULL_ONLY/);
  assert.match(exploreBatchSource, /for source_index in range\(min\(13, max\(0, history_length\)\)\):/);
  assert.match(exploreBatchSource, /'exploreDateOffset': 0/);
  assert.match(exploreBatchSource, /'predictionDistance': source_index \+ 1/);
  assert.doesNotMatch(exploreBatchSource, /for algorithm_type in/);
  assert.doesNotMatch(exploreBatchSource, /minPredictionDistance|maxPredictionDistance/);
  assert.match(artifactBuilderSource, /run_explore_v2_batch/);
  assert.doesNotMatch(artifactBuilderSource, /explore_shared_v8/);
  assert.match(workerSource, /ANALYSIS_VERSION = "matrix-python-v10"/);
  assert.match(exploreRpcMigration, /add column if not exists explore_range text/);
  assert.match(exploreRpcMigration, /result\.explore_range = v_range/);
  assert.match(exploreRpcMigration, /matrix-python-v10/);
  assert.doesNotMatch(exploreRpcMigration, /coalesce\(result\.reference_offset, 0\) >= -7/);
});
