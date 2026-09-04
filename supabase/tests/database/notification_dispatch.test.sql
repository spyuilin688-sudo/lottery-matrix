begin;

select plan(71);

select has_table('public', 'notification_events', 'notification_events table exists');
select has_table('public', 'notification_outbox', 'notification_outbox table exists');
select has_function(
  'private',
  'notification_event_enqueue',
  array['text','text','text','timestamp with time zone','jsonb']
);
select has_function(
  'public',
  'notification_event_enqueue_server',
  array['text','text','text','timestamp with time zone','jsonb']
);

select col_is_pk('public', 'notification_events', 'id', 'notification_events.id is the primary key');
select col_is_pk('public', 'notification_outbox', 'id', 'notification_outbox.id is the primary key');
select has_index(
  'public',
  'notification_events',
  'notification_events_event_key_key',
  'notification_events event key unique index exists'
);
select has_index(
  'public',
  'notification_outbox',
  'notification_outbox_event_id_member_id_channel_key',
  'notification_outbox member event channel unique index exists'
);
select has_index(
  'public',
  'notification_outbox',
  'notification_outbox_member_id_idx',
  'notification_outbox member foreign key index exists'
);

set local role anon;
select throws_ok(
  $$insert into public.notification_events(event_key,event_type,source,payload,occurred_at)
    values ('forged','lottery_result','railway','{}',now())$$,
  '42501',
  null,
  'anon cannot forge notification events'
);
select throws_ok(
  $$select private.notification_event_enqueue('forged-private','lottery_result','railway',now(),'{}'::jsonb)$$,
  '42501',
  null,
  'anon cannot execute private notification enqueue core'
);
select throws_ok(
  $$select public.notification_event_enqueue_server('forged-wrapper','lottery_result','railway',now(),'{}'::jsonb)$$,
  '42501',
  null,
  'anon cannot execute server notification enqueue wrapper'
);
reset role;

set local role authenticated;
select throws_ok(
  $$insert into public.notification_outbox(event_id,member_id,channel,notification_payload)
    values (gen_random_uuid(),gen_random_uuid(),'web_push','{}')$$,
  '42501',
  null,
  'authenticated cannot forge notification outbox work'
);
select throws_ok(
  $$select private.notification_event_enqueue('forged-private-auth','lottery_result','railway',now(),'{}'::jsonb)$$,
  '42501',
  null,
  'authenticated cannot execute private notification enqueue core'
);
select throws_ok(
  $$select public.notification_event_enqueue_server('forged-wrapper-auth','lottery_result','railway',now(),'{}'::jsonb)$$,
  '42501',
  null,
  'authenticated cannot execute server notification enqueue wrapper'
);
reset role;

create temporary table notification_enqueue_observations (
  first_result jsonb,
  second_result jsonb
);

insert into notification_enqueue_observations(first_result, second_result)
values (
  private.notification_event_enqueue(
    'lottery_result:539:115203',
    'lottery_result',
    'railway',
    '2026-09-03T12:00:00+08:00',
    '{"lottery":"今彩539","lotteryCode":"539","period":"115203","numbers":["01","02","03","04","05"],"drawDate":"2026-09-03"}'::jsonb
  ),
  private.notification_event_enqueue(
    'lottery_result:539:115203',
    'lottery_result',
    'railway',
    '2026-09-03T12:00:00+08:00',
    '{"lottery":"今彩539","lotteryCode":"539","period":"115203","numbers":["01","02","03","04","05"],"drawDate":"2026-09-03"}'::jsonb
  )
);

select is(
  (select first_result->>'created' from notification_enqueue_observations),
  'true',
  'first enqueue creates the event'
);
select is(
  (select second_result->>'created' from notification_enqueue_observations),
  'false',
  'duplicate event key is accepted without creating a second event'
);
select is(
  (select count(*) from public.notification_events where event_key = 'lottery_result:539:115203'),
  1::bigint,
  'duplicate event key keeps exactly one event row'
);
select is(
  (select first_result->>'id' from notification_enqueue_observations),
  (select second_result->>'id' from notification_enqueue_observations),
  'duplicate enqueue returns the original event id'
);
select is(
  (select first_result->>'fanoutStatus' from notification_enqueue_observations),
  'pending',
  'new enqueue response exposes the initial pending fanout status'
);

select throws_ok(
  $$select private.notification_event_enqueue('invalid-null-type',null,'railway',now(),'{}'::jsonb)$$,
  '22023',
  'INVALID_NOTIFICATION_EVENT',
  'null event type is rejected with the stable validation error'
);
select throws_ok(
  $$select private.notification_event_enqueue('invalid-null-source','lottery_result',null,now(),'{}'::jsonb)$$,
  '22023',
  'INVALID_NOTIFICATION_EVENT',
  'null source is rejected with the stable validation error'
);
select throws_ok(
  $$select private.notification_event_enqueue('invalid-null-payload','lottery_result','railway',now(),null::jsonb)$$,
  '22023',
  'INVALID_NOTIFICATION_EVENT',
  'null payload is rejected with the stable validation error'
);

