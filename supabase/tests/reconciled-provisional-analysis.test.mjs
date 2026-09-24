import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const fix = new URL('../migrations/20260924033647_cleanup_reconciled_provisional_analysis.sql', import.meta.url);
const lottery = '六合彩';

test('reconciling an official period removes the duplicate provisional analysis and preserves older periods', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema private;');
    await db.exec(read('./fixtures/matrix-analysis-tables.sql'));
    await db.exec(`create table public.matrix_card_publications (
      lottery text primary key, desired_digest text, desired_period text,
      eligible_at timestamptz, lease_token text, lease_until timestamptz
    );`);
    // The real stage migration adds the column and the draw invalidation trigger.
    await db.exec('alter table public.lottery_draws drop column result_status');
    await db.exec(read('../migrations/20260912164917_two_stage_lottery_results.sql'));
    await db.exec(read('../migrations/20260915195954_reconcile_confirmed_same_period_draws.sql'));
    if (existsSync(fix)) await db.exec(readFileSync(fix, 'utf8'));

    for (const [period, date, status] of [
      ['026100', '2026-09-11', 'confirmed'],
      ['026101', '2026-09-13', 'confirmed'],
      ['026102', '2026-09-15', 'preliminary'],
    ]) {
      await db.query(`insert into public.lottery_draws
        (lottery, period, draw_date, numbers, sorted_numbers, result_status)
        values ($1,$2,$3,'["01","02","03","04","05","06","07"]',
          '["01","02","03","04","05","06","07"]',$4)`, [lottery, period, date, status]);
    }

    // The pointer uses the same composite FK and cascade as the deployed table.
    await db.exec(`create table private.matrix_analysis_active_versions (
      lottery text not null, draw_period text not null,
      number_order text not null, analysis_version text not null,
      primary key (lottery, draw_period, number_order),
      foreign key (lottery, draw_period, analysis_version)
        references public.matrix_analysis_runs (lottery, draw_period, analysis_version) on delete cascade
    );`);
    for (const period of ['026100', '026101', '026102']) {
      const version = `${period}:matrix-python-v15-sorted`;
      await db.query(`insert into public.matrix_analysis_runs
        (lottery, draw_period, analysis_version, phase, status, started_at, completed_at)
        values ($1,$2,$3,'complete','complete',now(),now())`, [lottery, period, version]);
      await db.query(`insert into public.matrix_analysis_artifacts
        (lottery, draw_period, analysis_version, kind, payload, completed_at, expires_at)
        values ($1,$2,$3,'explore','{}',now(),now()+interval '1 year')`, [lottery, period, version]);
      await db.query(`insert into private.matrix_analysis_active_versions
        (lottery, draw_period, number_order, analysis_version) values ($1,$2,'sorted',$3)`,
      [lottery, period, version]);
    }

    const official = {
      lottery, period: '026101', draw_date: '2026-09-15',
      numbers: ['08','09','10','11','12','13','14'],
      sorted_numbers: ['08','09','10','11','12','13','14'],
      draw_order_numbers: ['08','09','10','11','12','13','14'],
      result_status: 'confirmed', source_id: 'official',
    };
    await db.exec('set role service_role');
    await db.query('select public.matrix_upsert_draws($1::jsonb)', [JSON.stringify([official])]);
    await db.exec('reset role');

    assert.deepEqual((await db.query(`select period, draw_date::text as date, result_status as status
      from public.lottery_draws order by period`)).rows, [
      { period: '026100', date: '2026-09-11', status: 'confirmed' },
      { period: '026101', date: '2026-09-15', status: 'confirmed' },
    ]);
    for (const table of [
      'public.matrix_analysis_runs', 'public.matrix_analysis_artifacts',
      'private.matrix_analysis_active_versions',
    ]) {
      assert.deepEqual((await db.query(`select draw_period from ${table} order by draw_period`)).rows,
        [{ draw_period: '026100' }], `${table} should contain only the unchanged period`);
    }
  } finally {
    await db.close();
  }
});
