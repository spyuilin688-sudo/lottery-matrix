import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260902020000_matrix_explore_v11_draw_order.sql",
    import.meta.url,
  ),
  "utf8",
);

test("Explore 本日／昨日／前日依開獎日期排序，不依補算完成時間排序", () => {
  assert.match(
    migration,
    /join public\.lottery_draws as draw[\s\S]*draw\.lottery = run\.lottery[\s\S]*draw\.period = run\.draw_period/,
  );
  assert.match(
    migration,
    /order by\s+draw\.draw_date desc nulls last,\s+run\.draw_period desc,\s+run\.completed_at desc nulls last/,
  );
  assert.doesNotMatch(
    migration,
    /order by\s+run\.completed_at desc nulls last\s+offset v_offset/,
  );
});
