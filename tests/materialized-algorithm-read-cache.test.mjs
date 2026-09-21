import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(
  new URL('../supabase/migrations/20260921074500_materialized_algorithm_read_cache.sql', import.meta.url),
  'utf8',
);

async function database() {
  const db = new PGlite();
  await db.exec(`
    create schema private;
    do $$ begin create role anon; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role; exception when duplicate_object then null; end $$;
    create table public.matrix_analysis_artifacts (
      id uuid primary key,
      lottery text not null,
      draw_period text not null,
      analysis_version text not null,
      kind text not null,
      payload jsonb not null,
      completed_at timestamptz not null default now(),
      expires_at timestamptz not null default now() + interval '3 days',
      unique(lottery,draw_period,analysis_version,kind)
    );
    create function private.matrix_result_entitlements() returns jsonb
      language sql stable as $$ select '{"canUseTianyan":true,"canUseTiangong":true}'::jsonb $$;
    create function private.matrix_analysis_read_period(text,text,integer) returns text
      language sql stable as $$ select coalesce($2, '42') $$;
    create function private.matrix_analysis_order_version(text,text,text,text) returns text
      language sql stable as $$ select 'v1'::text $$;
  `);
  await db.exec(migration);
  return db;
}

const tianyanItem = (id, highestStreak, predictionNumbers, lockedPosition = 1) => ({
  id,
  number: predictionNumbers[0],
  ruleIds: [`${id}-r1`, `${id}-r2`],
  roadType: '複合',
  consecutive: '準5進6',
  numberOrder: '依號碼由小到大排序',
  hitCondition: '準5+（鎖定2碼）',
  highestStreak,
  explorePeriods: 13,
  lockedPosition,
  exploreDateOffset: 0,
  lockedSourceIndex: 0,
  predictionNumbers,
  lockedSourcePeriod: '42',
  predictionDistance: 1,
});

const tianyanValidation = (id, first = '加減', second = '合值') => ({
  itemId: id,
  rules: [
    { id: `${id}-r1`, algorithmType: first, referenceOffset: -5, validationPeriodOffset: -5 },
    { id: `${id}-r2`, algorithmType: second, referenceOffset: -2, validationPeriodOffset: -2 },
  ],
});

const tiangongItem = (id, exploreDirection) => ({
  id,
  interval: 1,
  roadType: '加減合值',
  firstRoadType: '加減',
  secondRoadType: '合值',
  exploreDirection,
  predictionNumber: '01',
  predictedPosition: 1,
  eligiblePeriodRange: 50,
  firstStageDirection: '固定',
  secondStageDirection: '固定',
});

test('Tianyan and Tiangong list reads are materialized from artifact writes', async () => {
  const db = await database();
  const a = tianyanItem('a', 5, ['10', '11'], 1);
  const b = tianyanItem('b', 6, ['10', '11'], 2);
  const c = tianyanItem('c', 4, ['22'], 3);
  const tianyan = {
    lottery: '今彩539',
    drawPeriod: '42',
    items: [a, b, c],
    validationById: {
      a: tianyanValidation('a'),
      b: tianyanValidation('b', '加減', '加減'),
      c: tianyanValidation('c', '拖牌', '拖牌'),
    },
  };
  const tiangong = {
    lottery: '今彩539',
    drawPeriod: '42',
    numberOrder: '依號碼由小到大排序',
    items: [tiangongItem('g1', '固定'), tiangongItem('g2', '依序遞增')],
    validationById: {},
  };
  await db.query(
    `insert into public.matrix_analysis_artifacts
      (id,lottery,draw_period,analysis_version,kind,payload)
     values ($1,'今彩539','42','v1','tianyan',$2),
            ($3,'今彩539','42','v1','tiangong',$4)`,
    ['00000000-0000-0000-0000-000000000001', JSON.stringify(tianyan),
     '00000000-0000-0000-0000-000000000002', JSON.stringify(tiangong)],
  );

  const tianyanResult = (await db.query(
    `select private.matrix_tianyan_list_impl($1::jsonb) result`,
    [JSON.stringify({
      lottery: '今彩539',
      explorePeriods: 13,
      exploreRange: '標準範圍',
      numberOrder: '依號碼由小到大排序',
      exploreDateOffset: 0,
      selectedStreaks: ['準5進6'],
      sameCode: true,
    })],
  )).rows[0].result;

  assert.deepEqual(tianyanResult.items.map(item => item.id), ['b', 'a']);
  assert.equal(tianyanResult.items[0].roadTypeLabel, '加減版路');
  assert.equal(tianyanResult.items[1].roadTypeLabel, '加減合值');
  assert.deepEqual(tianyanResult.duplicateStats, [
    { number: '10', count: 2 },
    { number: '11', count: 2 },
  ]);
  assert.equal(tianyanResult.total, 2);

  const tiangongResult = (await db.query(
    `select private.matrix_tiangong_list_impl($1::jsonb) result`,
    [JSON.stringify({
      lottery: '今彩539',
      periodRange: 50,
      mode: 'two-stage',
      hitCondition: '準2進3',
      exploreDirections: ['固定'],
      firstStageDirections: ['固定'],
      firstRoadTypes: ['加減'],
      secondStageDirections: ['固定'],
      secondRoadTypes: ['合值'],
    })],
  )).rows[0].result;

  assert.deepEqual(tiangongResult.items.map(item => item.id), ['g1']);
  assert.equal(tiangongResult.total, 1);
  await db.close();
});

test('artifact updates refresh rows and preserve a completed empty result', async () => {
  const db = await database();
  const artifactId = '00000000-0000-0000-0000-000000000003';
  const payload = {
    lottery: '今彩539',
    drawPeriod: '42',
    numberOrder: '依號碼由小到大排序',
    items: [tiangongItem('g1', '固定')],
    validationById: {},
  };
  await db.query(
    `insert into public.matrix_analysis_artifacts
      (id,lottery,draw_period,analysis_version,kind,payload)
     values ($1,'今彩539','42','v1','tiangong',$2)`,
    [artifactId, JSON.stringify(payload)],
  );
  assert.equal((await db.query(
    'select count(*)::int count from private.matrix_tiangong_read_rows where artifact_id=$1',
    [artifactId],
  )).rows[0].count, 1);

  await db.query(
    `update public.matrix_analysis_artifacts
       set payload=$2 where id=$1`,
    [artifactId, JSON.stringify({ ...payload, items: [] })],
  );
  assert.equal((await db.query(
    'select count(*)::int count from private.matrix_tiangong_read_rows where artifact_id=$1',
    [artifactId],
  )).rows[0].count, 0);
  assert.equal((await db.query(
    'select item_count from private.matrix_artifact_read_state where artifact_id=$1',
    [artifactId],
  )).rows[0].item_count, 0);

  const result = (await db.query(
    `select private.matrix_tiangong_list_impl($1::jsonb) result`,
    [JSON.stringify({
      lottery: '今彩539',
      periodRange: 50,
      mode: 'two-stage',
      hitCondition: '準2進3',
      exploreDirections: ['固定'],
      firstStageDirections: ['固定'],
      firstRoadTypes: ['加減'],
      secondStageDirections: ['固定'],
      secondRoadTypes: ['合值'],
    })],
  )).rows[0].result;
  assert.deepEqual(result.items, []);
  assert.equal(result.total, 0);
  await db.close();
});
