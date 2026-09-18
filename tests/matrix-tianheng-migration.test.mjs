import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = '../supabase/migrations/20260910233000_matrix_tianheng.sql';
const sql = readFileSync(new URL(migration, import.meta.url), 'utf8');
const readMigration = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const functionDefinition = (source, name) => {
  const escaped = name.replaceAll('.', '\\.');
  const match = source.match(new RegExp(`create(?: or replace)? function ${escaped}\\([^]*?\\$\\$;`, 'i'));
  assert.ok(match, `Missing function ${name}`);
  return match[0];
};

test('creates isolated Tianheng storage with both locks and worker-compatible constraints', () => {
  assert.match(sql, /create table public\.matrix_tianheng_results/i);
  for (const column of ['first_number text', 'second_number text', 'first_locked_position integer', 'second_locked_position integer', 'prediction_distance integer', 'highest_streak integer', 'prediction_numbers jsonb', 'item jsonb', 'validation jsonb', 'expires_at timestamptz']) {
    assert.ok(sql.includes(`${column} not null`), `Missing required ${column}`);
  }
  assert.match(sql, /check \(first_locked_position > 0\)/i);
  assert.match(sql, /check \(second_locked_position > first_locked_position\)/i);
  assert.match(sql, /check \(locked_source_index between 0 and 12\)/i);
  assert.match(sql, /primary key \(lottery, draw_period, analysis_version, item_id\)/i);
  assert.match(sql, /foreign key \(lottery, draw_period, analysis_version\)\s+references public\.matrix_analysis_runs\s*\(lottery, draw_period, analysis_version\)\s+on delete cascade/i);
  for (const [table, column, values] of [
    ['matrix_analysis_runs', 'phase', "'explore', 'tianheng', 'tianyan', 'tiangong', 'status', 'complete'"],
    ['matrix_analysis_artifacts', 'kind', "'explore', 'tianheng', 'tianyan', 'tiangong', 'status'"],
    ['matrix_analysis_artifact_chunks', 'kind', "'explore', 'tianheng', 'tianyan', 'tiangong', 'status'"],
  ]) {
    assert.ok(sql.includes(`drop constraint ${table}_${column}_check`));
    assert.ok(sql.includes(`add constraint ${table}_${column}_check`));
    assert.ok(sql.includes(`check (${column} in (${values}))`));
  }
});

test('keeps raw rows service-role-only and indexes list, prediction, expiry and run lookups', () => {
  assert.match(sql, /alter table public\.matrix_tianheng_results enable row level security/i);
  assert.match(sql, /revoke all on table public\.matrix_tianheng_results from public, anon, authenticated/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.matrix_tianheng_results to service_role/i);
  assert.doesNotMatch(sql, /grant [^;]+ on table public\.matrix_tianheng_results to (?:anon|authenticated|public)/i);
  assert.doesNotMatch(sql, /create policy/i);
  assert.match(sql, /on public\.matrix_tianheng_results \(\s*lottery, draw_period, analysis_version, explore_range, number_order,\s*rule_count, algorithm_type, consecutive, locked_source_index,\s*highest_streak desc, prediction_distance, first_locked_position, second_locked_position\s*\)/i);
  assert.match(sql, /on public\.matrix_tianheng_results using gin \(prediction_numbers\)/i);
  assert.match(sql, /on public\.matrix_tianheng_results \(expires_at\)/i);
});

