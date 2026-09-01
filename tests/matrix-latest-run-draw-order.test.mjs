import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260902031000_matrix_latest_run_draw_order.sql",
    import.meta.url,
  ),
  "utf8",
);

const latestDrawOrderPattern = /left join public\.lottery_draws as draw[\s\S]*?order by\s+\(draw\.draw_date is not null\) desc,\s+draw\.draw_date desc nulls last,\s+run\.draw_period desc,\s+run\.completed_at desc nulls last/g;

test("狀態、狀態來源、天衍、天工依開獎日期選最新期", () => {
  for (const functionName of [
    "matrix_status_get",
    "matrix_status_sources_get",
    "matrix_tianyan_list",
    "matrix_tiangong_list",
  ]) {
    assert.match(
      migration,
      new RegExp(`create or replace function public\\.${functionName}\\(p_request jsonb\\)`),
    );
  }

  const orderingBlocks = migration.match(latestDrawOrderPattern) ?? [];
  assert.equal(orderingBlocks.length, 4);
  assert.doesNotMatch(
    migration,
    /from public\.matrix_analysis_runs as run\s+where[\s\S]*?order by run\.completed_at desc nulls last/,
  );
});
