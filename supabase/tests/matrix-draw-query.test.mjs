import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const sortedOrder = '依號碼由小到大排序';
const actualOrder = '依實際開獎順序排序';
const fixture = Array.from({ length: 1053 }, (_, index) => ({
  period: String(99000000 + index),
  draw_date: index < 3 ? null : new Date(Date.UTC(2023, 0, 1 + Math.floor(index / 2))).toISOString().slice(0, 10),
  numbers: [1, index % 2 ? 2 : 3, 10, 20, 39],
  sorted_numbers: index % 5 ? ['01', index % 2 ? '02' : '03', '10', '20', '39'] : [],
  draw_order_numbers: index % 7 ? ['39', '20', '10', index % 2 ? '02' : '03', '01'] : null,
  result_status: index % 11 ? 'confirmed' : 'preliminary',
}));
const expectedHistory = fixture.map(draw => ({ ...draw, period: draw.period.padStart(9, '0') })).sort((a, b) => {
  if (a.draw_date === null && b.draw_date !== null) return 1;
  if (b.draw_date === null && a.draw_date !== null) return -1;
  return (b.draw_date ?? '').localeCompare(a.draw_date ?? '') || b.period.localeCompare(a.period);
});
const query = async ({ kind = 'history', limit = 500, cursor = null, numbers = [], order = sortedOrder, offset = 1, lottery = '今彩539' } = {}) => {
  const { rows } = await db.query('select public.matrix_draw_query($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7) as result',
    [lottery, kind, limit, JSON.stringify(cursor), JSON.stringify(numbers), order, offset]);
  return rows[0].result;
};
const allPages = async (args = {}) => {
  const result = [];
  let cursor = null;
  do {
    const page = await query({ ...args, cursor });
    assert.ok(!page.error);
    const items = page.items ?? page.groups;
    assert.ok(items.length <= (args.limit ?? 500));
    result.push(...items);
    cursor = page.nextCursor;
  } while (cursor);
  return result;
};

