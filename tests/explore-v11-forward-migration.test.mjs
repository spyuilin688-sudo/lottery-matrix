import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260902030000_matrix_explore_v11_draw_order_forward.sql",
    import.meta.url,
  ),
  "utf8",
);

test("Explore v11 draw ordering is reapplied by a forward migration", () => {
  assert.match(
    migration,
    /create or replace function public\.matrix_explore_list\(p_request jsonb\)/,
  );
  assert.match(migration, /left join public\.lottery_draws as draw/);
  assert.match(
    migration,
    /order by\s+\(draw\.draw_date is not null\) desc,\s+draw\.draw_date desc nulls last,\s+run\.draw_period desc,\s+run\.completed_at desc nulls last/s,
  );
  assert.match(
    migration,
    /run\.analysis_version = run\.draw_period \|\| ':matrix-python-v11'/,
  );
  assert.doesNotMatch(
    migration,
    /order by\s+run\.completed_at desc nulls last\s+offset v_offset/s,
  );
});
