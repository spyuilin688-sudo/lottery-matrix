begin;

create function public.member_transfer_request_submit(
  p_plan_code text,
  p_account_last_five text,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.members%rowtype;
  v_plan public.plans%rowtype;
  v_existing public.transfer_requests%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_request jsonb;
  v_constraint text;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'REQUEST_ID_REQUIRED';
  end if;
  if p_account_last_five is null or p_account_last_five !~ '^[0-9]{5}$' then
    raise exception using errcode = '22023', message = 'INVALID_ACCOUNT_LAST_FIVE';
  end if;

  select member.* into v_member
  from public.members as member
  where member.auth_user_id = (select auth.uid())
  for update;
  if v_member.id is null then
    raise exception using errcode = '42501', message = 'MEMBER_REQUIRED';
  end if;
  if coalesce(v_member.status, '') in ('停用', 'disabled', 'inactive') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
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

  -- A completed request must remain idempotent after admin review or a
  -- subsequent purchase setting or membership change. Never lock this row:
  -- admin review locks request before member, while this RPC locks member first.
  select * into v_existing from public.transfer_requests where id = p_request_id;
  if found then
    if v_existing.member_id is distinct from v_member.id
      or v_existing.plan_id is distinct from v_plan.id
      or v_existing.account_last_five is distinct from p_account_last_five then
      raise exception using errcode = 'P0001', message = 'TRANSFER_REQUEST_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object(
      'id', v_existing.id,
      'planName', v_plan.name,
      'amount', v_existing.amount,
      'accountLastFive', v_existing.account_last_five,
      'submittedAt', v_existing.submitted_at,
      'status', v_existing.status
    );
  end if;

  if coalesce((public.matrix_permission_settings()->>'subscriptionPurchaseVisible')::boolean, false) is false then
    raise exception using errcode = '42501', message = 'PURCHASE_DISABLED';
  end if;
  if coalesce(v_member.is_lifetime, false) then
    raise exception using errcode = 'P0001', message = 'LIFETIME_PURCHASE_BLOCKED';
  end if;
  if v_member.plan_expires_at > pg_catalog.now() and exists (
    select 1 from public.plans as current_plan
    where current_plan.id = v_member.current_plan_id
      and case current_plan.name when '月費方案' then 1 when '季費方案' then 2 when '年費方案' then 3 else 0 end > case v_plan.name when '月費方案' then 1 when '季費方案' then 2 when '年費方案' then 3 else 0 end
  ) then
    raise exception using errcode = 'P0001', message = 'PLAN_DOWNGRADE_BLOCKED';
  end if;
  if exists (
    select 1 from public.transfer_requests
    where member_id = v_member.id and status = 'pending'
  ) then
    raise exception using errcode = '23505', message = 'PENDING_TRANSFER_EXISTS';
  end if;

  insert into public.transfer_requests (
    id, member_id, plan_id, amount, transferred_at,
    account_last_five, submitted_at, status
  ) values (
    p_request_id, v_member.id, v_plan.id, v_plan.price, v_now,
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
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'transfer_requests_pkey' then
      raise exception using errcode = '23505', message = 'TRANSFER_REQUEST_CONFLICT';
    end if;
    raise exception using errcode = '23505', message = 'PENDING_TRANSFER_EXISTS';
end;
$$;

create or replace function public.member_transfer_request_submit(
  p_plan_code text,
  p_account_last_five text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.member_transfer_request_submit(
    p_plan_code, p_account_last_five, pg_catalog.gen_random_uuid()
  );
end;
$$;

revoke all on function public.member_transfer_request_submit(text,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.member_transfer_request_submit(text,text,uuid) to authenticated;
revoke all on function public.member_transfer_request_submit(text,text) from public, anon;
grant execute on function public.member_transfer_request_submit(text,text) to authenticated;

notify pgrst, 'reload schema';

commit;
