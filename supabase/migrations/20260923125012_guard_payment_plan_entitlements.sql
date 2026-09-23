-- Keep past migrations immutable. A paid callback records an auditable refund obligation
-- if an outstanding lower-plan order is paid after membership is upgraded or made permanent.
begin;

alter table public.ecpay_orders drop constraint ecpay_orders_status_check;
alter table public.ecpay_orders add constraint ecpay_orders_status_check
  check (status in ('pending', 'confirmed', 'refund_required'));
alter table public.ecpay_orders drop constraint ecpay_orders_confirmed_has_trade;
alter table public.ecpay_orders add constraint ecpay_orders_confirmed_has_trade check (
  (status = 'pending' and trade_no is null and paid_at is null)
  or (status in ('confirmed', 'refund_required') and trade_no is not null and paid_at is not null)
);
alter table public.payments drop constraint payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('pending', 'confirmed', 'rejected', 'refund_required', 'refunded', 'chargeback', 'cancelled'));

create or replace function public.ecpay_order_create(
  p_auth_user_id uuid, p_plan_code text, p_merchant_trade_no text, p_merchant_id text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_member public.members%rowtype;
  v_plan public.plans%rowtype;
begin
  if p_auth_user_id is null or p_merchant_trade_no !~ '^[A-Za-z0-9]{1,20}$'
    or p_merchant_id !~ '^[0-9]{1,10}$' then
    raise exception using errcode = '22023', message = 'INVALID_ORDER';
  end if;
  select * into v_member from public.members
  where auth_user_id = p_auth_user_id for update;
  if not found or coalesce(v_member.status, '') in ('停用', 'disabled', 'inactive') then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if coalesce((public.matrix_permission_settings()->>'subscriptionPurchaseVisible')::boolean, false) is false then
    raise exception using errcode = '42501', message = 'PURCHASE_DISABLED';
  end if;
  select * into v_plan from public.plans
  where name = case p_plan_code
    when 'month' then '月費方案'
    when 'quarter' then '季費方案'
    when 'year' then '年費方案'
    else null
  end;
  if not found then
    raise exception using errcode = '22023', message = 'INVALID_PLAN';
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
  insert into public.ecpay_orders(member_id,plan_id,merchant_id,merchant_trade_no,amount)
  values(v_member.id,v_plan.id,p_merchant_id,p_merchant_trade_no,v_plan.price);
  return pg_catalog.jsonb_build_object(
    'merchantTradeNo', p_merchant_trade_no,
    'planName', v_plan.name,
    'amount', v_plan.price
  );
end;
$$;

create or replace function public.ecpay_payment_confirm(
  p_merchant_trade_no text, p_merchant_id text, p_trade_no text, p_amount integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_order public.ecpay_orders%rowtype;
  v_member public.members%rowtype;
  v_duration integer;
  v_target_rank integer;
  v_current_rank integer;
  v_refund_required boolean;
  v_status text;
  v_now timestamptz := pg_catalog.now();
begin
  if p_trade_no is null or p_trade_no !~ '^[A-Za-z0-9]{1,20}$' then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_TRADE';
  end if;
  select * into v_order from public.ecpay_orders
  where merchant_trade_no = p_merchant_trade_no for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ORDER_NOT_FOUND';
  end if;
  if v_order.merchant_id is distinct from p_merchant_id or v_order.amount is distinct from p_amount then
    raise exception using errcode = 'P0001', message = 'ORDER_MISMATCH';
  end if;
  if v_order.status in ('confirmed', 'refund_required') then
    if v_order.trade_no is distinct from p_trade_no then
      raise exception using errcode = 'P0001', message = 'PAYMENT_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object('orderId',v_order.id,'status',v_order.status);
  end if;

  select * into v_member from public.members where id = v_order.member_id for update;
  select duration_days, case name when '月費方案' then 1 when '季費方案' then 2 when '年費方案' then 3 else 0 end
  into v_duration, v_target_rank from public.plans where id = v_order.plan_id;
  if v_member.id is null or v_duration is null then
    raise exception using errcode = 'P0002', message = 'MEMBER_OR_PLAN_NOT_FOUND';
  end if;
  select case name when '月費方案' then 1 when '季費方案' then 2 when '年費方案' then 3 else 0 end
  into v_current_rank from public.plans where id = v_member.current_plan_id;
  v_refund_required := coalesce(v_member.is_lifetime, false)
    or (v_member.plan_expires_at > v_now and coalesce(v_current_rank, 0) > v_target_rank);
  v_status := case when v_refund_required then 'refund_required' else 'confirmed' end;
  update public.ecpay_orders set status=v_status,trade_no=p_trade_no,paid_at=v_now
  where id=v_order.id;
  insert into public.payments(member_id,plan_id,ecpay_order_id,amount,paid_at,status)
  values(v_order.member_id,v_order.plan_id,v_order.id,v_order.amount,v_now,v_status);
  if not v_refund_required then
    update public.members set
    current_plan_id=v_order.plan_id,
    plan_started_at=coalesce(v_member.plan_started_at,v_now),
    plan_expires_at=greatest(v_now,coalesce(v_member.plan_expires_at,v_now))
      + pg_catalog.make_interval(days => v_duration),
    is_lifetime=false,
    auto_renew=false
  where id=v_order.member_id;
  end if;
  return pg_catalog.jsonb_build_object('orderId',v_order.id,'status',v_status);
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
declare
  v_member public.members%rowtype;
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
  v_member_id := v_member.id;
  if coalesce((public.matrix_permission_settings()->>'subscriptionPurchaseVisible')::boolean, false) is false then
    raise exception using errcode = '42501', message = 'PURCHASE_DISABLED';
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

create or replace function public.admin_review_transfer_request(
  p_transfer_id uuid,
  p_decision text,
  p_now timestamp with time zone,
  p_actor_id uuid,
  p_actor_name text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request public.transfer_requests%rowtype;
  v_member public.members%rowtype;
  v_duration integer;
  v_target_rank integer;
  v_current_rank integer;
  v_refund_required boolean := false;
  v_request_after jsonb;
  v_member_after jsonb;
begin
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
  returning pg_catalog.to_jsonb(transfer_requests) into v_request_after;

  if p_decision = 'confirmed' then
    select * into v_member
    from public.members
    where id = v_request.member_id
    for update;

    select duration_days, case name when '月費方案' then 1 when '季費方案' then 2 when '年費方案' then 3 else 0 end
    into v_duration, v_target_rank from public.plans where id = v_request.plan_id;
    if v_member.id is null or v_duration is null then
      raise exception using errcode = 'P0002', message = 'MEMBER_OR_PLAN_NOT_FOUND';
    end if;

    select case name when '月費方案' then 1 when '季費方案' then 2 when '年費方案' then 3 else 0 end
    into v_current_rank from public.plans where id = v_member.current_plan_id;
    v_refund_required := coalesce(v_member.is_lifetime, false)
      or (v_member.plan_expires_at > pg_catalog.now() and coalesce(v_current_rank, 0) > v_target_rank);

    insert into public.payments (
      member_id,
      plan_id,
      transfer_request_id,
      amount,
      paid_at,
      status
    ) values (
      v_request.member_id,
      v_request.plan_id,
      v_request.id,
      v_request.amount,
      coalesce(v_request.transferred_at, p_now),
      case when v_refund_required then 'refund_required' else 'confirmed' end
    );

    if not v_refund_required then
    update public.members
    set current_plan_id = v_request.plan_id,
        plan_started_at = coalesce(v_member.plan_started_at, p_now),
        plan_expires_at = greatest(
          p_now,
          coalesce(v_member.plan_expires_at, p_now)
        ) + pg_catalog.make_interval(days => v_duration),
        is_lifetime = false,
        auto_renew = false
    where id = v_request.member_id
    returning pg_catalog.to_jsonb(members) into v_member_after;

    insert into public.audit_logs (
      admin_id,
      admin,
      operation_type,
      target_table,
      target_id,
      content,
      before_data,
      after_data
    ) values (
      p_actor_id,
      p_actor_name,
      '修改',
      'members',
      v_request.member_id::text,
      '手動轉帳確認並開通或續訂方案',
      pg_catalog.to_jsonb(v_member),
      v_member_after
    );
    end if;
  end if;

  insert into public.audit_logs (
    admin_id,
    admin,
    operation_type,
    target_table,
    target_id,
    content,
    before_data,
    after_data
  ) values (
    p_actor_id,
    p_actor_name,
    '審核',
    'transfer_requests',
    p_transfer_id::text,
    case when p_decision = 'rejected' then '拒絕轉帳申請'
         when v_refund_required then '確認已收款，但會員權限已升級；需退款處理'
         else '確認轉帳申請' end,
    pg_catalog.to_jsonb(v_request),
    v_request_after
  );

  return v_request_after;
end;
$$;

create or replace function public.admin_record_payment_reversal(
  p_payment_id uuid,
  p_status text,
  p_reason text,
  p_actor_id uuid,
  p_actor_name text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_payment_after jsonb;
  v_reason text := nullif(pg_catalog.btrim(p_reason, E' \t\n\r\f\v'), '');
  v_actor_name text := nullif(pg_catalog.btrim(p_actor_name), '');
  v_referral_code text;
  v_referral_success_count integer := 0;
begin
  if p_payment_id is null then
    raise exception using errcode = '22023', message = 'PAYMENT_ID_REQUIRED';
  end if;
  if p_status is null or p_status not in ('refunded', 'chargeback', 'cancelled') then
    raise exception using errcode = '22023', message = 'INVALID_PAYMENT_REVERSAL_STATUS';
  end if;
  if v_reason is null then
    raise exception using errcode = '22023', message = 'PAYMENT_REVERSAL_REASON_REQUIRED';
  end if;
  if pg_catalog.char_length(v_reason) > 500 then
    raise exception using errcode = '22023', message = 'PAYMENT_REVERSAL_REASON_TOO_LONG';
  end if;
  if p_actor_id is null or v_actor_name is null then
    raise exception using errcode = '22023', message = 'PAYMENT_REVERSAL_ACTOR_REQUIRED';
  end if;
  if not exists (
    select 1 from public.admin_accounts as admin_account
    where admin_account.id = p_actor_id
  ) then
    raise exception using errcode = 'P0002', message = 'ADMIN_ACTOR_NOT_FOUND';
  end if;

  select payment.*
  into v_payment
  from public.payments as payment
  where payment.id = p_payment_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'PAYMENT_NOT_FOUND';
  end if;

  if v_payment.status = p_status then
    v_payment_after := pg_catalog.to_jsonb(v_payment);
  elsif v_payment.status in ('refunded', 'chargeback', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'PAYMENT_REVERSAL_CONFLICT';
  elsif v_payment.status not in ('confirmed', 'refund_required') then
    raise exception using errcode = 'P0001', message = 'PAYMENT_NOT_CONFIRMED';
  else
    update public.payments
    set status = p_status,
        reversed_at = pg_catalog.now(),
        reversal_reason = v_reason,
        reversed_by = p_actor_id,
        reversed_by_name = v_actor_name
    where id = p_payment_id
    returning pg_catalog.to_jsonb(payments) into v_payment_after;

    insert into public.audit_logs (
      admin_id,
      admin,
      operation_type,
      target_table,
      target_id,
      content,
      before_data,
      after_data
    ) values (
      p_actor_id,
      v_actor_name,
      '沖銷',
      'payments',
      p_payment_id::text,
      case p_status
        when 'refunded' then '記錄已完成退款'
        when 'chargeback' then '記錄已完成刷退'
        else '記錄已完成交易取消'
      end,
      pg_catalog.to_jsonb(v_payment),
      v_payment_after
    );
  end if;

  select pg_catalog.upper(pg_catalog.btrim(member.invitation_code))
  into v_referral_code
  from public.members as member
  where member.id = v_payment.member_id;

  if nullif(v_referral_code, '') is not null then
    select pg_catalog.count(distinct invited.id)::integer
    into v_referral_success_count
    from public.members as invited
    where pg_catalog.upper(pg_catalog.btrim(invited.invitation_code)) = v_referral_code
      and exists (
        select 1
        from public.payments as payment
        where payment.member_id = invited.id
          and payment.status = 'confirmed'
      );
  end if;

  return pg_catalog.jsonb_build_object(
    'id', v_payment_after->>'id',
    'memberId', v_payment_after->>'member_id',
    'status', v_payment_after->>'status',
    'reversedAt', v_payment_after->>'reversed_at',
    'reversalReason', v_payment_after->>'reversal_reason',
    'reversedBy', v_payment_after->>'reversed_by',
    'reversedByName', v_payment_after->>'reversed_by_name',
    'referralSuccessCount', v_referral_success_count
  );
end;
$$;

create or replace function public.member_payment_history_get()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_member_id uuid;
  v_history jsonb;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  select member.id into v_member_id from public.members as member
  where member.auth_user_id = (select auth.uid());
  if v_member_id is null then
    raise exception using errcode = '42501', message = 'MEMBER_REQUIRED';
  end if;

  select coalesce(pg_catalog.jsonb_agg(entry.item order by entry.recorded_at desc), '[]'::jsonb)
    into v_history
  from (
    select request.submitted_at as recorded_at,
      pg_catalog.jsonb_build_object(
        'id',request.id,'planName',plan.name,'amount',request.amount,
        'accountLastFive',request.account_last_five,'submittedAt',request.submitted_at,
        'paidAt',payment.paid_at,
        'status',case when payment.status in ('refunded','chargeback','cancelled','refund_required')
          then payment.status else request.status end
      ) as item
    from public.transfer_requests as request
    join public.plans as plan on plan.id=request.plan_id
    left join public.payments as payment on payment.transfer_request_id=request.id
    where request.member_id=v_member_id
    union all
    select orders.created_at as recorded_at,
      pg_catalog.jsonb_build_object(
        'id',orders.id,'planName',plan.name,'amount',orders.amount,
        'accountLastFive',null,'submittedAt',orders.created_at,
        'paidAt',payment.paid_at,
        'status',case when payment.status in ('refunded','chargeback','cancelled','refund_required')
          then payment.status else orders.status end
      ) as item
    from public.ecpay_orders as orders
    join public.plans as plan on plan.id=orders.plan_id
    left join public.payments as payment on payment.ecpay_order_id=orders.id
    where orders.member_id=v_member_id
  ) as entry;
  return v_history;
end;
$$;
revoke all on function public.ecpay_order_create(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.ecpay_order_create(uuid,text,text,text) to service_role;
revoke all on function public.ecpay_payment_confirm(text,text,text,integer) from public, anon, authenticated;
grant execute on function public.ecpay_payment_confirm(text,text,text,integer) to service_role;
revoke all on function public.member_transfer_request_submit(text,text) from public, anon;
grant execute on function public.member_transfer_request_submit(text,text) to authenticated;
revoke all on function public.admin_review_transfer_request(uuid,text,timestamptz,uuid,text) from public, anon, authenticated;
grant execute on function public.admin_review_transfer_request(uuid,text,timestamptz,uuid,text) to service_role;
revoke all on function public.admin_record_payment_reversal(uuid,text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.admin_record_payment_reversal(uuid,text,text,uuid,text) to service_role;
revoke all on function public.member_payment_history_get() from public, anon;
grant execute on function public.member_payment_history_get() to authenticated;

notify pgrst, 'reload schema';
commit;
