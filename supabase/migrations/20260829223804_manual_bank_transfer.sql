begin;

insert into public.plans (name, price, duration_days)
values
  ('月費方案', 1880, 30),
  ('季費方案', 4580, 90),
  ('年費方案', 16800, 365)
on conflict (name) do update
set price = excluded.price,
    duration_days = excluded.duration_days;

create unique index if not exists transfer_requests_one_pending_per_member
  on public.transfer_requests (member_id)
  where status = 'pending';

create or replace function public.member_transfer_request_submit(
  p_plan_code text,
  p_account_last_five text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid;
  v_plan public.plans%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_request jsonb;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_account_last_five is null or p_account_last_five !~ '^[0-9]{5}$' then
    raise exception using errcode = '22023', message = 'INVALID_ACCOUNT_LAST_FIVE';
  end if;

  select member.id into v_member_id
  from public.members as member
  where member.auth_user_id = (select auth.uid());
  if v_member_id is null then
    raise exception using errcode = '42501', message = 'MEMBER_REQUIRED';
  end if;

  select plan.id, plan.name, plan.price, plan.duration_days
  into v_plan.id, v_plan.name, v_plan.price, v_plan.duration_days
  from public.plans as plan
  where plan.name = case p_plan_code
    when 'month' then '月費方案'
    when 'quarter' then '季費方案'
    when 'year' then '年費方案'
    else null
  end;
  if v_plan.id is null then
    raise exception using errcode = '22023', message = 'INVALID_PLAN';
  end if;

  if exists (
    select 1 from public.transfer_requests
    where member_id = v_member_id and status = 'pending'
  ) then
    raise exception using errcode = '23505', message = 'PENDING_TRANSFER_EXISTS';
  end if;

  insert into public.transfer_requests (
    member_id, plan_id, amount, transferred_at,
    account_last_five, submitted_at, status
  ) values (
    v_member_id, v_plan.id, v_plan.price, v_now,
    p_account_last_five, v_now, 'pending'
  )
  returning pg_catalog.jsonb_build_object(
    'id', id,
    'planName', v_plan.name,
    'amount', amount,
    'accountLastFive', account_last_five,
    'submittedAt', submitted_at,
    'status', status
  ) into v_request;
  return v_request;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'PENDING_TRANSFER_EXISTS';
end;
$$;

create or replace function public.member_pending_transfer_request()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_id uuid;
  v_request jsonb;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  select member.id into v_member_id
  from public.members as member
  where member.auth_user_id = (select auth.uid());
  if v_member_id is null then
    raise exception using errcode = '42501', message = 'MEMBER_REQUIRED';
  end if;

  select pg_catalog.jsonb_build_object(
    'id', request.id,
    'planName', plan.name,
    'amount', request.amount,
    'accountLastFive', request.account_last_five,
    'submittedAt', request.submitted_at,
    'status', request.status
  ) into v_request
  from public.transfer_requests as request
  join public.plans as plan on plan.id = request.plan_id
  where request.member_id = v_member_id and request.status = 'pending'
  order by request.submitted_at desc
  limit 1;
  return v_request;
end;
$$;

create or replace function public.member_payment_history()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_id uuid;
  v_history jsonb;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  select member.id into v_member_id
  from public.members as member
  where member.auth_user_id = (select auth.uid());
  if v_member_id is null then
    raise exception using errcode = '42501', message = 'MEMBER_REQUIRED';
  end if;

  select pg_catalog.coalesce(pg_catalog.jsonb_agg(entry.item order by entry.recorded_at desc), '[]'::jsonb)
  into v_history
  from (
    select request.submitted_at as recorded_at,
      pg_catalog.jsonb_build_object(
        'id', request.id,
        'planName', plan.name,
        'amount', request.amount,
        'accountLastFive', request.account_last_five,
        'submittedAt', request.submitted_at,
        'paidAt', payment.paid_at,
        'status', request.status
      ) as item
    from public.transfer_requests as request
    join public.plans as plan on plan.id = request.plan_id
    left join public.payments as payment on payment.transfer_request_id = request.id
    where request.member_id = v_member_id
  ) as entry;
  return v_history;
end;
$$;

create or replace function public.admin_transfer_request_review(
  p_transfer_id uuid,
  p_decision text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_now timestamptz := pg_catalog.now();
  v_request public.transfer_requests%rowtype;
  v_member public.members%rowtype;
  v_duration integer;
  v_request_after jsonb;
  v_member_after jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if p_decision not in ('confirmed', 'rejected') then
    raise exception using errcode = '22023', message = 'INVALID_REVIEW_DECISION';
  end if;

  select * into v_request
  from public.transfer_requests
  where id = p_transfer_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'TRANSFER_REQUEST_NOT_FOUND';
  end if;
  if v_request.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'TRANSFER_REQUEST_ALREADY_REVIEWED';
  end if;

  update public.transfer_requests
  set status = p_decision
  where id = p_transfer_id
  returning to_jsonb(transfer_requests) into v_request_after;

  if p_decision = 'confirmed' then
    select * into v_member
    from public.members
    where id = v_request.member_id
    for update;
    select duration_days into v_duration
    from public.plans
    where id = v_request.plan_id;
    if v_member.id is null or v_duration is null then
      raise exception using errcode = 'P0002', message = 'MEMBER_OR_PLAN_NOT_FOUND';
    end if;

    insert into public.payments (
      member_id, plan_id, transfer_request_id, amount, paid_at, status
    ) values (
      v_request.member_id, v_request.plan_id, v_request.id, v_request.amount, v_now, 'confirmed'
    );

    update public.members
    set current_plan_id = v_request.plan_id,
        plan_started_at = pg_catalog.coalesce(v_member.plan_started_at, v_now),
        plan_expires_at = pg_catalog.greatest(v_now, pg_catalog.coalesce(v_member.plan_expires_at, v_now))
          + pg_catalog.make_interval(days => v_duration),
        is_lifetime = false,
        auto_renew = false
    where id = v_request.member_id
    returning to_jsonb(members) into v_member_after;

    insert into public.audit_logs (
      admin_id, admin, operation_type, target_table, target_id, content, before_data, after_data
    ) values (
      v_actor_id, '管理員', '修改', 'members', v_request.member_id::text,
      '手動轉帳確認並開通或續訂方案', to_jsonb(v_member), v_member_after
    );
  end if;

  insert into public.audit_logs (
    admin_id, admin, operation_type, target_table, target_id, content, before_data, after_data
  ) values (
    v_actor_id, '管理員', '審核', 'transfer_requests', p_transfer_id::text,
    case when p_decision = 'confirmed' then '確認轉帳申請' else '退回轉帳申請' end,
    to_jsonb(v_request), v_request_after
  );
  return v_request_after;
end;
$$;

revoke all on function public.member_transfer_request_submit(text, text) from public, anon;
revoke all on function public.member_pending_transfer_request() from public, anon;
revoke all on function public.member_payment_history() from public, anon;
revoke all on function public.admin_transfer_request_review(uuid, text) from public, anon;

grant execute on function public.member_transfer_request_submit(text, text) to authenticated;
grant execute on function public.member_pending_transfer_request() to authenticated;
grant execute on function public.member_payment_history() to authenticated;
grant execute on function public.admin_transfer_request_review(uuid, text) to authenticated;

revoke insert, update, delete on table public.transfer_requests from public, anon, authenticated;
revoke insert, update, delete on table public.payments from public, anon, authenticated;
revoke insert, update, delete on table public.members from public, anon, authenticated;

commit;