before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.lottery_draws (
      lottery text not null, period text not null, draw_date date,
      numbers jsonb, sorted_numbers jsonb, draw_order_numbers jsonb,
      result_status text, updated_at timestamptz not null default '2026-09-14 00:00:00+00',
      primary key (lottery, period)
    );
    grant usage on schema public to service_role;
    grant select on public.lottery_draws to service_role;`);
  await db.query(`insert into public.lottery_draws
    select '今彩539', period, draw_date, numbers, sorted_numbers, draw_order_numbers, result_status, '2026-09-14 00:00:00+00'
    from jsonb_to_recordset($1::jsonb) as x(period text, draw_date date, numbers jsonb, sorted_numbers jsonb, draw_order_numbers jsonb, result_status text)`,
    [JSON.stringify([...fixture, ...fixture.filter((_, index) => index % 4 === 0)
      .map(draw => ({ ...draw, period: draw.period.padStart(9, '0') }))])]);
  await db.exec(await readFile(new URL('../migrations/20260914114420_matrix_draw_query_pagination.sql', import.meta.url), 'utf8'));
});
after(async () => db.close());

test('history pages preserve 1053 canonical rows without aliases across pages, date ties or NULL dates', async () => {
  assert.deepEqual(await allPages(), expectedHistory);
  assert.deepEqual(await allPages({ limit: 71 }), expectedHistory);
});

test('latest returns one row and summary returns distinct descending year strings', async () => {
  assert.deepEqual((await query({ kind: 'latest' })).items, expectedHistory.slice(0, 1));
  const summary = await query({ kind: 'summary' });
  assert.deepEqual(summary.years, ['2024', '2023']);
  assert.match(summary.revision, /^[a-f0-9]{32}$/);
  assert.deepEqual((await query({ kind: 'summary', lottery: '六合彩' })).years, []);
});

test('tongxing matches independent history baseline for both orders, one/two numbers and offsets 1..30', async () => {
  for (const order of [sortedOrder, actualOrder]) {
    for (const numbers of [['01'], ['01', '02']]) {
      for (let offset = 1; offset <= 30; offset++) {
        const expected = [];
        for (let index = offset; index < expectedHistory.length; index++) {
          const locked = expectedHistory[index];
          const raw = order === actualOrder
            ? locked.result_status === 'preliminary' ? [] : locked.draw_order_numbers ?? []
            : locked.sorted_numbers?.length ? locked.sorted_numbers : locked.numbers ?? [];
          const normalized = raw.map(value => String(value).padStart(2, '0'));
          if (numbers.every(value => normalized.includes(value))) {
            expected.push({ lockedEntry: locked, predictedEntry: expectedHistory[index - offset] });
          }
        }
        expected.reverse();
        assert.deepEqual(await allPages({ kind: 'tongxing', order, numbers, offset }), expected,
          `${order}, ${numbers}, futureOffset=${offset}`);
      }
    }
  }
  assert.deepEqual((await query({ kind: 'tongxing' })).groups, []);
});

test('rejects malformed limits, cursors, filters and future offsets', async () => {
  for (const args of [{ limit: 0 }, { limit: 501 }, { limit: null }, { lottery: 'invalid' },
    { kind: 'invalid' }, { order: 'invalid' }, { offset: 0 }, { offset: 31 },
    { numbers: ['50'] }, { numbers: ['1'] }, { numbers: [1] }, { numbers: {} },
    { cursor: {} }, { cursor: { offset: -1, revision: 'x' } },
    { cursor: { offset: 1.5, revision: 'x' } }, { cursor: { offset: 999999999999, revision: 'x' } }]) {
    await assert.rejects(query(args), error => error.code === '22023', JSON.stringify(args));
  }
});

test('only service_role can execute and function is read-only invoker with fixed search_path', async () => {
  const { rows: [permissions] } = await db.query(`select
    has_function_privilege('anon','public.matrix_draw_query(text,text,integer,jsonb,jsonb,text,integer)','EXECUTE') as anon,
    has_function_privilege('authenticated','public.matrix_draw_query(text,text,integer,jsonb,jsonb,text,integer)','EXECUTE') as authenticated,
    has_function_privilege('service_role','public.matrix_draw_query(text,text,integer,jsonb,jsonb,text,integer)','EXECUTE') as service,
    prosecdef, provolatile, proconfig from pg_proc where oid = 'public.matrix_draw_query(text,text,integer,jsonb,jsonb,text,integer)'::regprocedure`);
  assert.equal(permissions.anon, false);
  assert.equal(permissions.authenticated, false);
  assert.equal(permissions.service, true);
  assert.equal(permissions.prosecdef, false);
  assert.equal(permissions.provolatile, 's');
  assert.ok(permissions.proconfig.includes('search_path=""'));
  await db.exec('set role service_role');
  try { assert.equal((await query()).items.length, 500); }
  finally { await db.exec('reset role'); }
});

test('old draw correction invalidates cursor despite unchanged latest period and count', async () => {
  const before = await query({ limit: 3 });
  await db.query("update public.lottery_draws set updated_at = '2026-09-14 01:00:00+00' where period = '99000000'");
  const after = await query({ limit: 3, cursor: before.nextCursor });
  assert.equal(after.error, 'DRAW_HISTORY_CHANGED');
  assert.notEqual(after.revision, before.revision);
  assert.deepEqual((await query({ kind: 'latest' })).items, before.items.slice(0, 1));
  assert.deepEqual(await allPages(), expectedHistory);
});

test('out-of-order correction commits invalidate revision even below the existing maximum timestamp', async () => {
  await db.query("update public.lottery_draws set updated_at = '2026-09-14 01:00:00+00' where period = '99000000'");
  const before = await query({ limit: 3 });
  const { rows: [previous] } = await db.query('select count(*)::integer as count, max(updated_at)::text as latest from public.lottery_draws');
  // Simulate an older transaction committing after a newer-timestamped write.
  await db.query("update public.lottery_draws set updated_at = '2026-09-14 00:30:00+00' where period = '99000001'");
  const { rows: [current] } = await db.query('select count(*)::integer as count, max(updated_at)::text as latest from public.lottery_draws');
  assert.deepEqual(current, previous);
  const stale = await query({ cursor: before.nextCursor });
  assert.equal(stale.error, 'DRAW_HISTORY_CHANGED');
  assert.notEqual(stale.revision, before.revision);
});

test('insert and deletion change the revision and do not mix pages', async () => {
  const before = await query({ limit: 3 });
  await db.query(`insert into public.lottery_draws (lottery, period, draw_date, numbers)
    values ('今彩539', '19999', '2026-09-15', '["01","02","03","04","05"]')`);
  assert.equal((await query({ cursor: before.nextCursor })).error, 'DRAW_HISTORY_CHANGED');
  const inserted = await query({ limit: 3 });
  assert.equal(inserted.items[0].period, '19999');
  await db.query("delete from public.lottery_draws where lottery = '今彩539' and period = '19999'");
  assert.equal((await query({ cursor: inserted.nextCursor })).error, 'DRAW_HISTORY_CHANGED');
  assert.deepEqual(await allPages(), expectedHistory);
});

test('alias comparisons use normalized numbers but retain NULL versus empty draw order distinctions', async () => {
  await db.exec('begin');
  try {
    await db.query(`update public.lottery_draws set numbers = '["01","03","10","20","39"]'
      where period = '099000000'`);
    await db.query(`update public.lottery_draws set numbers = '[49]', draw_order_numbers = '[39,20,10,3,1]'
      where period = '099000004'`);
    assert.deepEqual(await allPages(), expectedHistory);
    await db.query(`update public.lottery_draws set draw_order_numbers = '[]' where period = '099000000'`);
    assert.equal((await query()).error, 'DRAW_HISTORY_CONFLICT');
  } finally { await db.exec('rollback'); }
});

test('period padding applies to Taiwan lotteries only', async () => {
  await db.exec('begin');
  try {
    await db.query(`insert into public.lottery_draws (lottery, period, draw_date, numbers)
      select lottery, period, '2026-01-01', '["01"]'::jsonb
      from unnest(array['大樂透','天天樂','六合彩']) lottery
      cross join unnest(array['99000000','099000000']) period`);
    for (const lottery of ['大樂透', '天天樂', '六合彩']) {
      const result = await query({ lottery });
      assert.equal(result.items.length, lottery === '大樂透' ? 1 : 2);
    }
  } finally { await db.exec('rollback'); }
});

test('conflicting canonical dates, numbers and statuses fail closed before pages or tongxing lag', async () => {
  for (const change of ["draw_date = '2026-01-01'", "sorted_numbers = '[\"04\"]'", "result_status = 'confirmed'"]) {
    await db.exec('begin');
    try {
      await db.query(`update public.lottery_draws set ${change} where period = '099000000'`);
      for (const kind of ['latest', 'history', 'tongxing']) {
        assert.equal((await query({ kind, numbers: ['01'] })).error, 'DRAW_HISTORY_CONFLICT');
      }
    } finally { await db.exec('rollback'); }
  }
});

test('rollback only removes the query function, preserving the original draws', async () => {
  const before = await db.query('select * from public.lottery_draws order by lottery, period');
  await db.exec(await readFile(new URL('../rollbacks/20260914114420_matrix_draw_query_pagination.sql', import.meta.url), 'utf8'));
  await assert.rejects(query(), error => error.code === '42883');
  assert.deepEqual((await db.query('select * from public.lottery_draws order by lottery, period')).rows, before.rows);
});
