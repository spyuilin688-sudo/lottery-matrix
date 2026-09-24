import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import test from 'node:test';

async function migration(name) {
  return readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
}

function functionDefinition(sql, qualifiedName) {
  const start = sql.indexOf(`create or replace function ${qualifiedName}(`);
  assert.notEqual(start, -1, `missing ${qualifiedName}`);
  const remainder = sql.slice(start);
  const terminator = /\bend;?\s*\$\$;/g.exec(remainder);
  assert.ok(terminator, `missing end of ${qualifiedName}`);
  return remainder.slice(0, terminator.index + terminator[0].length);
}

async function setup() {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema private;
      create table public.notification_events (
        id uuid primary key default pg_catalog.gen_random_uuid(),
        event_key text not null unique,
        event_type text not null,
        source text not null,
        payload jsonb not null,
        occurred_at timestamptz not null,
        fanout_status text not null default 'pending'
      );
      create unique index notification_results_draw_date_key
        on public.notification_events ((payload->>'lottery'), (payload->>'drawDate'))
        where event_type='lottery_result' and payload->>'lottery' is not null
          and payload->>'drawDate' is not null;
      create table private.preliminary_results (
        lottery text not null, draw_date date not null, numbers jsonb not null,
        primary key (lottery, draw_date)
      );
      create table private.fanout_calls(event_id uuid not null);
      create table private.dispatch_calls(id integer generated always as identity);
      create function private.matrix_stage_fast_result(p_lottery text, p_date date, p_numbers jsonb)
      returns void language sql as $$
        insert into private.preliminary_results(lottery,draw_date,numbers)
        values (p_lottery,p_date,p_numbers) on conflict do nothing
      $$;
      create function private.notification_fanout_event(p_event_id uuid)
      returns integer language plpgsql as $$
      begin
        insert into private.fanout_calls(event_id) values (p_event_id);
        return 1;
      end $$;
      create function private.notification_dispatch_wake()
      returns jsonb language plpgsql as $$
      begin
        insert into private.dispatch_calls default values;
        return '{}'::jsonb;
      end $$;
    `);
    const enqueue = await migration('20260905205428_notification_fast_results.sql');
    const staged = await migration('20260912164917_two_stage_lottery_results.sql');
    const trigger = await migration('20260921194000_event_driven_notification_dispatch.sql');
    await db.exec(functionDefinition(enqueue, 'private.notification_event_enqueue'));
    await db.exec(functionDefinition(staged, 'private.notification_fast_result_publish'));
    await db.exec(functionDefinition(trigger, 'private.notification_event_publish_after_insert'));
    await db.exec(`create trigger notification_event_publish_after_insert
      after insert on public.notification_events for each row
      execute function private.notification_event_publish_after_insert();`);

    const names = await readdir(new URL('../migrations/', import.meta.url));
    const fix = names.find(name => name.endsWith('_avoid_duplicate_fast_result_fanout.sql'));
    if (fix) await db.exec(await migration(fix));
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

async function publish(db, date = '2026-09-05') {
  const { rows } = await db.query(
    `select private.notification_fast_result_publish('539', $1::date,
      array['38','03','28','08','10']) as event`, [date],
  );
  return rows[0].event;
}

async function count(db, table) {
  return Number((await db.query(`select count(*)::integer as count from ${table}`)).rows[0].count);
}

test('new fast result stages one draw and triggers one fanout and dispatch', async () => {
  const db = await setup();
  try {
    const event = await publish(db);
    assert.equal(event.created, true);
    assert.equal(await count(db, 'public.notification_events'), 1);
    assert.equal(await count(db, 'private.preliminary_results'), 1);
    assert.deepEqual((await db.query('select numbers from private.preliminary_results')).rows[0].numbers,
      ['03', '08', '10', '28', '38']);
    assert.equal(await count(db, 'private.fanout_calls'), 1);
    assert.equal(await count(db, 'private.dispatch_calls'), 1);
  } finally {
    await db.close();
  }
});

test('repeat fast result reuses the event without fanout or dispatch', async () => {
  const db = await setup();
  try {
    const first = await publish(db);
    const repeated = await publish(db);
    assert.equal(repeated.created, false);
    assert.equal(repeated.id, first.id);
    assert.equal(await count(db, 'public.notification_events'), 1);
    assert.equal(await count(db, 'private.preliminary_results'), 1);
    assert.equal(await count(db, 'private.fanout_calls'), 1);
    assert.equal(await count(db, 'private.dispatch_calls'), 1);
  } finally {
    await db.close();
  }
});

test('official result recorded first is not fanned out again by the fast result', async () => {
  const db = await setup();
  try {
    const { rows } = await db.query(`select private.notification_event_enqueue(
      'lottery_result:539:official', 'lottery_result', 'railway', pg_catalog.now(),
      '{"lottery":"今彩539","drawDate":"2026-09-05","numbers":["03","08","10","28","38"]}'::jsonb
    ) as event`);
    assert.equal(rows[0].event.created, true);

    const fast = await publish(db);

    assert.equal(fast.created, false);
    assert.equal(fast.id, rows[0].event.id);
    assert.equal(await count(db, 'public.notification_events'), 1);
    assert.equal(await count(db, 'private.preliminary_results'), 1);
    assert.equal(await count(db, 'private.fanout_calls'), 1);
    assert.equal(await count(db, 'private.dispatch_calls'), 1);
  } finally {
    await db.close();
  }
});
