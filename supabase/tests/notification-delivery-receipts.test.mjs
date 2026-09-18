import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, afterEach, before, beforeEach, mock, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pgtap } from '@electric-sql/pglite/pgtap';
import { createNotificationDispatchHandler } from '../functions/notification-dispatch/handler.ts';

// Run: node --experimental-transform-types --test supabase/tests/notification-delivery-receipts.test.mjs
const read = name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const db = new PGlite({ extensions: { pgtap } });
const userId = '73000000-0000-0000-0000-000000000001';
const otherUserId = '73000000-0000-0000-0000-000000000002';
const memberId = '73100000-0000-0000-0000-000000000001';
const subscriptionId = '73200000-0000-0000-0000-000000000001';
const instant = '2026-09-13T12:10:00.000Z';
const account = 'system:notification-dispatch';
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
let sequence = 0;

before(async () => {
  // Auth/member infrastructure is a local boundary fixture. Notification,
  // subscription, log and draw tables retain their production DDL/constraints.
  await db.exec(`
    create extension pgtap;
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private; create schema extensions;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function extensions.gen_random_uuid() returns uuid language sql as $$ select pg_catalog.gen_random_uuid() $$;
    create function extensions.digest(text,text) returns bytea language sql as $$ select pg_catalog.sha256(pg_catalog.convert_to($1,'UTF8')) $$;
    create table auth.users(id uuid primary key, email text);
    create table public.members(id uuid primary key,auth_user_id uuid,status text,plan_expires_at timestamptz,is_lifetime boolean default false);
  `);
  for (const file of [
    '20260824180000_matrix_fastapi_backend.sql',
    '20260823042016_create_member_notification_settings.sql',
    '20260830144700_mobile_push_notifications.sql',
    '20260830183000_mobile_push_notification_indexes.sql',
  ]) await db.exec(read(file));
  const defaults = read('20260829090000_member_pwa_rpc.sql')
    .match(/create or replace function private.default_member_notification_settings\(\)[\s\S]*?\$\$;/i);
  assert.ok(defaults, 'production notification defaults must be installed');
  await db.exec(defaults[0]);
  for (const file of [
    '20260904091705_notification_dispatch_schema.sql',
    '20260904091709_notification_dispatch_pipeline.sql',
    '20260904091714_notification_member_match_guard.sql',
    '20260904091719_notification_dispatch_rpc.sql',
    '20260904091723_notification_dispatch_time_events.sql',
    '20260904092249_notification_outbox_member_id_index.sql',
  ]) await db.exec(read(file));
  // Exclude only external HTTP/cron setup and the unrelated Storage bucket.
  const fast = read('20260905205428_notification_fast_results.sql');
  await db.exec(fast.split('create or replace function private.notification_pilio_http_tick')[0] + 'commit;');
  const publication = read('20260905122413_create_static_matrix_card_publication.sql');
  await db.exec(publication.split('CREATE FUNCTION public.claim_matrix_card_publication')[0]);
  for (const file of [
    '20260908022115_simplify_matrix_card_notification_body.sql',
    '20260912164917_two_stage_lottery_results.sql',
    '20260913133102_notification_reminder_draw_days.sql',
    '20260913153424_notification_marksix_official_calendar.sql',
    '20260913190020_notification_delivery_receipts.sql',
  ]) await db.exec(read(file));
});
after(async () => db.close());
beforeEach(async () => {
  mock.timers.enable({ apis: ['Date'], now: new Date(instant) });
  sequence = 0;
  await db.exec(`reset role;
    grant execute on function public.notification_dispatch_mark_sent(uuid,timestamptz) to service_role;
    truncate auth.users, public.members, public.notification_events cascade;`);
  await db.query('insert into auth.users(id,email) values ($1,$3),($2,$4)',
    [userId, otherUserId, 'receipt@example.test', 'other-receipt@example.test']);
  await db.query("insert into public.members(id,auth_user_id,status) values ($1,$2,'active')", [memberId, userId]);
  await db.query(`insert into public.member_push_subscriptions(id,user_id,endpoint,p256dh,auth_key)
    values ($1,$2,'https://fcm.googleapis.com/fcm/send/local-fixture','fixture-key','fixture-auth')`, [subscriptionId, userId]);
  await db.exec('set role service_role');
});
afterEach(async () => {
  await db.exec('reset role');
  mock.timers.reset();
});