test('Tianheng list validates access and selects completed v13 draw-date offsets with all filters', () => {
  const list = functionDefinition(sql, 'private.matrix_tianheng_list_impl');
  assert.match(list, /stable\s+security definer\s+set search_path = ''/i);
  assert.match(list, /v_lottery is null or v_lottery not in/i);
  assert.match(list, /v_order is null or v_order not in/i);
  assert.match(list, /v_range is null or v_range not in/i);
  assert.match(list, /v_periods is null or v_periods not in \(3, 13\)/i);
  assert.match(list, /v_offset is null or v_offset not in \(0, 1, 2\)/i);
  assert.match(list, /v_rule is null or v_rule not in \(1, 2\)/i);
  assert.match(list, /jsonb_typeof\(v_roads\) is distinct from 'array'/i);
  assert.match(list, /jsonb_typeof\(v_streaks\) is distinct from 'array'/i);
  assert.match(list, /private\.matrix_result_entitlements\(\)/);
  assert.match(list, /v_periods = 13[^;]+canUseThirteen/);
  assert.match(list, /v_range = '完整範圍'[^;]+canUseFullRange/);
  assert.doesNotMatch(list, /canUseSeven/);
  assert.match(list, /run\.status = 'complete'/);
  assert.match(list, /run\.analysis_version = run\.draw_period \|\| ':matrix-python-v13'/);
  assert.match(list, /draw\.draw_date desc nulls last,[^]*?offset v_offset\s+limit 1/);
  for (const filter of ["result.explore_range = '標準範圍'", "or v_range = '完整範圍'", 'result.number_order = v_order', 'result.locked_source_index < v_periods', 'result.rule_count = v_rule', 'v_roads ? result.algorithm_type', 'v_streaks ? result.consecutive', 'where not v_same', 'same_allowed.prediction_numbers ? v_prediction_number']) {
    assert.ok(list.includes(filter), `Missing list filter ${filter}`);
  }
  assert.match(list, /having pg_catalog\.count\(\*\) > 1/);
  assert.match(list, /case when v_same or v_prediction_number is not null then filtered\.prediction_numbers::text/);
  assert.match(list, /filtered\.highest_streak desc,\s*filtered\.prediction_distance,\s*filtered\.first_locked_position,\s*filtered\.second_locked_position,\s*filtered\.item_id/);
  assert.match(list, /limit 18/);
  assert.match(list, /'kind', 'tianheng',\s*'lottery', v_lottery,\s*'drawPeriod', v_draw,\s*'analysisVersion', v_version,\s*'status', 'complete',\s*'items', v_items,\s*'duplicateStats', v_stats,\s*'total', v_total/);
  assert.match(list, /invalid_text_representation or numeric_value_out_of_range/);
});

test('Tianheng validation cannot cross lottery, draw, version, item, period or range access', () => {
  const validation = functionDefinition(sql, 'private.matrix_tianheng_validation_impl');
  assert.match(validation, /v_lottery is null or v_lottery not in/);
  assert.match(validation, /v_draw is null or v_version is null or v_item_id is null/);
  assert.match(validation, /v_periods is null or v_periods not in \(3, 13\)/);
  assert.match(validation, /v_range is null or v_range not in/);
  assert.match(validation, /v_version <> v_draw \|\| ':matrix-python-v13'/);
  assert.match(validation, /run\.status = 'complete'/);
  assert.match(validation, /private\.matrix_result_entitlements\(\)/);
  assert.match(validation, /v_periods = 13[^;]+canUseThirteen/);
  assert.match(validation, /v_range = '完整範圍'[^;]+canUseFullRange/);
  for (const filter of ['result.lottery = v_lottery', 'result.draw_period = v_draw', 'result.analysis_version = v_version', 'result.item_id = v_item_id', 'result.locked_source_index < v_periods', "result.explore_range = '標準範圍'", "or v_range = '完整範圍'"]) {
    assert.ok(validation.includes(filter), `Missing validation filter ${filter}`);
  }
  assert.match(validation, /'kind', 'tianheng'/);
  assert.match(validation, /'itemId', v_item_id,\s*'validation', v_validation/);
  assert.match(validation, /if v_validation is null then/);
});

