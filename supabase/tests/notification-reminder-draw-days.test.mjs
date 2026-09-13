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
  const migration = read('../migrations/20260913130913_notification_reminder_draw_days.sql');
  if (migration.trim()) await db.exec(migration);
});
after(async () => db.close());
beforeEach(async () => {
  // PGlite's PostgreSQL clock reads Date.now: control that external clock,
  // without adding any test-only clock override to production SQL.
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-13T12:10:00Z') });
  await db.exec('begin');
  await db.query("insert into public.members(id,auth_user_id,status) values ($1,$1,'active')", [member]);
  await db.query('insert into public.notification_settings(member_id,settings) values ($1,private.default_member_notification_settings())', [member]);
  await setTimes('20:00');
});
afterEach(async () => {
  await db.exec('reset role; rollback');
  mock.timers.reset();
});

async function setTimes(time) {
  await db.query("update public.notification_settings set settings=jsonb_set(settings,'{betTimes}',$1::jsonb)",
    [JSON.stringify(Object.fromEntries(lotteries.map(lottery => [lottery, [time, '']])))]);
}
async function generatedAt(instant) {
  mock.timers.setTime(Date.parse(instant));
  await db.query('select private.notification_time_events_tick($1)', [instant]);
  return (await db.query("select payload->>'lottery' as lottery from public.notification_events where event_type='bet_reminder'")).rows.map(r => r.lottery).sort();
}
const payload = (lottery, scheduledAt) => ({ memberId: member, lottery, scheduledAt });
async function matches(value, instant = '2026-09-13T12:10:00Z') {
  mock.timers.setTime(Date.parse(instant));
  return scalar("select private.notification_member_matches($1,'bet_reminder',$2)", [member, JSON.stringify(value)]);
}

for (const [date, expected] of [
  ['2026-09-07', ['今彩539', '天天樂']],
  ['2026-09-08', lotteries],
  ['2026-09-09', ['今彩539', '天天樂']],
  ['2026-09-10', ['今彩539', '天天樂', '六合彩']],
  ['2026-09-11', ['今彩539', '天天樂', '大樂透']],
  ['2026-09-12', ['今彩539', '天天樂', '六合彩']],
  ['2026-09-13', ['天天樂']],
]) test(`only lotteries drawing on ${date} receive reminders`, async () => {
  assert.deepEqual(await generatedAt(`${date}T20:00:00+08:00`), [...expected].sort());
});

test('Sunday 539 reminder cannot pass the shared fanout/native recipient guard', async () => {
  assert.equal(await matches(payload('今彩539', '2026-09-13T20:00:00+08:00')), false);
});
test('a normal 539 draw day still passes the recipient guard', async () => {
  assert.equal(await matches(payload('今彩539', '2026-09-14T20:00:00+08:00'), '2026-09-14T12:01:00Z'), true);
});
test('matching reminder minute remains idempotent', async () => {
  await generatedAt('2026-09-08T20:00:15+08:00');
  assert.deepEqual(await generatedAt('2026-09-08T20:00:45+08:00'), [...lotteries].sort());
});
test('time comparison uses Taipei across a UTC date boundary', async () => {
  await setTimes('00:00');
  assert.deepEqual(await generatedAt('2026-09-13T16:00:00Z'), ['今彩539', '天天樂'].sort());
});
test('an unmatched minute does not create a reminder', async () => {
  assert.deepEqual(await generatedAt('2026-09-08T20:01:00+08:00'), []);
});
test('disabled reminder and inactive member still receive no reminders', async () => {
  await db.exec("update public.notification_settings set settings=jsonb_set(settings,'{settings,bet}','false')");
  assert.deepEqual(await generatedAt('2026-09-08T20:00:00+08:00'), []);
  await db.exec("update public.notification_settings set settings=jsonb_set(settings,'{settings,bet}','true'); update public.members set status='inactive'");
  assert.deepEqual(await generatedAt('2026-09-08T20:00:00+08:00'), []);
});