async function owner(operation) {
  await db.exec('reset role');
  try { return await operation(); }
  finally { await db.exec('set role service_role'); }
}
async function work({ reminder, status = 'pending', attempts = 0, nextAttemptAt = null } = {}) {
  const key = `delivery-receipt-${++sequence}`;
  const type = reminder ? 'bet_reminder' : 'system_notice';
  const payload = reminder ?? { title: 'Fixture notice', body: 'Receipt regression', category: '維護' };
  return owner(async () => {
    const event = await scalar('select public.notification_event_enqueue_server($1,$2,\'cron\',$3,$4)',
      [key, type, instant, JSON.stringify(payload)]);
    let id;
    if (reminder) {
      // A legacy reminder may predate the current calendar guard. Preserve its
      // real event/renderer; delivery claim must recheck eligibility itself.
      id = await scalar(`insert into public.notification_outbox(event_id,member_id,notification_payload)
        values ($1,$2,private.notification_render_payload($3,$4,$5)) returning id`,
        [event.id, memberId, type, key, JSON.stringify(payload)]);
    } else {
      assert.equal(await scalar('select private.notification_fanout_event($1)', [event.id]), 1);
      id = await scalar('select id from public.notification_outbox where event_id=$1', [event.id]);
    }
    await db.query(`update public.notification_outbox
      set status=$2, attempt_count=$3, next_attempt_at=$4,
        processing_started_at=case when $2='processing' then $5::timestamptz end,
        created_at=$5::timestamptz - interval '1 minute' + $6::integer * interval '1 second'
      where id=$1`, [id, status, attempts, nextAttemptAt, instant, sequence]);
    return id;
  });
}
const claim = async (at = instant, limit = 25) =>
  (await db.query('select * from public.notification_dispatch_claim($1,$2)', [limit, at])).rows;
const markSent = (id, at = instant) => scalar('select public.notification_dispatch_mark_sent($1,$2)', [id, at]);
const state = async id => (await db.query(`select status,attempt_count,next_attempt_at,processing_started_at,
  processed_at,updated_at,last_error from public.notification_outbox where id=$1`, [id])).rows[0];
