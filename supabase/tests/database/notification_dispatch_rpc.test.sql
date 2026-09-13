begin;

select plan(35);

select has_function(
  'public',
  'notification_dispatch_claim',
  array['integer','timestamp with time zone'],
  'dispatcher claim rpc exists'
);
select has_function(
  'public',
  'notification_dispatch_mark_sent',
  array['uuid','timestamp with time zone'],
  'dispatcher sent finalizer exists'
);
select has_function(
  'public',
  'notification_dispatch_mark_skipped',
  array['uuid','text','timestamp with time zone'],
  'dispatcher skipped finalizer exists'
);
select has_function(
  'public',
  'notification_dispatch_mark_retry',
  array['uuid','text','timestamp with time zone'],
  'dispatcher retry finalizer exists'
);
select has_function(
  'public',
  'notification_dispatch_mark_failed',
  array['uuid','text','timestamp with time zone'],
  'dispatcher failed finalizer exists'
);

set local role anon;
select throws_ok(
  $$select * from public.notification_dispatch_claim(1, now())$$,
  '42501', null, 'anon cannot claim notification outbox work'
);
select throws_ok(
  $$select public.notification_dispatch_mark_sent('00000000-0000-0000-0000-000000000001'::uuid, now())$$,
  '42501', null, 'anon cannot mark notification outbox sent'
);
select throws_ok(
  $$select public.notification_dispatch_mark_skipped('00000000-0000-0000-0000-000000000001'::uuid, 'reason', now())$$,
  '42501', null, 'anon cannot mark notification outbox skipped'
);
select throws_ok(
  $$select public.notification_dispatch_mark_retry('00000000-0000-0000-0000-000000000001'::uuid, 'error', now())$$,
  '42501', null, 'anon cannot retry notification outbox work'
);
select throws_ok(
  $$select public.notification_dispatch_mark_failed('00000000-0000-0000-0000-000000000001'::uuid, 'error', now())$$,
  '42501', null, 'anon cannot mark notification outbox failed'
);
reset role;

set local role authenticated;
select throws_ok(
  $$select * from public.notification_dispatch_claim(1, now())$$,
  '42501', null, 'authenticated cannot claim notification outbox work'
);
select throws_ok(
  $$select public.notification_dispatch_mark_sent('00000000-0000-0000-0000-000000000001'::uuid, now())$$,
  '42501', null, 'authenticated cannot mark notification outbox sent'
);
select throws_ok(
  $$select public.notification_dispatch_mark_skipped('00000000-0000-0000-0000-000000000001'::uuid, 'reason', now())$$,
  '42501', null, 'authenticated cannot mark notification outbox skipped'
);
select throws_ok(
  $$select public.notification_dispatch_mark_retry('00000000-0000-0000-0000-000000000001'::uuid, 'error', now())$$,
  '42501', null, 'authenticated cannot retry notification outbox work'
);
select throws_ok(
  $$select public.notification_dispatch_mark_failed('00000000-0000-0000-0000-000000000001'::uuid, 'error', now())$$,
  '42501', null, 'authenticated cannot mark notification outbox failed'
);
reset role;

insert into auth.users (id) values
  ('51000000-0000-0000-0000-000000000001'),
  ('51000000-0000-0000-0000-000000000002'),
  ('51000000-0000-0000-0000-000000000003'),
  ('51000000-0000-0000-0000-000000000004')
on conflict (id) do nothing;