async function override(lottery, date, enabled) {
  await db.query(`insert into private.notification_draw_day_overrides(lottery,draw_date,is_draw_day,reason,source_url)
    values ($1,$2,$3,'Test fixture: special draw or cancellation','https://example.invalid/official-notice')`, [lottery, date, enabled]);
}
async function queuedReminder({ lottery = '今彩539', scheduledAt = '2026-09-13T20:00:00+08:00', status = 'pending', index = 0 } = {}) {
  // Represents a row queued by the previous production version. Keep the real
  // event validation and renderer; bypass only fanout's newly added date guard.
  const value = payload(lottery, scheduledAt);
  const event = await scalar("select public.notification_event_enqueue_server($1,'bet_reminder','cron',$2,$3)",
    [`legacy-reminder-${index}`, scheduledAt, JSON.stringify(value)]);
  const outbox = await scalar(`insert into public.notification_outbox(event_id,member_id,notification_payload,status,created_at,processing_started_at)
    values ($1,$2,private.notification_render_payload('bet_reminder',$3,$4),$5,
      '2026-09-13T12:00:00Z'::timestamptz + $6::integer * interval '1 second', '2026-09-13T12:00:00Z') returning id`,
    [event.id, member, `legacy-reminder-${index}`, JSON.stringify(value), status, index]);
  return { event: event.id, outbox };
}
async function claim(limit = 25) {
  return (await db.query("select * from public.notification_dispatch_claim($1,'2026-09-13T12:10:00Z')", [limit])).rows;
}