const iso = value => value == null ? null : new Date(value).toISOString();
async function receipt({ outboxId = null, user = userId, status = 'sent', adminAccount = account, sentAt = instant } = {}) {
  return scalar(`insert into public.push_delivery_logs
    (notification_outbox_id,user_id,subscription_id,title,body,status,failure_reason,admin_account,sent_at)
    values ($1,$2,$3,'Fixture notice','Receipt regression',$4,$5,$6,$7) returning id`,
    [outboxId, user, subscriptionId, status, status === 'failed' ? 'Provider rejected' : null, adminAccount, sentAt]);
}
async function deliveryLog(log) {
  await db.query(`insert into public.push_delivery_logs
    (notification_outbox_id,user_id,subscription_id,title,body,status,failure_reason,admin_account,sent_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [log.outboxId ?? null, log.userId, log.subscriptionId,
    log.title, log.body, log.status, log.failureReason, log.adminAccount, log.sentAt]);
}
function dispatcher({ now = () => new Date(instant), sendPush, finalize = markSent } = {}) {
  return createNotificationDispatchHandler({
    dispatchToken: 'local-fixture-token', now,
    claim: limit => claim(now().toISOString(), limit),
    listSubscriptions: async user => (await db.query(`select id,endpoint,p256dh,auth_key as "authKey"
      from public.member_push_subscriptions where user_id=$1 and enabled`, [user])).rows,
    sendPush,
    recordDelivery: deliveryLog,
    markSuccess: async (id, at) => { await db.query('update public.member_push_subscriptions set last_success_at=$2 where id=$1', [id, at]); },
    markFailure: async (id, at, disable) => { await db.query('update public.member_push_subscriptions set last_failure_at=$2,enabled=enabled and not $3 where id=$1', [id, at, disable]); },
    markSent: finalize,
    markSkipped: (id, reason, at) => scalar('select public.notification_dispatch_mark_skipped($1,$2,$3)', [id, reason, at]),
    markRetry: (id, error, at) => scalar('select public.notification_dispatch_mark_retry($1,$2,$3)', [id, error, at]),
    markFailed: (id, error, at) => scalar('select public.notification_dispatch_mark_failed($1,$2,$3)', [id, error, at]),
  });
}
const request = () => new Request('https://local.invalid/notification-dispatch', {
  method: 'POST', headers: { 'x-matrix-dispatch-token': 'local-fixture-token' },
});

test('mark_sent is idempotent after response loss and preserves the first completion timestamp', async () => {
  const id = await work();
  assert.equal((await claim())[0].outboxId, id);
  assert.equal(await markSent(id), true);
  const first = await state(id);
  assert.equal(await markSent(id, '2026-09-13T12:11:00Z'), true);
  assert.deepEqual(await state(id), first);
  assert.equal(first.status, 'sent');
  assert.equal(iso(first.processed_at), instant);
  assert.equal(first.attempt_count, 1);
  assert.deepEqual(await claim('2026-09-13T12:15:00Z'), []);
});

test('mark_sent does not accept pending, failed, skipped or nonexistent work', async () => {
  for (const status of ['pending', 'failed', 'skipped']) {
    const id = await work({ status });
    const before = await state(id);
    assert.equal(await markSent(id), false, status);
    assert.deepEqual(await state(id), before);
  }
  assert.equal(await markSent('73900000-0000-0000-0000-000000000099'), false);
});

test('provider acceptance plus three real SQL finalizer failures is reconciled without another send', async () => {
  const id = await work();
  const sends = [];
  const errors = [];
  let now = new Date(instant);
  const handler = dispatcher({
    now: () => now,
    sendPush: async (subscription, payload) => {
      sends.push({ subscription: subscription.id, payload });
      if (sends.length === 1) await owner(() => db.exec(
        'revoke execute on function public.notification_dispatch_mark_sent(uuid,timestamptz) from service_role'));
    },
    finalize: async (...args) => {
      try { return await markSent(...args); }
      catch (error) { errors.push(error.code); throw error; }
    },
  });
  assert.equal((await handler(request())).status, 500);
  assert.deepEqual(errors, ['42501', '42501', '42501']);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].payload.tag, `matrix-outbox-${id}`);
  assert.equal(await scalar(`select count(*)::integer from public.push_delivery_logs
    where notification_outbox_id=$1 and user_id=$2 and subscription_id=$3
      and status='sent' and admin_account=$4 and title='Fixture notice' and body='Receipt regression'
      and failure_reason is null and sent_at=$5`, [id, userId, subscriptionId, account, instant]), 1);
  assert.equal(iso(await scalar('select last_success_at from public.member_push_subscriptions where id=$1', [subscriptionId])), instant);
  const processing = await state(id);
  assert.equal(processing.status, 'processing');
  assert.equal(processing.attempt_count, 1);
  assert.deepEqual(await claim('2026-09-13T12:14:59.999Z'), []);
  assert.deepEqual(await state(id), processing);

  await owner(() => db.exec('grant execute on function public.notification_dispatch_mark_sent(uuid,timestamptz) to service_role'));
  now = new Date('2026-09-13T12:15:00Z');
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(sends.length, 1, 'an accepted outbox must not be sent to the provider twice');
  assert.deepEqual(await response.json(), { claimed: 0, sent: 0, skipped: 0, retried: 0, failed: 0 });
  const completed = await state(id);
  assert.equal(completed.status, 'sent');
  assert.equal(completed.attempt_count, 1);
  assert.equal(iso(completed.processed_at), instant);
  assert.equal(completed.processing_started_at, null);
  assert.equal(completed.last_error, null);
});

test('a lost successful mark_sent response retries only the database call', async () => {
  const id = await work();
  let sends = 0;
  let finalizations = 0;
  const handler = dispatcher({
    sendPush: async () => { sends++; },
    finalize: async (...args) => {
      const result = await markSent(...args);
      if (++finalizations === 1) throw new Error('Simulated response loss after committed SQL');
      return result;
    },
  });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { claimed: 1, sent: 1, skipped: 0, retried: 0, failed: 0 });
  assert.equal(sends, 1);
  assert.equal(finalizations, 2);
  assert.equal(iso((await state(id)).processed_at), instant);
  assert.equal(await scalar('select count(*)::integer from public.push_delivery_logs where notification_outbox_id=$1', [id]), 1);
});

for (const kind of ['absent', 'failed', 'unlinked', 'different user', 'different administrator']) {
  test(`${kind} receipt does not suppress retry after the five-minute lease`, async () => {
    const id = await work();
    assert.equal((await claim())[0].attemptCount, 1);
    if (kind !== 'absent') await receipt({
      outboxId: kind === 'unlinked' ? null : id,
      status: kind === 'failed' ? 'failed' : 'sent',
      user: kind === 'different user' ? otherUserId : userId,
      adminAccount: kind === 'different administrator' ? 'manual-admin' : account,
    });
    assert.deepEqual(await claim('2026-09-13T12:14:59.999Z'), []);
    const retry = await claim('2026-09-13T12:15:00Z');
    assert.equal(retry.length, 1);
    assert.equal(retry[0].outboxId, id);
    assert.equal(retry[0].attemptCount, 2);
    assert.equal((await state(id)).status, 'processing');
  });
}

test('a pending retry is reconciled only when its next-attempt deadline is due', async () => {
  const id = await work({ attempts: 1, nextAttemptAt: '2026-09-13T12:15:00Z' });
  await receipt({ outboxId: id });
  const pending = await state(id);
  assert.deepEqual(await claim('2026-09-13T12:14:59.999Z'), []);
  assert.deepEqual(await state(id), pending);
  assert.deepEqual(await claim('2026-09-13T12:15:00Z'), []);
  assert.equal((await state(id)).status, 'sent');
  assert.equal((await state(id)).attempt_count, 1);
  assert.equal((await state(id)).next_attempt_at, null);
});

test('multiple receipts reconcile once using the earliest valid acceptance and do not affect another outbox', async () => {
  const accepted = await work();
  const unsent = await work();
  assert.equal((await claim()).length, 2);
  await receipt({ outboxId: accepted, sentAt: '2026-09-13T12:10:02Z' });
  await receipt({ outboxId: accepted, sentAt: '2026-09-13T12:10:01Z' });
  await receipt({ outboxId: accepted, user: otherUserId });
  await db.query("update public.notification_outbox set last_error='Finalizer unavailable' where id=$1", [accepted]);
  const retry = await claim('2026-09-13T12:15:00Z');
  assert.deepEqual(retry.map(row => row.outboxId), [unsent]);
  assert.equal(retry[0].attemptCount, 2);
  const completed = await state(accepted);
  assert.equal(completed.status, 'sent');
  assert.equal(completed.attempt_count, 1);
  assert.equal(iso(completed.processed_at), '2026-09-13T12:10:01.000Z');
  assert.equal(completed.last_error, null);
});

test('receipt reconciliation remains inside the requested claim batch', async () => {
  for (let index = 0; index < 3; index++) await receipt({ outboxId: await work() });
  assert.deepEqual(await claim(instant, 1), []);
  assert.equal(await scalar("select count(*)::integer from public.notification_outbox where status='sent'"), 1);
  assert.equal(await scalar("select count(*)::integer from public.notification_outbox where status='pending'"), 2);
  assert.deepEqual(await claim(instant, 1), []);
  assert.equal(await scalar("select count(*)::integer from public.notification_outbox where status='sent'"), 2);
});

test('unsent reminders still honor the draw calendar and daily eligibility guard', async () => {
  const invalid = await work({ reminder: { memberId, lottery: '今彩539', scheduledAt: '2026-09-13T20:00:00+08:00' } });
  const valid = await work({ reminder: { memberId, lottery: '天天樂', scheduledAt: '2026-09-13T20:00:00+08:00' } });
  assert.deepEqual((await claim()).map(row => row.outboxId), [valid]);
  const skipped = await state(invalid);
  assert.equal(skipped.status, 'skipped');
  assert.equal(skipped.last_error, 'bet_reminder_not_eligible');
  assert.equal(skipped.attempt_count, 0);
});

test('an already accepted expired reminder records sent without becoming deliverable again', async () => {
  const id = await work({ reminder: { memberId, lottery: '天天樂', scheduledAt: '2026-09-12T20:00:00+08:00' }, attempts: 1 });
  await receipt({ outboxId: id, sentAt: '2026-09-12T12:00:00Z' });
  assert.deepEqual(await claim(), []);
  const completed = await state(id);
  assert.equal(completed.status, 'sent');
  assert.equal(completed.attempt_count, 1);
  assert.equal(iso(completed.processed_at), '2026-09-12T12:00:00.000Z');
});

for (const role of ['anon', 'authenticated']) test(`${role} cannot forge or update receipts or finalize work`, async () => {
  const id = await work();
  const logId = await receipt({ outboxId: id });
  await db.exec(`set role ${role}`);
  await assert.rejects(receipt({ outboxId: id }), { code: '42501' });
  await assert.rejects(db.query("update public.push_delivery_logs set status='sent' where id=$1", [logId]), { code: '42501' });
  await assert.rejects(markSent(id), { code: '42501' });
  await assert.rejects(claim(), { code: '42501' });
  await db.exec('set role service_role');
  assert.equal(await scalar('select count(*)::integer from public.push_delivery_logs'), 1);
  assert.equal((await state(id)).status, 'pending');
});

test('receipt foreign keys reject missing outboxes and preserve historical logs when an outbox is deleted', async () => {
  await assert.rejects(receipt({ outboxId: '73900000-0000-0000-0000-000000000099' }), { code: '23503' });
  const id = await work();
  const logId = await receipt({ outboxId: id });
  await db.query('delete from public.notification_outbox where id=$1', [id]);
  assert.equal(await scalar('select notification_outbox_id from public.push_delivery_logs where id=$1', [logId]), null);
  assert.equal(await scalar('select status from public.push_delivery_logs where id=$1', [logId]), 'sent');
  const unsent = await work();
  assert.deepEqual((await claim()).map(row => row.outboxId), [unsent]);
});

for (const [file, count] of [
  ['notification_dispatch.test.sql', 71],
  ['notification_dispatch_rpc.test.sql', 35],
]) test(`existing database/${file} passes after the receipt migration`, async context => {
  // These transaction-scoped pgTAP suites create their own members and events.
  await db.exec('reset role; truncate auth.users, public.members, public.notification_events cascade');
  const sql = readFileSync(new URL(`./database/${file}`, import.meta.url), 'utf8');
  let datasets;
  try { datasets = await db.exec(sql); }
  catch (error) { await db.exec('rollback; reset role'); throw error; }
  const values = datasets.flatMap(dataset => dataset.rows.flatMap(row => Object.values(row)))
    .filter(value => typeof value === 'string');
  const assertions = values.filter(value => /^(?:not )?ok \d+\b/.test(value));
  assert.deepEqual(assertions.filter(value => value.startsWith('not ok')), []);
  assert.ok(values.includes(`1..${count}`), 'the original pgTAP plan must remain intact');
  assert.equal(assertions.length, count);
  context.diagnostic(`${count} real pgTAP assertions passed`);
});