set local role service_role;
select is(
  public.notification_event_enqueue_server(
    'lottery_result:539:115203',
    'lottery_result',
    'railway',
    '2026-09-03T12:00:00+08:00',
    '{"lottery":"今彩539","lotteryCode":"539","period":"115203","numbers":["01","02","03","04","05"],"drawDate":"2026-09-03"}'::jsonb
  )->>'created',
  'false',
  'service role can call the server wrapper idempotently'
);
select is(
  public.notification_event_enqueue_server(
    'matrix_card:539:115203',
    'matrix_card',
    'railway',
    '2026-09-03T12:01:00+08:00',
    '{"lottery":"今彩539","lotteryCode":"539","period":"115203"}'::jsonb
  )->>'eventKey',
  'matrix_card:539:115203',
  'service role wrapper creates a trusted server event'
);
reset role;

-- Task 2: server-side renderer, member filtering, fan-out, and recovery.
select has_function(
  'private',
  'notification_render_payload',
  array['text','text','jsonb']
);
select has_function(
  'private',
  'notification_member_matches',
  array['uuid','text','jsonb']
);
select has_function(
  'private',
  'notification_fanout_event',
  array['uuid']
);
select has_function(
  'private',
  'notification_fanout_drain',
  array['integer','timestamp with time zone']
);
select has_function(
  'private',
  'notification_retry_delay_minutes',
  array['integer']
);

insert into auth.users (id, email)
values
  ('30000000-0000-0000-0000-000000000001', 'notification-member-a@example.test'),
  ('30000000-0000-0000-0000-000000000002', 'notification-member-b@example.test'),
  ('30000000-0000-0000-0000-000000000003', 'notification-member-inactive@example.test');

