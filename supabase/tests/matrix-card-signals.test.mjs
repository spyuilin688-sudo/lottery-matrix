import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migrationPath = new URL('../migrations/20260924033653_matrix_card_signals.sql', import.meta.url);
const lottery = '今彩539';
const generation = 'a'.repeat(64);
const oldGeneration = 'd'.repeat(64);
const manifest = (orders, digest = generation) => ({
  lottery, period: '026102', generation: digest,
  cards: Object.fromEntries(orders.map(order => [order, { url: `${order}.png` }])),
});

test('card signals change only with a published manifest and are anonymous read-only', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema private;
      create publication supabase_realtime;
      create table public.matrix_card_publications (
        lottery text primary key, manifest jsonb, desired_digest text,
        published_at timestamptz, lease_token uuid
      );
      revoke all on public.matrix_card_publications from public, anon, authenticated;
      insert into public.matrix_card_publications(lottery, manifest)
        values ('六合彩', '{"lottery":"六合彩","generation":"${'b'.repeat(64)}","cards":{"sorted":{}}}');
      insert into public.matrix_card_publications(lottery) values ('今彩539');
    `);
    await db.query(`update public.matrix_card_publications
      set manifest=$1::jsonb, desired_digest=$2 where lottery=$3`,
    [JSON.stringify(manifest(['sorted'], oldGeneration)), oldGeneration, lottery]);
    if (existsSync(migrationPath)) await db.exec(readFileSync(migrationPath, 'utf8'));

    const signals = () => db.query(`select lottery, generation, orders, revision::text as revision
      from public.matrix_card_signals order by lottery`);
    const atLottery = async () => (await db.query(`select generation, orders, revision::text as revision
      from public.matrix_card_signals where lottery=$1`, [lottery])).rows[0];
    assert.deepEqual((await signals()).rows.sort((a, b) => a.lottery.localeCompare(b.lottery, 'zh-Hant')), [
      { lottery: '今彩539', generation: oldGeneration, orders: ['sorted'], revision: '0' },
      { lottery: '六合彩', generation: 'b'.repeat(64), orders: ['sorted'], revision: '0' },
      { lottery: '大樂透', generation: null, orders: [], revision: '0' },
      { lottery: '天天樂', generation: null, orders: [], revision: '0' },
    ].sort((a, b) => a.lottery.localeCompare(b.lottery, 'zh-Hant')));
    assert.deepEqual((await db.query(`select schemaname, tablename from pg_publication_tables
      where pubname='supabase_realtime'`)).rows,
      [{ schemaname: 'public', tablename: 'matrix_card_signals' }]);

    // A source change leaves the old manifest stored, but invalidates it until
    // new PNGs are published. The open page must receive that transition.
    await db.query(`update public.matrix_card_publications set desired_digest=null where lottery=$1`, [lottery]);
    assert.deepEqual(await atLottery(), { generation: null, orders: [], revision: '1' });
    await db.query(`update public.matrix_card_publications set desired_digest=null where lottery=$1`, [lottery]);
    assert.equal((await atLottery()).revision, '1', 'a repeated invalidation has no signal write');
    await db.query(`update public.matrix_card_publications set desired_digest=$1 where lottery=$2`, [generation, lottery]);
    assert.equal((await atLottery()).revision, '1', 'observing a new desired digest is not publication');

    await db.query(`update public.matrix_card_publications set manifest=$1::jsonb where lottery=$2`,
      [JSON.stringify(manifest(['sorted'])), lottery]);
    assert.deepEqual(await atLottery(), { generation, orders: ['sorted'], revision: '2' });

    await db.query(`update public.matrix_card_publications set lease_token=$1::uuid where lottery=$2`,
      ['00000000-0000-0000-0000-000000000001', lottery]);
    await db.query(`update public.matrix_card_publications set manifest=$1::jsonb where lottery=$2`,
      [JSON.stringify(manifest(['sorted'])), lottery]);
    assert.equal((await atLottery()).revision, '2', 'lease and identical manifest updates have no signal write');

    await db.query(`update public.matrix_card_publications set manifest=$1::jsonb where lottery=$2`,
      [JSON.stringify(manifest(['sorted', 'draw'])), lottery]);
    assert.deepEqual(await atLottery(), { generation, orders: ['sorted', 'draw'], revision: '3' },
      'formal draw card must signal even when generation is unchanged');

    await db.query(`update public.matrix_card_publications set manifest=null where lottery=$1`, [lottery]);
    assert.deepEqual(await atLottery(), { generation: null, orders: [], revision: '4' });

    await db.exec('begin');
    await db.query(`update public.matrix_card_publications set desired_digest=null where lottery=$1`, [lottery]);
    assert.equal((await atLottery()).revision, '5');
    await db.exec('rollback');
    assert.deepEqual(await atLottery(), { generation: null, orders: [], revision: '4' },
      'a rolled-back source invalidation must leave no durable signal');

    await db.exec('begin');
    await db.query(`update public.matrix_card_publications set manifest=$1::jsonb where lottery=$2`,
      [JSON.stringify(manifest(['sorted'], 'c'.repeat(64))), lottery]);
    assert.equal((await atLottery()).revision, '5');
    await db.exec('rollback');
    assert.deepEqual(await atLottery(), { generation: null, orders: [], revision: '4' },
      'a rolled-back publication must leave no durable signal');

    for (const role of ['anon', 'authenticated']) {
      const privileges = (await db.query(`select
        has_table_privilege($1, 'public.matrix_card_signals', 'SELECT') as read,
        has_table_privilege($1, 'public.matrix_card_signals', 'INSERT') as insert,
        has_table_privilege($1, 'public.matrix_card_signals', 'UPDATE') as update,
        has_table_privilege($1, 'public.matrix_card_signals', 'DELETE') as delete,
        has_table_privilege($1, 'public.matrix_card_publications', 'SELECT') as private_read`, [role])).rows[0];
      assert.deepEqual(privileges,
        { read: true, insert: false, update: false, delete: false, private_read: false }, role);
      await db.exec(`set role ${role}`);
      assert.equal((await db.query('select count(*)::integer as count from public.matrix_card_signals')).rows[0].count, 4);
      await assert.rejects(db.query(`update public.matrix_card_signals set revision=99 where lottery=$1`, [lottery]),
        /permission denied|row-level security/i);
      await db.exec('reset role');
    }
    assert.deepEqual((await db.query(`select cmd from pg_policies
      where schemaname='public' and tablename='matrix_card_signals'`)).rows,
      [{ cmd: 'SELECT' }]);
  } finally {
    await db.close();
  }
});
