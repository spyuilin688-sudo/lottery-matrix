import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260902050000_matrix_explore_v12_cleanup.sql", import.meta.url),
  "utf8",
);

test("v12 cleanup deletes only legacy Explore data", () => {
  assert.match(
    migration,
    /delete from public\.matrix_explore_results\s+where analysis_version !~ ':matrix-python-v12\$'/s,
  );
  assert.match(
    migration,
    /delete from public\.matrix_analysis_artifact_chunks\s+where kind = 'explore'\s+and analysis_version !~ ':matrix-python-v12\$'/s,
  );
  assert.match(
    migration,
    /delete from public\.matrix_analysis_artifacts\s+where kind = 'explore'\s+and analysis_version !~ ':matrix-python-v12\$'/s,
  );
});

test("v12 cleanup preserves shared runs, lottery history, and non-Explore artifacts", () => {
  assert.doesNotMatch(migration, /delete from public\.matrix_analysis_runs/i);
  assert.doesNotMatch(migration, /delete from public\.lottery_draws/i);
  assert.doesNotMatch(migration, /kind\s*(?:<>|!=|not in)/i);
  assert.doesNotMatch(migration, /truncate/i);
});
