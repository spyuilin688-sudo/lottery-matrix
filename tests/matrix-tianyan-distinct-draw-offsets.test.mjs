import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260902032000_matrix_tianyan_distinct_draw_offsets.sql",
    import.meta.url,
  ),
  "utf8",
);

test("天衍日期偏移先按開獎期去重，再選本日／昨日／前日", () => {
  assert.match(
    migration,
    /create or replace function public\.matrix_tianyan_list\(p_request jsonb\)/,
  );
  assert.match(migration, /select distinct on \(run\.draw_period\)/);
  assert.match(
    migration,
    /order by\s+run\.draw_period,\s+run\.completed_at desc nulls last/s,
  );
  assert.match(
    migration,
    /from latest_versions\s+order by\s+\(draw_date is not null\) desc,\s+draw_date desc nulls last,\s+draw_period desc,\s+completed_at desc nulls last\s+offset v_offset/s,
  );
  assert.equal((migration.match(/offset v_offset/g) ?? []).length, 1);
});
