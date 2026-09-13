import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, afterEach, before, beforeEach, mock, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const db = new PGlite();
const member = '62000000-0000-0000-0000-000000000001';
const lotteries = ['今彩539', '天天樂', '六合彩', '大樂透'];
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];

before(async () => {
  // The fixture supplies only unrelated member/extension infrastructure.
  // Enqueue, fanout, settings matching, claim and rendering use real migrations.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema private; create schema extensions;
    create function extensions.gen_random_uuid() returns uuid language sql as $$ select pg_catalog.gen_random_uuid() $$;
    create function extensions.digest(text,text) returns bytea language sql as $$ select pg_catalog.sha256(pg_catalog.convert_to($1,'UTF8')) $$;
    create table public.members(id uuid primary key,auth_user_id uuid,status text,plan_expires_at timestamptz,is_lifetime boolean default false);
    create table public.lottery_draws(lottery text,period text,draw_date date);
  `);
  await db.exec(read('../migrations/20260823042016_create_member_notification_settings.sql'));
  const defaults = read('../migrations/20260829090000_member_pwa_rpc.sql');
  await db.exec(defaults.match(/create or replace function private.default_member_notification_settings\(\)[\s\S]*?\$\$;/i)[0]);
  for (const file of [
    '20260904091705_notification_dispatch_schema.sql',
    '20260904091709_notification_dispatch_pipeline.sql',
    '20260904091714_notification_member_match_guard.sql',
    '20260904091719_notification_dispatch_rpc.sql',
    '20260904091723_notification_dispatch_time_events.sql',
  ]) await db.exec(read(`../migrations/${file}`));
  // Do not install the unrelated network/cron entry point in an embedded DB.
  const fastResults = read('../migrations/20260905205428_notification_fast_results.sql');
  await db.exec(fastResults.split('create or replace function private.notification_pilio_http_tick')[0] + 'commit;');
  await db.exec(read('../migrations/20260908022115_simplify_matrix_card_notification_body.sql'));
  const migration = read('../migrations/20260913133102_notification_reminder_draw_days.sql');
  if (migration.trim()) await db.exec(migration);
  await db.exec(read('../migrations/20260913153424_notification_marksix_official_calendar.sql'));
});
after(async () => db.close());
test('an unconfirmed Mark Six date fails closed instead of using Thursday', async () => {
  assert.equal(await scalar("select private.notification_is_draw_day('六合彩','2026-09-24')"), false);
});
test('the other lotteries keep their calendar without a Mark Six sync', async () => {
  assert.equal(await scalar("select private.notification_is_draw_day('今彩539','2026-09-14')"), true);
  assert.equal(await scalar("select private.notification_is_draw_day('天天樂','2026-09-13')"), true);
});

const owner = '71000000-0000-0000-0000-000000000001';
const other = '71000000-0000-0000-0000-000000000002';
const calendar = draws => Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i+1).padStart(2,'0')}`, isDrawDay: draws.includes(i+1) }));
const official = () => calendar([5,8,10,12,15,17,19,22,26,29]);
const at = value => mock.timers.setTime(Date.parse(value));
const acquire = (id=owner) => scalar('select public.notification_draw_calendar_acquire($1)', [id]);
const complete = async (days=official(),id=owner) => scalar('select public.notification_draw_calendar_complete($1,$2,$3)', [id,JSON.stringify(days),await scalar('select clock_timestamp()')]);
const eligible = day => scalar("select private.notification_is_draw_day('六合彩',$1)", [day]);
const health = () => scalar('select public.notification_draw_calendar_status()');
async function sync(days=official(),id=owner) { assert.equal(await acquire(id),true); assert.equal(await complete(days,id),true); }

beforeEach(async () => {
  mock.timers.enable({ apis:['Date'],now:new Date('2026-09-13T00:00:00Z') });
  await db.exec('begin');
  await db.query("insert into public.members(id,auth_user_id,status) values ($1,$1,'active')",[member]);
  await db.query("insert into public.notification_settings(member_id,settings) values ($1,jsonb_set(private.default_member_notification_settings(),'{betTimes,六合彩}','[\"20:00\"]'))",[member]);
});
afterEach(async () => { await db.exec('reset role; rollback'); mock.timers.reset(); });

