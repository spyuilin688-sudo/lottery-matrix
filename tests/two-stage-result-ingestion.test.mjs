import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migrationPath = new URL('../supabase/migrations/20260912164917_two_stage_lottery_results.sql', import.meta.url);
const oldSql = readFileSync(new URL('../supabase/migrations/20260905205428_notification_fast_results.sql', import.meta.url), 'utf8');
const oldFast = oldSql.slice(oldSql.indexOf('create or replace function private.notification_fast_result_publish'), oldSql.indexOf('create or replace function private.notification_pilio_http_tick'));
const numbers = ['01','02','03','04','05','06','49'];

async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema private;
    create table public.lottery_draws (
      id bigint generated always as identity primary key, lottery text not null,
      period text not null, draw_date date, numbers jsonb not null, sorted_numbers jsonb not null,
      draw_order_numbers jsonb, source_id text, created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(), unique(lottery,period));
    create table public.matrix_analysis_runs (lottery text,draw_period text,analysis_version text,
      primary key(lottery,draw_period,analysis_version));
    create table public.matrix_card_publications (lottery text primary key,desired_digest text,
      desired_period text,eligible_at timestamptz,manifest jsonb,published_at timestamptz,
      lease_token uuid,lease_until timestamptz,last_error text);
    create table public.notification_events(id uuid primary key default gen_random_uuid(),event_key text,
      event_type text,source text,payload jsonb,occurred_at timestamptz);
    create function private.notification_event_enqueue(text,text,text,timestamptz,jsonb)
      returns jsonb language plpgsql as $$ declare event_id uuid; begin
      select id into event_id from public.notification_events where event_type=$2
       and payload->>'lottery'=$5->>'lottery' and payload->>'drawDate'=$5->>'drawDate';
      if event_id is not null then return jsonb_build_object('id',event_id,'created',false); end if;
      insert into public.notification_events(event_key,event_type,source,occurred_at,payload)
       values($1,$2,$3,$4,$5) returning id into event_id;
      return jsonb_build_object('id',event_id,'created',true); end $$;
    create function private.notification_fanout_event(uuid) returns void language sql as $$select$$;
  `);
  await db.exec(oldFast);
  if (existsSync(migrationPath)) await db.exec(readFileSync(migrationPath, 'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20260912192941_preserve_provisional_draw_identity.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20260912202503_avoid_unchanged_draw_writes.sql', import.meta.url), 'utf8'));
  await db.query(`insert into lottery_draws(lottery,period,draw_date,numbers,sorted_numbers,draw_order_numbers)
    values ('六合彩','026099','2026-09-12',$1,$1,$1)`, [JSON.stringify(numbers)]);
  return db;
}

async function fast(db) {
  return db.query(`select public.notification_fast_result_publish('marksix','2026-09-15',$1::text[]) result`, [numbers]);
}

function formal(period='026100', override={}) {
  return {lottery:'六合彩',period,draw_date:'2026-09-15',numbers,sorted_numbers:numbers,
    draw_order_numbers:['06','05','04','03','02','01','49'],result_status:'confirmed',...override};
}

async function observeDrawUpdates(db) {
  await db.exec(`create table private.draw_updates (draw_id bigint);
    create function private.observe_draw_update() returns trigger language plpgsql as $$ begin
      insert into private.draw_updates values(new.id); return new; end $$;
    create trigger observe_draw_update after update on public.lottery_draws
      for each row execute function private.observe_draw_update();`);
  return async () => (await db.query('select count(*)::int n from private.draw_updates')).rows[0].n;
}

async function upsert(db, draws) {
  return (await db.query('select public.matrix_upsert_draws($1::jsonb) result', [JSON.stringify(draws)])).rows[0].result;
}

for (const lottery of ['今彩539', '天天樂', '六合彩', '大樂透']) {
  test(`${lottery} repeated identical crawler batches perform zero physical draw updates`, async () => {
    const db = await database();
    try {
      const values = ['今彩539','天天樂'].includes(lottery) ? numbers.slice(0,5) : numbers;
      const draw = formal('100', {lottery,numbers:values,sorted_numbers:values,
        draw_order_numbers:lottery==='天天樂'?null:values});
      const first = await upsert(db,[draw]);
      const updateCount = await observeDrawUpdates(db);
      assert.deepEqual(await upsert(db,[draw,draw]),[first[0],first[0]]);
      assert.equal(await updateCount(),0);
    } finally { await db.close(); }
  });
}

test('repeated confirmed batches return existing rows without physical updates or invalidating completed work', async () => {
  const db=await database();
  try {
    const saved=await upsert(db,[formal()]);
    await db.exec(`insert into matrix_analysis_runs values('六合彩','026100','026100:matrix-python-v14-sorted');
      insert into matrix_card_publications(lottery,desired_digest,lease_token,lease_until)
      values('六合彩',repeat('a',64),gen_random_uuid(),now()+interval '10 minutes');`);
    const cards=(await db.query('select * from matrix_card_publications')).rows;
    const updateCount=await observeDrawUpdates(db);
    assert.deepEqual(await upsert(db,[formal(),formal()]),[saved[0],saved[0]]);
    assert.deepEqual(await upsert(db,[formal()]),saved);
    assert.equal(await updateCount(),0);
    assert.equal((await db.query('select count(*)::int n from matrix_analysis_runs')).rows[0].n,1);
    assert.deepEqual((await db.query('select * from matrix_card_publications')).rows,cards);
  } finally { await db.close(); }
});

test('repeated preliminary batches normalize unavailable actual numbers and do not rewrite the sorted draw', async () => {
  const db=await database();
  try {
    await fast(db);
    const saved=(await db.query(`select to_jsonb(d) result from lottery_draws d where draw_date='2026-09-15'`)).rows[0].result;
    const updateCount=await observeDrawUpdates(db);
    const preliminary=formal('026100',{result_status:'preliminary',source_id:'pilio',draw_order_numbers:[]});
    assert.deepEqual(await upsert(db,[preliminary,preliminary]),[saved,saved]);
    await fast(db);
    assert.equal(await updateCount(),0);
    assert.equal((await db.query('select count(*)::int n from notification_events')).rows[0].n,1);
  } finally { await db.close(); }
});

test('confirmation and actual order correction update the same identity once each while repeated stages are no-ops', async () => {
  const db=await database();
  try {
    await fast(db);
    const before=(await db.query(`select id from lottery_draws where draw_date='2026-09-15'`)).rows[0];
    const updateCount=await observeDrawUpdates(db);
    const official=formal('026100',{source_id:'pilio',draw_order_numbers:null});
    const confirmed=await upsert(db,[official,official]);
    assert.equal(confirmed[0].id,before.id);
    assert.equal(confirmed[0].result_status,'confirmed');
    assert.equal(await updateCount(),1);
    const actual=await upsert(db,[formal('026100',{source_id:'pilio'}),formal('026100',{source_id:'pilio'})]);
    assert.equal(actual[0].id,before.id);
    assert.deepEqual(actual[0].draw_order_numbers,['06','05','04','03','02','01','49']);
    assert.equal(await updateCount(),2);
    const corrected=formal('026100',{source_id:'pilio',draw_order_numbers:['05','06','04','03','02','01','49']});
    assert.deepEqual((await upsert(db,[corrected,corrected]))[0].draw_order_numbers,corrected.draw_order_numbers);
    assert.equal(await updateCount(),3);
    await upsert(db,[formal('026100',{result_status:'preliminary',source_id:'pilio'})]);
    assert.equal(await updateCount(),3);
  } finally { await db.close(); }
});

test('source metadata changes persist once including null transitions without invalidating unchanged sorted analysis', async () => {
  const db=await database();
  try {
    const [saved]=await upsert(db,[formal()]);
    await db.exec(`insert into matrix_analysis_runs values('六合彩','026100','026100:matrix-python-v14-sorted')`);
    const updateCount=await observeDrawUpdates(db);
    let expectedUpdates=0;
    for (const source of ['nfd','official',null]) {
      const [result]=await upsert(db,[formal('026100',{source_id:source}),formal('026100',{source_id:source})]);
      expectedUpdates+=1;
      assert.equal(result.id,saved.id);
      assert.equal(result.source_id,source);
      assert.equal(await updateCount(),expectedUpdates);
      assert.equal((await db.query('select count(*)::int n from matrix_analysis_runs')).rows[0].n,1);
    }
  } finally { await db.close(); }
});

test('fresh date and sorted numbers become provisional period +1 and one result notification', async () => {
  const db=await database();
  try {
    await fast(db); await fast(db);
    const {rows}=await db.query(`select * from lottery_draws where draw_date='2026-09-15'`);
    assert.equal(rows.length,1);
    assert.equal(rows[0].period,'026100');
    assert.equal(rows[0].result_status,'preliminary');
    assert.deepEqual(rows[0].sorted_numbers,numbers);
    assert.equal(rows[0].draw_order_numbers,null);
    assert.equal((await db.query('select count(*)::int n from notification_events')).rows[0].n,1);
  } finally { await db.close(); }
});

test('formal period correction replaces the provisional identity and invalidates obsolete results', async () => {
  const db=await database();
  try {
    await fast(db);
    const before=(await db.query(`select id from lottery_draws where period='026100'`)).rows[0];
    await db.exec(`insert into matrix_analysis_runs values('六合彩','026100','026100:matrix-python-v14-sorted')`);
    await db.query('select public.matrix_upsert_draws($1::jsonb)', [JSON.stringify([formal('026101')])]);
    const {rows}=await db.query(`select * from lottery_draws where draw_date='2026-09-15'`);
    assert.equal(rows.length,1); assert.equal(rows[0].id,before.id);
    assert.equal(rows[0].period,'026101'); assert.equal(rows[0].result_status,'confirmed');
    assert.deepEqual(rows[0].draw_order_numbers,formal().draw_order_numbers);
    assert.equal((await db.query('select count(*)::int n from matrix_analysis_runs')).rows[0].n,0);
    await fast(db);
    assert.equal((await db.query(`select result_status from lottery_draws where period='026101'`)).rows[0].result_status,'confirmed');
  } finally { await db.close(); }
});

test('confirmation preserves same sorted stage and invalidates card lease before actual publication', async () => {
  const db=await database();
  try {
    await fast(db);
    await db.exec(`insert into matrix_analysis_runs values('六合彩','026100','026100:matrix-python-v14-sorted');
      insert into matrix_card_publications(lottery,desired_digest,lease_token,lease_until)
      values('六合彩',repeat('a',64),gen_random_uuid(),now()+interval '10 minutes');`);
    await db.query('select public.matrix_upsert_draws($1::jsonb)', [JSON.stringify([formal()])]);
    assert.equal((await db.query('select count(*)::int n from matrix_analysis_runs')).rows[0].n,1);
    const card=(await db.query('select * from matrix_card_publications')).rows[0];
    assert.equal(card.lease_token,null); assert.equal(card.desired_digest,null);
    const different=['11','12','13','14','15','16','49'];
    await db.query('select public.matrix_upsert_draws($1::jsonb)', [JSON.stringify([formal('026100',{numbers:different,sorted_numbers:different,draw_order_numbers:different})])]);
    assert.equal((await db.query('select count(*)::int n from matrix_analysis_runs')).rows[0].n,0);
  } finally { await db.close(); }
});

test('invalid duplicate numbers create neither draw nor notification', async () => {
  const db=await database();
  try {
    await assert.rejects(db.query(`select public.notification_fast_result_publish('marksix','2026-09-15',$1::text[])`,[['01','01','03','04','05','06','49']]));
    assert.equal((await db.query('select count(*)::int n from lottery_draws')).rows[0].n,1);
    assert.equal((await db.query('select count(*)::int n from notification_events')).rows[0].n,0);
  } finally { await db.close(); }
});

test('correcting a historical input invalidates later sorted computations that consumed it', async () => {
  const db=await database();
  try {
    await fast(db);
    await db.exec(`insert into matrix_analysis_runs values('六合彩','026100','026100:matrix-python-v14-sorted')`);
    const different=['11','12','13','14','15','16','49'];
    await db.query('select public.matrix_upsert_draws($1::jsonb)', [JSON.stringify([formal('026099',{
      draw_date:'2026-09-12',numbers:different,sorted_numbers:different,draw_order_numbers:different})])]);
    assert.equal((await db.query('select count(*)::int n from matrix_analysis_runs')).rows[0].n,0);
  } finally { await db.close(); }
});

test('formal period correction atomically moves later estimates without replacing either date', async () => {
  const db=await database();
  try {
    await fast(db);
    await db.query(`select public.notification_fast_result_publish('marksix','2026-09-17',$1::text[])`, [numbers]);
    const before=(await db.query(`select id,draw_date from lottery_draws order by draw_date`)).rows;
    await db.query('select public.matrix_upsert_draws($1::jsonb)', [JSON.stringify([formal('026101')])]);
    const {rows}=await db.query(`select id,draw_date,period,result_status from lottery_draws order by draw_date`);
    assert.deepEqual(rows.map(({id,draw_date})=>({id,draw_date})),before);
    assert.deepEqual(rows.map(({period,result_status})=>[period,result_status]),[
      ['026099','confirmed'],['026101','confirmed'],['026102','preliminary']]);
  } finally { await db.close(); }
});

test('downward formal correction and missing-date historical insertion preserve dates and invalidate dependencies', async () => {
  const db=await database();
  try {
    await fast(db);
    await db.exec(`update lottery_draws set period='026101' where result_status='preliminary'`);
    await db.query(`select public.notification_fast_result_publish('marksix','2026-09-17',$1::text[])`, [numbers]);
    await db.query('select public.matrix_upsert_draws($1::jsonb)', [JSON.stringify([formal('026100')])]);
    assert.deepEqual((await db.query(`select period from lottery_draws order by draw_date`)).rows.map(row=>row.period),['026099','026100','026101']);
    await db.exec(`insert into matrix_analysis_runs values('六合彩','026101','026101:matrix-python-v14-sorted')`);
    await db.query('select public.matrix_upsert_draws($1::jsonb)', [JSON.stringify([formal('025001',{draw_date:null})])]);
    assert.equal((await db.query('select count(*)::int n from matrix_analysis_runs')).rows[0].n,0);
  } finally { await db.close(); }
});

test('backfilling an older official date preserves the newer preliminary ID and result notification', async () => {
  const db=await database();
  try {
    await db.exec(`update lottery_draws set draw_date='2026-09-10'`);
    await fast(db);
    const before=(await db.query(`select id,draw_date::text draw_date from lottery_draws where period='026100'`)).rows[0];
    const eventBefore=(await db.query(`select id,payload from notification_events`)).rows;
    await db.exec(`insert into matrix_analysis_runs values('六合彩','026100','026100:matrix-python-v14-sorted');
      insert into matrix_card_publications(lottery,desired_digest,lease_token,lease_until)
      values('六合彩',repeat('a',64),gen_random_uuid(),now()+interval '10 minutes');`);
    const backfill=[formal('026100',{draw_date:'2026-09-12'})];
    await db.query('select public.matrix_upsert_draws($1::jsonb)', [JSON.stringify(backfill)]);
    const {rows}=await db.query(`select id,draw_date::text draw_date,period,result_status from lottery_draws order by draw_date`);
    assert.equal(rows.length,3);
    assert.deepEqual(rows.map(({draw_date,period,result_status})=>[draw_date,period,result_status]),[
      ['2026-09-10','026099','confirmed'],['2026-09-12','026100','confirmed'],['2026-09-15','026101','preliminary']]);
    assert.equal(rows[2].id,before.id);
    assert.notEqual(rows[1].id,before.id);
    assert.equal((await db.query('select count(*)::int n from matrix_analysis_runs')).rows[0].n,0);
    const card=(await db.query('select * from matrix_card_publications')).rows[0];
    assert.equal(card.lease_token,null); assert.equal(card.desired_digest,null);
    await db.query('select public.matrix_upsert_draws($1::jsonb)', [JSON.stringify(backfill)]);
    await fast(db);
    assert.deepEqual((await db.query(`select id,draw_date::text draw_date,period,result_status from lottery_draws order by draw_date`)).rows,rows);
    assert.deepEqual((await db.query(`select id,payload from notification_events`)).rows,eventBefore);
  } finally { await db.close(); }
});

test('reverse-order official backfill rebases multiple preliminary dates atomically and is retry safe', async () => {
  const db=await database();
  try {
    await db.exec(`update lottery_draws set draw_date='2026-09-10'`);
    await fast(db);
    await db.query(`select public.notification_fast_result_publish('marksix','2026-09-17',$1::text[])`, [numbers]);
    const before=(await db.query(`select id,draw_date::text draw_date from lottery_draws where result_status='preliminary' order by draw_date`)).rows;
    const backfill=[formal('026101',{draw_date:'2026-09-13'}),formal('026100',{draw_date:'2026-09-12'})];
    await db.query('select public.matrix_upsert_draws($1::jsonb)', [JSON.stringify(backfill)]);
    const {rows}=await db.query(`select id,draw_date::text draw_date,period,result_status from lottery_draws order by draw_date`);
    assert.deepEqual(rows.map(({draw_date,period})=>[draw_date,period]),[
      ['2026-09-10','026099'],['2026-09-12','026100'],['2026-09-13','026101'],
      ['2026-09-15','026102'],['2026-09-17','026103']]);
    assert.deepEqual(rows.filter(row=>row.result_status==='preliminary').map(({id,draw_date})=>({id,draw_date})),before);
    await db.query('select public.matrix_upsert_draws($1::jsonb)', [JSON.stringify([...backfill].reverse())]);
    assert.deepEqual((await db.query(`select id,draw_date::text draw_date,period,result_status from lottery_draws order by draw_date`)).rows,rows);
  } finally { await db.close(); }
});

test('a confirmed-period collision rolls back earlier backfills and all analysis invalidation', async () => {
  const db=await database();
  try {
    await db.exec(`update lottery_draws set draw_date='2026-09-10'`);
    await fast(db);
    await db.exec(`insert into matrix_analysis_runs values('六合彩','026100','026100:matrix-python-v14-sorted')`);
    const before=(await db.query('select * from lottery_draws order by id')).rows;
    const analysisBefore=(await db.query('select * from matrix_analysis_runs')).rows;
    await assert.rejects(db.query('select public.matrix_upsert_draws($1::jsonb)', [JSON.stringify([
      formal('026100',{draw_date:'2026-09-12'}),formal('026099',{draw_date:'2026-09-13'})])]), /DRAW_PERIOD_DATE_CONFLICT/);
    assert.deepEqual((await db.query('select * from lottery_draws order by id')).rows,before);
    assert.deepEqual((await db.query('select * from matrix_analysis_runs')).rows,analysisBefore);
  } finally { await db.close(); }
});