insert into public.members (id, auth_user_id, status)
values
  ('31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '啟用'),
  ('31000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '啟用'),
  ('31000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', '停用');

insert into public.notification_settings (member_id, settings)
values (
  '31000000-0000-0000-0000-000000000001',
  '{
    "settings":{"bet":true,"result":true,"win":true,"status":true,"card":false,"collision":false,"system":true,"expiry":true},
    "selectedOptions":{"result":["今彩539"],"win":["彩種通知"],"status":["今彩539"],"card":["今彩539"],"system":["維護"],"expiry":["提前1日"]},
    "betTimes":{"今彩539":["18:00",""] ,"天天樂":["",""] ,"六合彩":["",""] ,"大樂透":["",""]},
    "statusOptions":{"今彩539":["啟動"],"天天樂":[],"六合彩":[],"大樂透":[]},
    "collisionOptions":{"今彩539":["獨碰二星","獨碰三星"],"天天樂":["獨碰二星","獨碰三星"],"六合彩":["獨碰二星","獨碰三星"],"大樂透":["獨碰二星","獨碰三星"]}
  }'::jsonb
);

select private.notification_event_enqueue(
  'matrix_status:539:115203',
  'matrix_status',
  'railway',
  '2026-09-03T12:01:00+08:00',
  '{"lottery":"今彩539","lotteryCode":"539","period":"115203","status":"ACTIVE","statusLabel":"啟動"}'::jsonb
);
select private.notification_event_enqueue(
  'matrix_status:539:115204',
  'matrix_status',
  'railway',
  '2026-09-03T12:02:00+08:00',
  '{"lottery":"今彩539","lotteryCode":"539","period":"115204","status":"FOCUS","statusLabel":"聚合"}'::jsonb
);
select private.notification_event_enqueue(
  'matrix_status:539:115205',
  'matrix_status',
  'railway',
  '2026-09-03T12:03:00+08:00',
  '{"lottery":"今彩539","lotteryCode":"539","period":"115205","status":"UNKNOWN","statusLabel":"未知"}'::jsonb
);
select private.notification_event_enqueue(
  'matrix_card:649:115206',
  'matrix_card',
  'railway',
  '2026-09-03T11:53:00+08:00',
  '{"lottery":"大樂透","lotteryCode":"649","period":"115206"}'::jsonb
);

select is(
  private.notification_event_enqueue(
    'matrix_status:539:115203',
    'matrix_status',
    'railway',
    '2026-09-03T12:04:00+08:00',
    '{"lottery":"今彩539","lotteryCode":"539","period":"115203","status":"CRITICAL","statusLabel":"臨界"}'::jsonb
  )->>'created',
  'false',
  'later status upgrade reuses the draw-level Matrix event'
);
select is(
  (select count(*) from public.notification_events where event_key = 'matrix_status:539:115203'),
  1::bigint,
  'status upgrade keeps exactly one Matrix event for the lottery and period'
);
select is(
  (select payload->>'status' from public.notification_events where event_key = 'matrix_status:539:115203'),
  'ACTIVE',
  'status upgrade does not rewrite or re-notify the already accepted event'
);

select is(
  private.notification_render_payload(
    'lottery_result',
    'lottery_result:539:115203',
    '{"lottery":"今彩539","period":"115203","numbers":["01","02","03","04","05"]}'::jsonb
  )->>'title',
  '今彩539 開獎結果',
  'lottery result renderer builds the fixed title'
);
select is(
  private.notification_render_payload(
    'lottery_result',
    'lottery_result:539:115203',
    '{"lottery":"今彩539","period":"115203","numbers":["01","02","03","04","05"]}'::jsonb
  )->>'body',
  '第115203期｜01 02 03 04 05',
  'lottery result renderer preserves draw number order'
);
select is(
  private.notification_render_payload(
    'lottery_result',
    'lottery_result:539:115203',
    '{"lottery":"今彩539","period":"115203","numbers":["01","02","03","04","05"]}'::jsonb
  )->>'url',
  '/',
  'renderer keeps the first version deep link at root'
);
select is(
  pg_catalog.length(private.notification_render_payload(
    'lottery_result',
    'lottery_result:539:115203',
    '{"lottery":"今彩539","period":"115203","numbers":["01","02","03","04","05"]}'::jsonb
  )->>'tag'),
  64,
  'renderer derives a stable sha256 tag'
);
select is(
  private.notification_render_payload(
    'matrix_status',
    'matrix_status:539:115203',
    '{"lottery":"今彩539","period":"115203","status":"ACTIVE","statusLabel":"啟動"}'::jsonb
  )->>'title',
  'Matrix 狀態｜今彩539',
  'matrix status renderer builds the fixed title'
);
select is(
  private.notification_render_payload(
    'matrix_status',
    'matrix_status:539:115203',
    '{"lottery":"今彩539","period":"115203","status":"ACTIVE","statusLabel":"啟動"}'::jsonb
  )->>'body',
  '第115203期｜啟動',
  'matrix status renderer uses the localized status label'
);

select ok(
  private.notification_member_matches(
    '31000000-0000-0000-0000-000000000001',
    'lottery_result',
    '{"lottery":"今彩539"}'::jsonb
  ),
  'stored result settings match enabled 今彩539'
);
select ok(
  not private.notification_member_matches(
    '31000000-0000-0000-0000-000000000001',
    'lottery_result',
    '{"lottery":"大樂透"}'::jsonb
  ),
  'stored result settings reject an unselected lottery'
);
select ok(
  private.notification_member_matches(
    '31000000-0000-0000-0000-000000000001',
    'matrix_status',
    '{"lottery":"今彩539","statusLabel":"啟動"}'::jsonb
  ),
  'stored status settings match selected lottery and localized status'
);
select ok(
  not private.notification_member_matches(
    '31000000-0000-0000-0000-000000000001',
    'matrix_status',
    '{"lottery":"今彩539","statusLabel":"聚合"}'::jsonb
  ),
  'stored status settings reject an unselected localized status'
);
select ok(
  not private.notification_member_matches(
    '31000000-0000-0000-0000-000000000001',
    'matrix_card',
    '{"lottery":"今彩539"}'::jsonb
  ),
  'disabled card setting rejects card notifications'
);
select ok(
  private.notification_member_matches(
    '31000000-0000-0000-0000-000000000002',
    'matrix_card',
    '{"lottery":"今彩539"}'::jsonb
  ),
  'member without stored settings uses the default card setting'
);
select ok(
  not private.notification_member_matches(
    '31000000-0000-0000-0000-000000000003',
    'lottery_result',
    '{"lottery":"今彩539"}'::jsonb
  ),
  'inactive member never matches notifications'
);
select ok(
  private.notification_member_matches(
    '31000000-0000-0000-0000-000000000001',
    'bet_reminder',
    '{"memberId":"31000000-0000-0000-0000-000000000001","lottery":"今彩539"}'::jsonb
  ),
  'bet reminder matches only its intended enabled member'
);
select ok(
  not private.notification_member_matches(
    '31000000-0000-0000-0000-000000000002',
    'bet_reminder',
    '{"memberId":"31000000-0000-0000-0000-000000000001","lottery":"今彩539"}'::jsonb
  ),
  'bet reminder cannot fan out to another member'
);
select ok(
  private.notification_member_matches(
    '31000000-0000-0000-0000-000000000001',
    'membership_expiry',
    '{"memberId":"31000000-0000-0000-0000-000000000001","daysBefore":1}'::jsonb
  ),
  'expiry reminder matches an enabled selected lead time'
);
select ok(
  not private.notification_member_matches(
    '31000000-0000-0000-0000-000000000001',
    'membership_expiry',
    '{"memberId":"31000000-0000-0000-0000-000000000001","daysBefore":3}'::jsonb
  ),
  'expiry reminder rejects an unselected lead time'
);
select ok(
  private.notification_member_matches(
    '31000000-0000-0000-0000-000000000001',
    'system_notice',
    '{"category":"維護"}'::jsonb
  ),
  'system notice matches a selected category'
);
select ok(
  not private.notification_member_matches(
    '31000000-0000-0000-0000-000000000001',
    'system_notice',
    '{"category":"更新"}'::jsonb
  ),
  'system notice rejects an unselected category'
);
select ok(
  private.notification_member_matches(
    '31000000-0000-0000-0000-000000000002',
    'system_notice',
    '{"category":"更新"}'::jsonb
  ),
  'default settings include the update system category'
);

select is(
  private.notification_fanout_event(
    (select id from public.notification_events where event_key = 'lottery_result:539:115203')
  ),
  2,
  'result fanout creates outbox work for explicit and default enabled members'
);
select is(
  private.notification_fanout_event(
    (select id from public.notification_events where event_key = 'lottery_result:539:115203')
  ),
  0,
  're-running a completed event creates no duplicate outbox work'
);
select is(
  (select count(*) from public.notification_outbox o
    join public.notification_events e on e.id = o.event_id
    where e.event_key = 'lottery_result:539:115203'),
  2::bigint,
  'result event keeps exactly one outbox row per matching member'
);
select is(
  private.notification_fanout_event(
    (select id from public.notification_events where event_key = 'matrix_status:539:115203')
  ),
  2,
  'ACTIVE status fans out to explicit and default enabled members'
);
select is(
  private.notification_fanout_event(
    (select id from public.notification_events where event_key = 'matrix_status:539:115204')
  ),
  1,
  'FOCUS status fans out only to the default member when explicit status is not selected'
);
select is(
  private.notification_fanout_event(
    (select id from public.notification_events where event_key = 'matrix_card:539:115203')
  ),
  1,
  'card fanout excludes a member whose card setting is disabled'
);
select is(
  (select o.notification_payload->>'title'
   from public.notification_outbox o
   join public.notification_events e on e.id = o.event_id
   where e.event_key = 'matrix_card:539:115203'
   limit 1),
  'Matrix 牌單｜今彩539',
  'fanout stores the fixed rendered payload snapshot in the outbox'
);
select is(
  private.notification_fanout_event(
    (select id from public.notification_events where event_key = 'matrix_status:539:115205')
  ),
  0,
  'event with no matching notification settings completes with zero outbox rows'
);
select is(
  (select fanout_status from public.notification_events where event_key = 'matrix_status:539:115205'),
  'complete',
  'no-match event is complete rather than retried forever'
);

update public.notification_events
set fanout_status = 'processing',
    fanout_attempt_count = 1,
    processing_started_at = '2026-09-03T11:54:00+08:00',
    updated_at = '2026-09-03T11:54:00+08:00'
where event_key = 'matrix_card:649:115206';

select lives_ok(
  $$select private.notification_fanout_drain(50, '2026-09-03T12:00:00+08:00'::timestamptz)$$,
  'fanout drain recovers and processes stale events'
);
select is(
  (select fanout_status from public.notification_events where event_key = 'matrix_card:649:115206'),
  'complete',
  'stale processing event is recovered and completed'
);
select is(
  (select processing_started_at from public.notification_events where event_key = 'matrix_card:649:115206'),
  null::timestamptz,
  'completed recovered event clears processing_started_at'
);
select is(
  (select count(*) from public.notification_outbox o
   join public.notification_events e on e.id = o.event_id
   where e.event_key = 'matrix_card:649:115206'),
  1::bigint,
  'recovered card event fans out exactly once to the default-enabled member'
);

select is(private.notification_retry_delay_minutes(1), 1, 'fanout retry attempt 1 waits one minute');
select is(private.notification_retry_delay_minutes(2), 2, 'fanout retry attempt 2 waits two minutes');
select is(private.notification_retry_delay_minutes(3), 5, 'fanout retry attempt 3 waits five minutes');
select is(private.notification_retry_delay_minutes(4), 15, 'fanout retry attempt 4 waits fifteen minutes');
select is(private.notification_retry_delay_minutes(5), 30, 'fanout retry attempt 5 maps to thirty minutes');

select * from finish();
rollback;