test('public Tianheng wrappers use the unchanged request guard with only two new dispatch cases', () => {
  const original = functionDefinition(readMigration('20260910111850_security_monitoring.sql'), 'private.matrix_request_guard');
  const guard = functionDefinition(sql, 'private.matrix_request_guard');
  const additions = /    when 'tianheng_(?:list|validation)' then v_result:=private\.matrix_tianheng_(?:list|validation)_impl\(p_request\);\n/g;
  assert.equal(guard.match(additions)?.length, 2);
  assert.equal(guard.replace('create or replace function', 'create function').replace(additions, ''), original);
  for (const operation of ['list', 'validation']) {
    const wrapper = functionDefinition(sql, `public.matrix_tianheng_${operation}`);
    assert.match(wrapper, /language sql volatile security definer set search_path=''/);
    assert.ok(wrapper.includes(`select private.matrix_request_guard('tianheng_${operation}', p_request)`));
    assert.ok(sql.includes(`revoke all on function public.matrix_tianheng_${operation}(jsonb) from public, anon, authenticated, service_role;`));
    assert.ok(sql.includes(`grant execute on function public.matrix_tianheng_${operation}(jsonb) to anon, authenticated, service_role;`));
    assert.ok(sql.includes(`revoke all on function private.matrix_tianheng_${operation}_impl(jsonb) from public, anon, authenticated, service_role;`));
  }
  assert.match(sql, /revoke all on function private\.matrix_request_guard\(text,jsonb\) from public,anon,authenticated,service_role/);
});

test('active Explore implementations preserve current behavior except the v13 suffix', () => {
  for (const [operation, source] of [
    ['list', '20260904040000_matrix_explore_prediction_number_group_order.sql'],
    ['validation', '20260902040000_matrix_explore_v12_rpc.sql'],
  ]) {
    const active = functionDefinition(sql, `private.matrix_explore_${operation}_impl`);
    const prior = functionDefinition(readMigration(source), `public.matrix_explore_${operation}`);
    assert.equal(active, prior.replace(`public.matrix_explore_${operation}`, `private.matrix_explore_${operation}_impl`).replaceAll('matrix-python-v12', 'matrix-python-v13'));
    assert.match(active, /matrix-python-v13/);
    assert.doesNotMatch(active, /matrix-python-v12/);
  }
  for (const match of sql.matchAll(/create(?: or replace)? function private\.matrix_(?:explore|tianheng)_(?:list|validation)_impl\([^]*?\$\$;/g)) {
    assert.doesNotMatch(match[0], /matrix-python-v12/);
  }
  assert.doesNotMatch(sql, /create(?: or replace)? function public\.matrix_explore_(?:list|validation)/);
});

test('cleanup adds Tianheng expiry deletion without changing protected run retention or existing ACLs', () => {
  const cleanup = functionDefinition(sql, 'public.matrix_analysis_cleanup_expired');
  const prior = functionDefinition(readMigration('20260905141003_repair_matrix_analysis_retention_and_recovery.sql'), 'public.matrix_analysis_cleanup_expired');
  const addition = /, removed_tianheng_results as \(\n    delete from public\.matrix_tianheng_results as result\n    where result\.expires_at < p_now and not exists \(\n      select 1 from retained\n      where retained\.lottery = result\.lottery\n        and retained\.draw_period = result\.draw_period\n        and retained\.analysis_version = result\.analysis_version\n    \)\n    returning 1\n  \)/;
  assert.match(cleanup, addition);
  assert.equal(cleanup.replace(addition, '').replace('\n    + (select count(*) from removed_tianheng_results)', ''), prior);
  assert.match(sql, /revoke all on function public\.matrix_analysis_cleanup_expired\(timestamptz\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.matrix_analysis_cleanup_expired\(timestamptz\) to service_role/);
});

test('keeps Tianheng out of status sources and migration changes atomic', () => {
  assert.doesNotMatch(sql, /matrix_status.*tianheng/is);
  assert.match(sql, /\bbegin;/);
  assert.match(sql, /commit;\s*$/);
});