insert into public.members (id, auth_user_id, status) values
  ('52000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'active'),
  ('52000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000002', 'active'),
  ('52000000-0000-0000-0000-000000000003', '51000000-0000-0000-0000-000000000003', 'active'),
  ('52000000-0000-0000-0000-000000000004', '51000000-0000-0000-0000-000000000004', 'active');

insert into public.notification_events (
  id, event_key, event_type, source, payload, occurred_at, fanout_status
) values
  ('53000000-0000-0000-0000-000000000001', 'lottery_result:539:rpc-a', 'lottery_result', 'railway', '{}', '2026-09-03T11:40:00+08:00', 'complete'),
  ('53000000-0000-0000-0000-000000000002', 'lottery_result:539:rpc-b', 'lottery_result', 'railway', '{}', '2026-09-03T11:41:00+08:00', 'complete'),
  ('53000000-0000-0000-0000-000000000003', 'lottery_result:539:rpc-c', 'lottery_result', 'railway', '{}', '2026-09-03T11:42:00+08:00', 'complete'),
  ('53000000-0000-0000-0000-000000000004', 'lottery_result:539:rpc-d', 'lottery_result', 'railway', '{}', '2026-09-03T11:43:00+08:00', 'complete');

insert into public.notification_outbox (
  id, event_id, member_id, notification_payload, status, attempt_count,
  next_attempt_at, processing_started_at, created_at, updated_at
) values
  ('54000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', '{"title":"A","body":"A","url":"/"}', 'pending', 0, null, null, '2026-09-03T11:40:00+08:00', '2026-09-03T11:40:00+08:00'),
  ('54000000-0000-0000-0000-000000000002', '53000000-0000-0000-0000-000000000002', '52000000-0000-0000-0000-000000000002', '{"title":"B","body":"B","url":"/"}', 'pending', 0, null, null, '2026-09-03T11:41:00+08:00', '2026-09-03T11:41:00+08:00'),
  ('54000000-0000-0000-0000-000000000003', '53000000-0000-0000-0000-000000000003', '52000000-0000-0000-0000-000000000003', '{"title":"C","body":"C","url":"/"}', 'processing', 1, null, '2026-09-03T11:54:00+08:00', '2026-09-03T11:42:00+08:00', '2026-09-03T11:54:00+08:00');

set local role service_role;
select is(
  (select pg_catalog.jsonb_build_object(
      'outboxId', claim."outboxId",
      'memberId', claim."memberId",
      'userId', claim."userId",
      'eventId', claim."eventId",
      'eventKey', claim."eventKey",
      'payload', claim.payload,
      'attemptCount', claim."attemptCount"
    )
   from public.notification_dispatch_claim(1, '2026-09-03T12:00:00+08:00'::timestamptz) as claim),
  pg_catalog.jsonb_build_object(
    'outboxId', '54000000-0000-0000-0000-000000000001'::uuid,
    'memberId', '52000000-0000-0000-0000-000000000001'::uuid,
    'userId', '51000000-0000-0000-0000-000000000001'::uuid,
    'eventId', '53000000-0000-0000-0000-000000000001'::uuid,
    'eventKey', 'lottery_result:539:rpc-a',
    'payload', '{"title":"A","body":"A","url":"/"}'::jsonb,
    'attemptCount', 1
  ),
  'first dispatcher claim returns the full trusted work item'
);
select is(
  (select status from public.notification_outbox where id = '54000000-0000-0000-0000-000000000001'),
  'processing',
  'first claimed row becomes processing'
);
select is(
  (select "outboxId" from public.notification_dispatch_claim(1, '2026-09-03T12:00:00+08:00'::timestamptz)),
  '54000000-0000-0000-0000-000000000002'::uuid,
  'second dispatcher claim does not return the already processing row'
);
select is(
  (select status from public.notification_outbox where id = '54000000-0000-0000-0000-000000000002'),
  'processing',
  'second claimed row becomes processing'
);
select is(
  (select pg_catalog.jsonb_build_object(
      'outboxId', claim."outboxId",
      'attemptCount', claim."attemptCount"
    )
   from public.notification_dispatch_claim(1, '2026-09-03T12:00:00+08:00'::timestamptz) as claim),
  pg_catalog.jsonb_build_object(
    'outboxId', '54000000-0000-0000-0000-000000000003'::uuid,
    'attemptCount', 2
  ),
  'stale processing row is recovered and reclaimed with an incremented attempt'
);
select is(
  (select processing_started_at from public.notification_outbox where id = '54000000-0000-0000-0000-000000000003'),
  '2026-09-03T12:00:00+08:00'::timestamptz,
  'reclaimed stale row receives a fresh processing timestamp'
);

select is(
  public.notification_dispatch_mark_sent(
    '54000000-0000-0000-0000-000000000001'::uuid,
    '2026-09-03T12:01:00+08:00'::timestamptz
  ),
  true,
  'sent finalizer changes one processing row'
);
select is(
  public.notification_dispatch_mark_sent(
    '54000000-0000-0000-0000-000000000001'::uuid,
    '2026-09-03T12:02:00+08:00'::timestamptz
  ),
  true,
  'retry after a lost sent response acknowledges the same terminal result'
);
select is(
  (select pg_catalog.jsonb_build_object(
    'status', status,
    'processed', processed_at,
    'error', last_error,
    'started', processing_started_at
  ) from public.notification_outbox where id = '54000000-0000-0000-0000-000000000001'),
  pg_catalog.jsonb_build_object(
    'status', 'sent',
    'processed', '2026-09-03T12:01:00+08:00'::timestamptz,
    'error', null,
    'started', null
  ),
  'sent finalizer records terminal metadata'
);

select is(
  public.notification_dispatch_mark_skipped(
    '54000000-0000-0000-0000-000000000002'::uuid,
    'no_enabled_subscription',
    '2026-09-03T12:01:00+08:00'::timestamptz
  ),
  true,
  'skipped finalizer changes one processing row'
);
select is(
  public.notification_dispatch_mark_skipped(
    '54000000-0000-0000-0000-000000000002'::uuid,
    'repeat',
    '2026-09-03T12:02:00+08:00'::timestamptz
  ),
  false,
  'skipped terminal row cannot be finalized twice'
);
select is(
  (select pg_catalog.jsonb_build_object('status', status, 'error', last_error, 'processed', processed_at)
   from public.notification_outbox where id = '54000000-0000-0000-0000-000000000002'),
  pg_catalog.jsonb_build_object(
    'status', 'skipped',
    'error', 'no_enabled_subscription',
    'processed', '2026-09-03T12:01:00+08:00'::timestamptz
  ),
  'skipped finalizer records its terminal reason'
);

select is(
  public.notification_dispatch_mark_failed(
    '54000000-0000-0000-0000-000000000003'::uuid,
    'provider_failed',
    '2026-09-03T12:01:00+08:00'::timestamptz
  ),
  true,
  'failed finalizer changes one processing row'
);
select is(
  public.notification_dispatch_mark_failed(
    '54000000-0000-0000-0000-000000000003'::uuid,
    'repeat',
    '2026-09-03T12:02:00+08:00'::timestamptz
  ),
  false,
  'failed terminal row cannot be finalized twice'
);
select is(
  (select pg_catalog.jsonb_build_object('status', status, 'error', last_error, 'processed', processed_at)
   from public.notification_outbox where id = '54000000-0000-0000-0000-000000000003'),
  pg_catalog.jsonb_build_object(
    'status', 'failed',
    'error', 'provider_failed',
    'processed', '2026-09-03T12:01:00+08:00'::timestamptz
  ),
  'failed finalizer records terminal failure metadata'
);

insert into public.notification_outbox (
  id, event_id, member_id, notification_payload, status, attempt_count,
  processing_started_at, processed_at, created_at, updated_at
) values (
  '54000000-0000-0000-0000-000000000004',
  '53000000-0000-0000-0000-000000000004',
  '52000000-0000-0000-0000-000000000004',
  '{"title":"D","body":"D","url":"/"}',
  'processing',
  1,
  '2026-09-03T12:00:00+08:00',
  null,
  '2026-09-03T11:43:00+08:00',
  '2026-09-03T12:00:00+08:00'
);

select is(
  public.notification_dispatch_mark_retry(
    '54000000-0000-0000-0000-000000000004'::uuid,
    'temporary_provider_failure',
    '2026-09-03T12:30:00+08:00'::timestamptz
  ),
  true,
  'retry finalizer changes one processing row'
);
select is(
  (select pg_catalog.jsonb_build_object(
    'status', status,
    'error', last_error,
    'next', next_attempt_at,
    'processed', processed_at,
    'started', processing_started_at
  ) from public.notification_outbox where id = '54000000-0000-0000-0000-000000000004'),
  pg_catalog.jsonb_build_object(
    'status', 'pending',
    'error', 'temporary_provider_failure',
    'next', '2026-09-03T12:30:00+08:00'::timestamptz,
    'processed', null,
    'started', null
  ),
  'retry finalizer returns work to pending without marking it processed'
);
select is(
  (select pg_catalog.count(*) from public.notification_dispatch_claim(1, '2026-09-03T12:20:00+08:00'::timestamptz)),
  0::bigint,
  'retry work is not claimable before next_attempt_at'
);
select is(
  (select pg_catalog.jsonb_build_object(
      'outboxId', claim."outboxId",
      'attemptCount', claim."attemptCount"
    )
   from public.notification_dispatch_claim(1, '2026-09-03T12:30:00+08:00'::timestamptz) as claim),
  pg_catalog.jsonb_build_object(
    'outboxId', '54000000-0000-0000-0000-000000000004'::uuid,
    'attemptCount', 2
  ),
  'retry work becomes claimable at next_attempt_at and increments attempts'
);
select is(
  (select status from public.notification_outbox where id = '54000000-0000-0000-0000-000000000004'),
  'processing',
  'retry due claim returns work to processing'
);

reset role;
select * from finish();
rollback;