test('official September calendar disables unlisted Thursday and keeps Tuesday',async()=>{
  await sync();
  assert.equal(await eligible('2026-09-24'),false);
  assert.equal(await eligible('2026-09-15'),true);
  assert.equal(await scalar("select count(*)::int from private.notification_draw_day_overrides where source_kind='hkjc'"),30);
  assert.deepEqual((await health()).next_draw_date,'2026-09-15');
});
test('replacement snapshot switches Saturday to Sunday in one owned completion',async()=>{
  at('2026-09-12T00:00:00Z'); await sync();
  assert.equal(await eligible('2026-09-12'),true);
  at('2026-09-12T11:45:00Z'); await sync(calendar([5,8,10,13,15,17,19,22,26,29]));
  assert.equal(await eligible('2026-09-12'),false);
  assert.equal(await eligible('2026-09-13'),true);
});
test('a normal non-draw day is healthy and does not request an alert',async()=>{
  await sync(); const value=await health();
  assert.equal(value.status,'已確認'); assert.equal(value.is_draw_day_today,false);
  assert.equal(value.message,'今天沒有排定開獎，不發送選號提醒。');
});
test('missing and expired calendars pause reminders',async()=>{
  assert.equal((await health()).status,'待確認');
  await sync(); at('2026-09-15T00:00:00Z');
  assert.equal(await eligible('2026-09-15'),false); assert.equal((await health()).status,'待確認');
});
test('an unavailable source disables the previous snapshot without deleting dates',async()=>{
  await sync(); at('2026-09-13T11:45:00Z'); assert.equal(await acquire(),true);
  assert.equal(await scalar('select public.notification_draw_calendar_fail($1)',[owner]),true);
  assert.equal(await eligible('2026-09-15'),false); assert.equal((await health()).status,'待確認');
  assert.equal(await scalar('select count(*)::int from private.notification_draw_day_overrides'),30);
  at('2026-09-13T11:50:00Z'); assert.equal(await acquire(),false);
  at('2026-09-13T12:00:00Z'); await sync(); assert.equal((await health()).status,'已確認');
});
test('only one worker receives the calendar lease',async()=>{
  assert.equal(await acquire(),true); assert.equal(await acquire(other),false);
  assert.equal(await complete(official(),other),false);
  assert.equal(await scalar('select public.notification_draw_calendar_fail($1)',[other]),false);
  assert.equal(await complete(),true);
});
test('an expired owner cannot replace the new owners calendar or mark it failed',async()=>{
  assert.equal(await acquire(),true); at('2026-09-13T00:06:00Z');
  assert.equal(await complete(),false); assert.equal(await acquire(other),true);
  assert.equal(await complete(official(),other),true);
  assert.equal(await complete(calendar([13]),owner),false);
  assert.equal(await scalar('select public.notification_draw_calendar_fail($1)',[owner]),false);
  assert.equal(await eligible('2026-09-13'),false);
});
test('daily sync does not become source polling every five minutes',async()=>{
  await sync(); at('2026-09-13T02:00:00Z'); assert.equal(await acquire(),false);
  at('2026-09-14T00:00:00Z'); assert.equal(await acquire(),true);
});
test('an enabled reminder refreshes the source beforehand and avoids duplicate refreshes',async()=>{
  await sync(); at('2026-09-13T11:30:00Z'); assert.equal(await acquire(),false);
  at('2026-09-13T11:43:00Z'); await sync();
  at('2026-09-13T11:48:00Z'); assert.equal(await acquire(),false);
});
test('disabled members and disabled reminders do not add pre-reminder source polling',async()=>{
  await sync(); await db.exec("update public.members set status='inactive'");
  at('2026-09-13T11:43:00Z'); assert.equal(await acquire(),false);
  await db.exec("update public.members set status='active'; update public.notification_settings set settings=jsonb_set(settings,'{settings,bet}','false')");
  assert.equal(await acquire(),false);
});
test('a midnight reminder triggers a refresh on the previous Taipei date',async()=>{
  await sync(); await db.exec("update public.notification_settings set settings=jsonb_set(settings,'{betTimes,六合彩}','[\"00:00\"]')");
  at('2026-09-13T15:43:00Z'); assert.equal(await acquire(),true);
});
test('a missing next month is not treated as the normal weekday calendar',async()=>{
  at('2026-09-30T00:00:00Z'); await sync();
  assert.equal(await eligible('2026-10-01'),false);
});
for(const [name,days] of [
  ['missing day',official().slice(1)],
  ['duplicate day',[...official().slice(0,-1),official()[0]]],
  ['string boolean',official().map((d,i)=>i?d:{...d,isDrawDay:'true'})],
  ['empty calendar',calendar([])],
  ['wrong month',official().map(d=>({...d,date:d.date.replace('-09-','-08-')}))],
]) test(`invalid ${name} cannot publish a partial month`,async()=>{
  assert.equal(await acquire(),true); await db.exec('savepoint invalid_payload');
  await assert.rejects(complete(days)); await db.exec('rollback to savepoint invalid_payload');
  assert.equal(await scalar('select count(*)::int from private.notification_draw_day_overrides'),0);
});
test('explicit manual date exceptions survive automatic replacement',async()=>{
  await db.exec("insert into private.notification_draw_day_overrides(lottery,draw_date,is_draw_day,reason,source_url) values ('六合彩','2026-09-15',false,'confirmed cancellation','https://bet.hkjc.com/ch/marksix/fixtures')");
  await sync(); assert.equal(await eligible('2026-09-15'),false);
});
test('source errors never disable the other lotteries',async()=>{
  assert.equal(await acquire(),true); await scalar('select public.notification_draw_calendar_fail($1)',[owner]);
  assert.equal(await scalar("select private.notification_is_draw_day('今彩539','2026-09-14')"),true);
  assert.equal(await scalar("select private.notification_is_draw_day('大樂透','2026-09-15')"),true);
});
test('the existing generator and native recipient guard both obey the official Sunday',async()=>{
  await sync(calendar([13])); at('2026-09-13T12:00:00Z');
  await db.query('select private.notification_time_events_tick($1)',['2026-09-13T12:00:00Z']);
  assert.equal(await scalar("select count(*)::int from public.notification_events where event_type='bet_reminder' and payload->>'lottery'='六合彩'"),1);
  const data=JSON.stringify({memberId:member,lottery:'六合彩',scheduledAt:'2026-09-13T20:00:00+08:00'});
  assert.equal(await scalar("select private.notification_member_matches($1,'bet_reminder',$2)",[member,data]),true);
});
test('an unlisted Thursday produces no reminder even at the configured minute',async()=>{
  at('2026-09-24T00:00:00Z'); await sync(); at('2026-09-24T12:00:00Z');
  await db.query('select private.notification_time_events_tick($1)',['2026-09-24T12:00:00Z']);
  assert.equal(await scalar("select count(*)::int from public.notification_events where event_type='bet_reminder' and payload->>'lottery'='六合彩'"),0);
});
test('calendar private state and write RPCs are unavailable to PWA roles',async()=>{
  for(const role of ['anon','authenticated']) {
    assert.equal(await scalar("select has_table_privilege($1,'private.notification_draw_calendar_sync','SELECT')",[role]),false);
    for(const signature of ['public.notification_draw_calendar_status()','public.notification_draw_calendar_acquire(uuid)','public.notification_draw_calendar_complete(uuid,jsonb,timestamptz)','public.notification_draw_calendar_fail(uuid)'])
      assert.equal(await scalar('select has_function_privilege($1,$2,\'EXECUTE\')',[role,signature]),false);
  }
  assert.equal(await scalar("select has_table_privilege('service_role','private.notification_draw_calendar_sync','SELECT')"),false);
});

test('the admin shows pending at month rollover when the next month is unpublished',async()=>{
  at('2026-09-30T12:00:00Z'); await sync(); at('2026-09-30T16:00:00Z');
  const value=await health();
  assert.equal(value.status,'待確認');
  assert.equal(value.message,'官方日期待確認，六合彩選號提醒暫停。');
});

test('a worker lost during pre-reminder refresh cannot leave an old calendar enabled',async()=>{
  await sync(); at('2026-09-13T11:43:00Z'); assert.equal(await acquire(),true);
  assert.equal(await eligible('2026-09-15'),false);
  at('2026-09-13T11:49:00Z'); assert.equal(await acquire(other),true);
  assert.equal(await complete(official(),other),true);
  assert.equal(await eligible('2026-09-15'),true);
});
