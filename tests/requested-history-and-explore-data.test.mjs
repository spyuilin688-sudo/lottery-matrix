import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const featureSource = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
const ballCss = readFileSync(new URL("../src/number-ball.css", import.meta.url), "utf8");
const exploreService = readFileSync(new URL("../backend/matrix-explore-service.ts", import.meta.url), "utf8");
const exploreDomainSource = readFileSync(new URL("../services/matrix-api/app/domain/explore.py", import.meta.url), "utf8");
const exploreBatchSource = readFileSync(new URL("../services/matrix-api/app/services/explore_batches.py", import.meta.url), "utf8");
const sharedExploreSource = readFileSync(new URL("../services/matrix-api/app/domain/explore_shared.py", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("../services/matrix-api/app/worker.py", import.meta.url), "utf8");
const exploreRpcMigration = readFileSync(new URL("../supabase/migrations/20260901000000_matrix_python_v8_explore_rpc.sql", import.meta.url), "utf8");

test("近10期只反轉顯示順序，最新期顯示在最下方", () => {
  assert.match(featureSource, /const displayedHistory = useMemo\(\(\) => \[\.\.\.history\]\.reverse\(\), \[history\]\);/);
  assert.match(featureSource, /\{displayedHistory\.map\(\(record, index\) => \{/);
});

test("歷史六合彩的數字使用共用正式球圖中心", () => {
  assert.match(ballCss, /\.number-ball-component\[data-lottery="六合彩"\] \.number-ball-value\s*\{[^}]*position:\s*absolute;[^}]*top:\s*50%;[^}]*left:\s*50%;[^}]*transform:\s*translate\(-50%, -50%\) translate\(var\(--number-optical-x\), var\(--number-optical-y\)\);/s);
  assert.doesNotMatch(ballCss, /:is\([^}]*draw-history-screen[^}]*\)\[data-lottery="六合彩"\][^}]*\.number-ball-component\.history-lottery-ball\[data-tone=/s);
});

test("探索只使用 current Python v8 結果與固定來源距離，舊 TypeScript 計算已淘汰", () => {
  assert.match(exploreService, /Compatibility types only/);
  assert.doesNotMatch(exploreService, /runMatrixAlgorithm|calculate|candidateMap/);
  assert.match(exploreDomainSource, /distance = relative_source_index \+ 1/);
  assert.match(exploreDomainSource, /_reference_coordinates\(/);
  assert.match(exploreBatchSource, /for source_index in range\(min\(13, max\(0, history_length\)\)\):/);
  assert.match(exploreBatchSource, /'exploreDateOffset': 0/);
  assert.match(exploreBatchSource, /'predictionDistance': source_index \+ 1/);
  assert.doesNotMatch(exploreBatchSource, /for algorithm_type in/);
  assert.doesNotMatch(exploreBatchSource, /minPredictionDistance|maxPredictionDistance/);
  assert.match(sharedExploreSource, /\["加減", "合值"\]/);
  assert.match(sharedExploreSource, /\["拖牌"\]/);
  assert.match(workerSource, /ANALYSIS_VERSION = "matrix-python-v8"/);
  assert.match(exploreRpcMigration, /p\.proname in \('matrix_explore_list', 'matrix_explore_validation'\)/);
  assert.match(exploreRpcMigration, /'matrix-python-v7',\s*'matrix-python-v8'/s);
  assert.match(exploreRpcMigration, /MATRIX_PYTHON_V7_RPC_REFERENCE_REMAINS/);
  assert.match(exploreRpcMigration, /MATRIX_PYTHON_V8_RPC_REFERENCE_MISSING/);
  assert.doesNotMatch(exploreRpcMigration, /matrix-python-v[56]/);
});
