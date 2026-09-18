begin;

select plan(5);

insert into auth.users (id, email)
values
  ('40000000-0000-0000-0000-000000000001', 'notification-quality-a@example.test'),
  ('40000000-0000-0000-0000-000000000002', 'notification-quality-b@example.test'),
  ('40000000-0000-0000-0000-000000000003', 'notification-quality-inactive@example.test'),
  ('40000000-0000-0000-0000-000000000004', 'notification-quality-malformed@example.test');

insert into public.members (id, auth_user_id, status)
values
  ('41000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '啟用'),
  ('41000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '啟用'),
  ('41000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', '停用'),
  ('41000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000004', '啟用');

insert into public.notification_settings (member_id, settings)
values
(
  '41000000-0000-0000-0000-000000000001',
  '{
    "settings":{"bet":true,"result":true,"win":true,"status":true,"card":true,"collision":false,"system":true,"expiry":true},
    "selectedOptions":{"result":["今彩539"],"win":["彩種通知"],"status":["今彩539"],"card":["今彩539"],"system":["維護","更新"],"expiry":["提前1日","提前3日","提前7日"]},
    "betTimes":{"今彩539":["18:00",""] ,"天天樂":["",""] ,"六合彩":["",""] ,"大樂透":["",""]},
    "statusOptions":{"今彩539":["啟動","聚合","共振","臨界"],"天天樂":["啟動","聚合","共振","臨界"],"六合彩":["啟動","聚合","共振","臨界"],"大樂透":["啟動","聚合","共振","臨界"]},
    "collisionOptions":{"今彩539":["獨碰二星","獨碰三星"],"天天樂":["獨碰二星","獨碰三星"],"六合彩":["獨碰二星","獨碰三星"],"大樂透":["獨碰二星","獨碰三星"]}
  }'::jsonb
),
(
  '41000000-0000-0000-0000-000000000004',
  '{
    "settings":{"bet":true,"result":"not-a-boolean","win":true,"status":true,"card":true,"collision":false,"system":true,"expiry":true},
    "selectedOptions":{"result":{"unexpected":true},"win":["彩種通知"],"status":["今彩539"],"card":["今彩539"],"system":["維護"],"expiry":["提前1日"]},
    "betTimes":{"今彩539":["18:00",""] ,"天天樂":["",""] ,"六合彩":["",""] ,"大樂透":["",""]},
    "statusOptions":{"今彩539":{"unexpected":true},"天天樂":[],"六合彩":[],"大樂透":[]},
    "collisionOptions":{"今彩539":["獨碰二星","獨碰三星"],"天天樂":["獨碰二星","獨碰三星"],"六合彩":["獨碰二星","獨碰三星"],"大樂透":["獨碰二星","獨碰三星"]}
  }'::jsonb
);

select lives_ok(
  $$select private.notification_member_matches(
    '41000000-0000-0000-0000-000000000004',
    'lottery_result',
    '{"lottery":"今彩539"}'::jsonb
  )$$,
  'malformed member settings do not raise during member matching'
);

select private.notification_event_enqueue(
  'lottery_result:539:115207',
  'lottery_result',
  'railway',
  '2026-09-03T15:00:00+08:00',
  '{"lottery":"今彩539","lotteryCode":"539","period":"115207","numbers":["01","02","03","04","05"],"drawDate":"2026-09-03"}'::jsonb
);

select is(
  private.notification_fanout_event(
    (select id from public.notification_events where event_key = 'lottery_result:539:115207')
  ),
  2,
  'malformed member settings do not block healthy recipients'
);

select is(
  (select fanout_status from public.notification_events where event_key = 'lottery_result:539:115207'),
  'complete',
  'healthy event completes even when one member has malformed settings'
);

select is(
  (select count(*) from public.notification_outbox o
   join public.notification_events e on e.id = o.event_id
   where e.event_key = 'lottery_result:539:115207'),
  2::bigint,
  'only the two healthy active members receive outbox work'
);

select is(
  (select count(*) from public.notification_outbox o
   join public.notification_events e on e.id = o.event_id
   where e.event_key = 'lottery_result:539:115207'
     and o.member_id = '41000000-0000-0000-0000-000000000004'),
  0::bigint,
  'malformed member settings are treated as non-matching rather than blocking fanout'
);

select * from finish();
rollback;
