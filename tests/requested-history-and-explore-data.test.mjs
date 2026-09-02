import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const featureSource = readFileSync(new URL("../src/FeaturePages.tsx", import.meta.url), "utf8");
const ballCss = readFileSync(new URL("../src/number-ball.css", import.meta.url), "utf8");
const exploreService = readFileSync(new URL("../backend/matrix-explore-service.ts", import.meta.url), "utf8");
const exploreContextSource = readFileSync(new URL("../services/matrix-api/app/domain/explore_context.py", import.meta.url), "utf8");
const exploreEngineSource = readFileSync(new URL("../services/matrix-api/app/domain/explore_engine.py", import.meta.url), "utf8");
const exploreBatchSource = readFileSync(new URL("../services/matrix-api/app/services/explore_batches.py", import.meta.url), "utf8");
const artifactBuilderSource = readFileSync(new URL("../services/matrix-api/app/services/artifact_builders.py", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("../services/matrix-api/app/worker.py", import.meta.url), "utf8");
const exploreRangeMigration = readFileSync(new URL("../supabase/migrations/20260901100000_matrix_explore_v2_ranges.sql", import.meta.url), "utf8");
const exploreV12RpcMigration = readFileSync(new URL("../supabase/migrations/20260902040000_matrix_explore_v12_rpc.sql", import.meta.url), "utf8");

test("近10期只反轉顯示順序，最新期顯示在最下方", () => {
  assert.match(featureSource, /const displayedHistory = useMemo\(\(\) => \[\.\.\.history\]\.reverse\(\), \[history\]\);/);
  assert.match(featureSource, /\{displayedHistory\.map\(\(record, index\) => \{/);
});

test("歷史六合彩的數字使用共用正式球圖中心", () => {
  assert.match(ballCss, /\.number-ball-component\[data-lottery="六合彩"\] \.number-ball-value\s*\{[^}]*position:\s*absolute;[^}]*top:\s*50%;[^}]*left:\s*50%;[^}]*transform:\s*translate\(-50%, -50%\) translate\(var\(--number-optical-x\), var\(--number-optical-y\)\);/s);
  assert.doesNotMatch(ballCss, /:is\([^}]*draw-history-screen[^}]*\)\[data-lottery="六合彩"\][^}]*\.number-ball-component\.history-lottery-ball\[data-tone=/s);
});

test("探索只使用 Canonical Python v12 scoped final rows 與固定來源距離，舊演算法已淘汰", () => {
  assert.match(exploreService, /Compatibility types only/);
  assert.doesNotMatch(exploreService, /runMatrixAlgorithm|calculate|candidateMap/);
  assert.match(exploreContextSource, /prediction_distance=draw_index \+ 1/);
  assert.match(exploreContextSource, /ScopeClass\.FULL_ONLY/);
  assert.match(exploreEngineSource, /def run_explore_batch\(/);
  assert.match(exploreBatchSource, /for source_index in range\(min\(13, max\(0, history_length\)\)\):/);
  assert.match(exploreBatchSource, /'exploreDateOffset': 0/);
  assert.match(exploreBatchSource, /'predictionDistance': source_index \+ 1/);
  assert.doesNotMatch(exploreBatchSource, /for algorithm_type in/);
  assert.doesNotMatch(exploreBatchSource, /minPredictionDistance|maxPredictionDistance/);
  assert.match(artifactBuilderSource, /run_explore_batch/);
  assert.doesNotMatch(artifactBuilderSource, /run_explore_v2_batch/);
  assert.doesNotMatch(artifactBuilderSource, /explore_shared_v8/);
  assert.match(workerSource, /ANALYSIS_VERSION = "matrix-python-v12"/);
  assert.match(exploreRangeMigration, /add column if not exists explore_range text/);
  assert.match(exploreRangeMigration, /result\.explore_range = v_range/);
  assert.doesNotMatch(exploreRangeMigration, /coalesce\(result\.reference_offset, 0\) >= -7/);
  assert.match(exploreV12RpcMigration, /create or replace function public\.matrix_explore_list\(p_request jsonb\)/);
  assert.match(exploreV12RpcMigration, /create or replace function public\.matrix_explore_validation\(p_request jsonb\)/);
  assert.match(exploreV12RpcMigration, /run\.analysis_version = run\.draw_period \|\| ':matrix-python-v12'/);
  assert.match(exploreV12RpcMigration, /v_version <> v_draw \|\| ':matrix-python-v12'/);
  assert.match(exploreV12RpcMigration, /left join public\.lottery_draws as draw/);
  assert.match(
    exploreV12RpcMigration,
    /order by\s+\(draw\.draw_date is not null\) desc,\s+draw\.draw_date desc nulls last,\s+run\.draw_period desc,\s+run\.completed_at desc nulls last/s,
  );
  assert.doesNotMatch(
    exploreV12RpcMigration,
    /order by run\.completed_at desc nulls last\s+offset v_offset/,
  );
  assert.doesNotMatch(exploreV12RpcMigration, /matrix-python-v1[01]/);
});