test('an officially added Sunday draw allows generation and recipient matching', async () => {
  await override('今彩539', '2026-09-13', true);
  assert.deepEqual(await generatedAt('2026-09-13T20:00:00+08:00'), ['今彩539', '天天樂'].sort());
  assert.equal(await matches(payload('今彩539', '2026-09-13T20:00:00+08:00')), true);
});
test('a canceled normal draw day blocks generation and recipient matching', async () => {
  await override('今彩539', '2026-09-14', false);
  assert.deepEqual(await generatedAt('2026-09-14T20:00:00+08:00'), ['天天樂']);
  assert.equal(await matches(payload('今彩539', '2026-09-14T20:00:00+08:00'), '2026-09-14T12:01:00Z'), false);
});
test('Mark Six moved from Saturday to Sunday does not send on both days', async () => {
  await override('六合彩', '2026-09-12', false);
  await override('六合彩', '2026-09-13', true);
  assert.deepEqual(await generatedAt('2026-09-12T20:00:00+08:00'), ['今彩539', '天天樂'].sort());
  assert.equal(await matches(payload('六合彩', '2026-09-12T20:00:00+08:00'), '2026-09-12T12:01:00Z'), false);
  assert.equal(await matches(payload('六合彩', '2026-09-13T20:00:00+08:00')), true);
  assert.equal(await scalar("select private.notification_is_draw_day('六合彩','2026-09-15')"), true);
});
for (const [name, value] of [
  ['unknown lottery', payload('unknown', '2026-09-14T20:00:00+08:00')],
  ['missing date', payload('今彩539', null)],
  ['invalid date', payload('今彩539', '2026-02-30T20:00:00+08:00')],
  ['missing timezone', payload('今彩539', '2026-09-14T20:00:00')],
  ['infinite date', payload('今彩539', 'infinity')],
  ['wrong member', { ...payload('今彩539', '2026-09-14T20:00:00+08:00'), memberId: 'another-member' }],
]) test(`${name} fails closed without aborting the pipeline`, async () => {
  assert.equal(await matches(value, '2026-09-14T12:01:00Z'), false);
});
test('recipient guard converts a UTC timestamp to the Taipei calendar day', async () => {
  assert.equal(await matches(payload('今彩539', '2026-09-13T16:00:00Z'), '2026-09-13T16:01:00Z'), true);
  assert.equal(await matches(payload('今彩539', '2026-09-13T15:59:59Z'), '2026-09-13T15:59:59Z'), false);
});
test('invalid private calendar inputs fail closed', async () => {
  for (const args of [[null, '2026-09-14'], ['今彩539', null], ['今彩539', 'infinity']]) {
    assert.equal(await scalar('select private.notification_is_draw_day($1,$2)', args), false);
  }
});
test('a previously queued Sunday reminder is skipped before web delivery', async () => {
  const { outbox } = await queuedReminder();
  assert.deepEqual(await claim(), []);
  assert.deepEqual((await db.query('select status,last_error,attempt_count from public.notification_outbox where id=$1', [outbox])).rows,
    [{ status: 'skipped', last_error: 'bet_reminder_not_eligible', attempt_count: 0 }]);
  assert.equal(Number(await scalar('select count(*) from public.notification_events')), 1);
});
test('retry recovery cannot revive an invalid Sunday reminder', async () => {
  const { outbox } = await queuedReminder({ status: 'processing' });
  assert.deepEqual(await claim(), []);
  assert.equal(await scalar('select status from public.notification_outbox where id=$1', [outbox]), 'skipped');
});
test('a valid daily reminder is claimed once and can be marked sent', async () => {
  const { outbox } = await queuedReminder({ lottery: '天天樂' });
  const work = await claim();
  assert.equal(work.length, 1);
  assert.equal(work[0].outboxId, outbox);
  assert.equal(work[0].attemptCount, 1);
  assert.equal(await scalar("select public.notification_dispatch_mark_sent($1,'2026-09-13T12:10:00Z')", [outbox]), true);
  assert.deepEqual(await claim(), []);
});
test('a late cancellation is rechecked for an already queued reminder', async () => {
  await queuedReminder({ lottery: '天天樂' });
  await override('天天樂', '2026-09-13', false);
  assert.deepEqual(await claim(), []);
});
test('invalid reminders are retired within the existing claim batch limit', async () => {
  for (let index = 0; index < 12; index++) await queuedReminder({ index });
  assert.deepEqual(await claim(5), []);
  assert.equal(Number(await scalar("select count(*) from public.notification_outbox where status='skipped'")), 5);
  assert.equal(Number(await scalar("select count(*) from public.notification_outbox where status='pending'")), 7);
  assert.equal(Number(await scalar('select count(*) from public.notification_events')), 12);
});
test('fanout of a legacy non-draw-day event creates no web or native source outbox', async () => {
  const event = await scalar("select public.notification_event_enqueue_server('legacy-fanout','bet_reminder','cron','2026-09-13T12:00:00Z',$1)",
    [JSON.stringify(payload('今彩539', '2026-09-13T20:00:00+08:00'))]);
  assert.equal(await scalar('select private.notification_fanout_event($1)', [event.id]), 0);
  assert.equal(Number(await scalar('select count(*) from public.notification_outbox')), 0);
  assert.equal(await scalar('select fanout_status from public.notification_events where id=$1', [event.id]), 'complete');
});
test('Sunday result, card, status and expiry notifications retain their own rules', async () => {
  const events = [
    ['lottery_result', { lottery: '今彩539', drawDate: '2026-09-12', numbers: ['01','02','03','04','05'] }],
    ['matrix_card', { lottery: '今彩539', drawDate: '2026-09-12' }],
    ['matrix_status', { lottery: '今彩539', drawDate: '2026-09-12', statusLabel: '啟動' }],
    ['membership_expiry', { memberId: member, expiryDate: '2026-09-20', daysBefore: 7 }],
  ];
  for (const [type, value] of events) {
    const event = await scalar("select public.notification_event_enqueue_server($1,$2,'cron','2026-09-13T12:00:00Z',$3)",
      [`unchanged-${type}`, type, JSON.stringify(value)]);
    assert.equal(await scalar('select private.notification_fanout_event($1)', [event.id]), 1);
  }
  assert.equal((await claim()).length, 4);
});
test('expiry reminder generation still works on a Sunday', async () => {
  await db.exec("update public.members set plan_expires_at='2026-09-20T00:00:00+08:00'");
  await generatedAt('2026-09-13T20:00:00+08:00');
  assert.equal(Number(await scalar("select count(*) from public.notification_events where event_type='membership_expiry'")), 1);
});
test('private calendar cannot be read or changed through member or service Data API roles', async () => {
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal(await scalar("select has_table_privilege($1,'private.notification_draw_day_overrides','SELECT,INSERT,UPDATE,DELETE')", [role]), false);
    assert.equal(await scalar("select has_function_privilege($1,'private.notification_is_draw_day(text,date)','EXECUTE')", [role]), false);
  }
  for (const role of ['anon', 'authenticated']) {
    assert.equal(await scalar("select has_function_privilege($1,'public.notification_dispatch_claim(integer,timestamptz)','EXECUTE')", [role]), false);
  }
  assert.equal(await scalar("select has_function_privilege('service_role','public.notification_dispatch_claim(integer,timestamptz)','EXECUTE')"), true);
  assert.equal(await scalar("select relrowsecurity from pg_class where oid='private.notification_draw_day_overrides'::regclass"), true);
});

for (const status of ['pending', 'processing']) test(`a Saturday reminder recovered Sunday (${status}) is skipped`, async () => {
  const { outbox } = await queuedReminder({ scheduledAt: '2026-09-12T23:59:00+08:00', status });
  assert.deepEqual(await claim(), []);
  assert.equal(await scalar('select status from public.notification_outbox where id=$1', [outbox]), 'skipped');
});
test('shared native recipient guard rejects a previous-day reminder', async () => {
  assert.equal(await matches(payload('今彩539', '2026-09-12T23:59:00+08:00')), false);
  assert.equal(await matches(payload('天天樂', '2026-09-12T20:00:00+08:00')), false);
});
test('a future reminder is not eligible before its scheduled instant', async () => {
  assert.equal(await matches(payload('天天樂', '2026-09-13T20:25:00+08:00')), false);
});
