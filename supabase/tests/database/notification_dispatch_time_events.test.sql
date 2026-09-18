begin;

select plan(21);

select has_function(
  'private',
  'notification_time_events_tick',
  array['timestamp with time zone'],
  'time event tick exists'
);
select has_function(
  'private',
  'notification_pipeline_tick',
  array['timestamp with time zone'],
  'notification pipeline tick exists'
);

insert into auth.users (id) values
  ('61000000-0000-0000-0000-000000000001'),
  ('61000000-0000-0000-0000-000000000002'),
  ('61000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

insert into public.members (
  id, auth_user_id, plan_expires_at, is_lifetime, status
) values
  (
    '62000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000001',
    '2026-09-10T00:00:00+08:00',
    false,
    'active'
  ),
  (
    '62000000-0000-0000-0000-000000000002',
    '61000000-0000-0000-0000-000000000002',
    '2026-09-10T00:00:00+08:00',
    false,
    'active'
  ),
  (
    '62000000-0000-0000-0000-000000000003',
    '61000000-0000-0000-0000-000000000003',
    '2026-09-10T00:00:00+08:00',
    false,
    'inactive'
  );

insert into public.notification_settings (member_id, settings) values
  (
    '62000000-0000-0000-0000-000000000001',
    '{
      "settings":{"bet":true,"expiry":true},
      "selectedOptions":{"expiry":["提前7日"]},
      "betTimes":{"今彩539":["16:00",""]}
    }'::jsonb
  ),
  (
    '62000000-0000-0000-0000-000000000002',
    '{
      "settings":{"bet":"not-a-boolean","expiry":"broken"},
      "selectedOptions":{"expiry":"not-an-array"},
      "betTimes":{"今彩539":"not-an-array"}
    }'::jsonb
  ),
  (
    '62000000-0000-0000-0000-000000000003',
    '{
      "settings":{"bet":true,"expiry":true},
      "selectedOptions":{"expiry":["提前7日"]},
      "betTimes":{"今彩539":["16:00",""]}
    }'::jsonb
  );

select lives_ok(
  $$select private.notification_time_events_tick('2026-09-03T16:00:15+08:00'::timestamptz)$$,
  'time tick accepts the matching Taipei reminder minute'
);
select lives_ok(
  $$select private.notification_time_events_tick('2026-09-03T16:00:45+08:00'::timestamptz)$$,
  'repeated tick in the same minute is idempotent'
);

select is(
  (
    select count(*)
    from public.notification_events
    where event_type = 'bet_reminder'
      and payload->>'memberId' = '62000000-0000-0000-0000-000000000001'
      and payload->>'lotteryCode' = '539'
  ),
  1::bigint,
  'matching bet reminder is enqueued exactly once'
);
select is(
  (
    select event_key
    from public.notification_events
    where event_type = 'bet_reminder'
      and payload->>'memberId' = '62000000-0000-0000-0000-000000000001'
  ),
  'bet_reminder:62000000-0000-0000-0000-000000000001:539:2026-09-03T16:00:00+08:00',
  'bet reminder uses a deterministic Taipei scheduled minute key'
);
select is(
  (
    select payload->>'scheduledAt'
    from public.notification_events
    where event_type = 'bet_reminder'
      and payload->>'memberId' = '62000000-0000-0000-0000-000000000001'
  ),
  '2026-09-03T16:00:00+08:00',
  'bet reminder payload preserves the scheduled Taipei minute'
);
select is(
  (
    select count(*)
    from public.notification_events
    where event_type = 'bet_reminder'
      and payload->>'memberId' = '62000000-0000-0000-0000-000000000002'
  ),
  0::bigint,
  'malformed member settings are ignored for bet reminders'
);
select is(
  (
    select count(*)
    from public.notification_events
    where event_type = 'bet_reminder'
      and payload->>'memberId' = '62000000-0000-0000-0000-000000000003'
  ),
  0::bigint,
  'inactive member receives no bet reminder event'
);

select lives_ok(
  $$select private.notification_time_events_tick('2026-09-03T18:30:00+08:00'::timestamptz)$$,
  'time tick creates expiry events later on the same Taipei date'
);
select lives_ok(
  $$select private.notification_time_events_tick('2026-09-03T23:59:59+08:00'::timestamptz)$$,
  'repeated expiry tick on the same date is idempotent'
);

select is(
  (
    select count(*)
    from public.notification_events
    where event_type = 'membership_expiry'
      and payload->>'memberId' = '62000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'selected seven-day expiry reminder is enqueued exactly once'
);
select is(
  (
    select event_key
    from public.notification_events
    where event_type = 'membership_expiry'
      and payload->>'memberId' = '62000000-0000-0000-0000-000000000001'
  ),
  'membership_expiry:62000000-0000-0000-0000-000000000001:2026-09-10:7',
  'expiry reminder uses member, Taipei expiry date, and lead-day key'
);
select is(
  (
    select payload->>'expiryDate'
    from public.notification_events
    where event_type = 'membership_expiry'
      and payload->>'memberId' = '62000000-0000-0000-0000-000000000001'
  ),
  '2026-09-10',
  'expiry reminder payload uses Taipei local expiry date'
);
select is(
  (
    select payload->>'daysBefore'
    from public.notification_events
    where event_type = 'membership_expiry'
      and payload->>'memberId' = '62000000-0000-0000-0000-000000000001'
  ),
  '7',
  'expiry reminder payload records the lead days'
);
select is(
  (
    select count(*)
    from public.notification_events
    where event_type = 'membership_expiry'
      and payload->>'memberId' = '62000000-0000-0000-0000-000000000002'
  ),
  0::bigint,
  'malformed member settings are ignored for expiry reminders'
);
select is(
  (
    select count(*)
    from public.notification_events
    where event_type = 'membership_expiry'
      and payload->>'memberId' = '62000000-0000-0000-0000-000000000003'
  ),
  0::bigint,
  'inactive member receives no expiry reminder event'
);

update public.members
set is_lifetime = true
where id = '62000000-0000-0000-0000-000000000001';

update public.notification_events
set event_key = event_key || ':existing'
where event_type = 'membership_expiry'
  and payload->>'memberId' = '62000000-0000-0000-0000-000000000001';

select lives_ok(
  $$select private.notification_time_events_tick('2026-09-03T20:00:00+08:00'::timestamptz)$$,
  'lifetime member is safely excluded from expiry generation'
);
select is(
  (
    select count(*)
    from public.notification_events
    where event_type = 'membership_expiry'
      and event_key = 'membership_expiry:62000000-0000-0000-0000-000000000001:2026-09-10:7'
  ),
  0::bigint,
  'lifetime member does not regenerate the removed canonical expiry event'
);

select lives_ok(
  $$select private.notification_pipeline_tick('2026-09-03T20:01:00+08:00'::timestamptz)$$,
  'pipeline tick composes time events and fanout without network access'
);
select is(
  (
    select jsonb_typeof(private.notification_pipeline_tick('2026-09-03T20:02:00+08:00'::timestamptz))
  ),
  'object',
  'pipeline tick returns a structured JSON result'
);

select * from finish();
rollback;
