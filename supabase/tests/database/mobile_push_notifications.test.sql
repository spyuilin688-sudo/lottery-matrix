begin;

select plan(20);

select has_table('public', 'member_push_subscriptions');
select has_table('public', 'push_delivery_logs');
select has_function('public', 'member_push_subscription_status', array['text']);
select has_function('public', 'member_push_subscription_save', array['text', 'text', 'text']);
select has_function('public', 'member_push_subscription_disable', array['text']);

insert into auth.users (id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'push-member-a@example.test'),
  ('20000000-0000-0000-0000-000000000002', 'push-member-b@example.test');

insert into public.member_push_subscriptions (user_id, endpoint, p256dh, auth_key)
values (
  '10000000-0000-0000-0000-000000000001',
  'https://push.example/member-a',
  'member-a-p256dh',
  'member-a-auth'
);

set local role anon;

select throws_ok(
  $$select count(*) from public.member_push_subscriptions$$,
  '42501',
  null,
  'anon cannot read push subscriptions'
);

select throws_ok(
  $$select public.member_push_subscription_status('https://push.example/member-a')$$,
  '42501',
  null,
  'anon cannot execute the subscription status RPC'
);

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(
  (select count(*) from public.member_push_subscriptions),
  1::bigint,
  'a member can read only that member''s subscriptions'
);

select throws_ok(
  $$insert into public.member_push_subscriptions (user_id, endpoint, p256dh, auth_key)
    values ('20000000-0000-0000-0000-000000000002', 'https://push.example/member-b', 'member-b-p256dh', 'member-b-auth')$$,
  '42501',
  null,
  'a member cannot create a subscription for another user'
);

select throws_ok(
  $$insert into public.member_push_subscriptions (user_id, endpoint, p256dh, auth_key)
    values ('10000000-0000-0000-0000-000000000001', 'https://push.example/member-a', 'duplicate-p256dh', 'duplicate-auth')$$,
  '42501',
  null,
  'members cannot bypass the controlled save RPC with direct inserts'
);

select throws_ok(
  $$insert into public.push_delivery_logs (user_id, title, body, status, admin_account)
    values ('10000000-0000-0000-0000-000000000001', 'title', 'body', 'sent', 'member-a')$$,
  '42501',
  null,
  'an authenticated member cannot write delivery logs'
);

select is(
  public.member_push_subscription_status('https://push.example/member-a')->>'enabled',
  'true',
  'the status RPC executes for its authenticated owner'
);

select is(
  public.member_push_subscription_save(
    'https://push.example/member-a-second',
    'member-a-second-p256dh',
    'member-a-second-auth'
  )->>'endpoint',
  'https://push.example/member-a-second',
  'the save RPC stores a subscription for its authenticated owner'
);

reset role;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(
  (select count(*) from public.member_push_subscriptions),
  0::bigint,
  'a second member cannot read the first member''s subscriptions'
);

select is(
  public.member_push_subscription_status('https://push.example/member-a')->>'enabled',
  'false',
  'the status RPC does not expose another member''s subscription'
);

select is(
  (public.member_push_subscription_disable('https://push.example/member-a')->>'disabled')::boolean,
  false,
  'the disable RPC cannot disable another member''s subscription'
);

select is(
  public.member_push_subscription_save(
    'https://push.example/member-a-second',
    'member-b-p256dh',
    'member-b-auth'
  )->>'enabled',
  'true',
  'saving an existing endpoint atomically transfers it to the current member'
);

select is(
  (select count(*) from public.member_push_subscriptions where endpoint = 'https://push.example/member-a-second'),
  1::bigint,
  'an endpoint has exactly one owner across all members'
);

select is(
  public.member_push_subscription_status('https://push.example/member-a-second')->>'enabled',
  'true',
  'device status is scoped to the current member and endpoint'
);

reset role;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

select is(
  (public.member_push_subscription_disable('https://push.example/member-a')->>'disabled')::boolean,
  true,
  'the disable RPC updates its authenticated owner''s subscription'
);

select * from finish();

rollback;
