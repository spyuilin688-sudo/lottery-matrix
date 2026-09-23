begin;

create table public.ecpay_orders (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  member_id uuid not null references public.members(id),
  plan_id uuid not null references public.plans(id),
  merchant_id text not null,
  merchant_trade_no text not null unique,
  trade_no text,
  amount integer not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed')),
  created_at timestamptz not null default pg_catalog.now(),
  paid_at timestamptz,
  constraint ecpay_orders_confirmed_has_trade check (
    (status = 'pending' and trade_no is null and paid_at is null)
    or (status = 'confirmed' and trade_no is not null and paid_at is not null)
  )
);
create index ecpay_orders_member_created_idx on public.ecpay_orders (member_id, created_at desc);
create unique index ecpay_orders_provider_trade_unique on public.ecpay_orders (merchant_id, trade_no)
  where trade_no is not null;
alter table public.ecpay_orders enable row level security;
revoke all on public.ecpay_orders from public, anon, authenticated;
grant select, insert, update on public.ecpay_orders to service_role;

alter table public.payments add column ecpay_order_id uuid references public.ecpay_orders(id);
create unique index payments_ecpay_order_unique on public.payments(ecpay_order_id)
  where ecpay_order_id is not null;

create function public.ecpay_order_create(
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
  insert into public.ecpay_orders(member_id,plan_id,merchant_id,merchant_trade_no,amount)
  values(v_member.id,v_plan.id,p_merchant_id,p_merchant_trade_no,v_plan.price);
  return pg_catalog.jsonb_build_object(
    'merchantTradeNo', p_merchant_trade_no,
    'planName', v_plan.name,
    'amount', v_plan.price
  );
end;
$$;
revoke all on function public.ecpay_order_create(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.ecpay_order_create(uuid,text,text,text) to service_role;

create function public.ecpay_payment_confirm(
  p_merchant_trade_no text, p_merchant_id text, p_trade_no text, p_amount integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_order public.ecpay_orders%rowtype;
  v_member public.members%rowtype;
  v_duration integer;
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
  if v_order.status = 'confirmed' then
    if v_order.trade_no is distinct from p_trade_no then
      raise exception using errcode = 'P0001', message = 'PAYMENT_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object('orderId',v_order.id,'status','confirmed');
  end if;

  select * into v_member from public.members where id = v_order.member_id for update;
  select duration_days into v_duration from public.plans where id = v_order.plan_id;
  if v_member.id is null or v_duration is null then
    raise exception using errcode = 'P0002', message = 'MEMBER_OR_PLAN_NOT_FOUND';
  end if;
  update public.ecpay_orders set status='confirmed',trade_no=p_trade_no,paid_at=v_now
  where id=v_order.id;
  insert into public.payments(member_id,plan_id,ecpay_order_id,amount,paid_at,status)
  values(v_order.member_id,v_order.plan_id,v_order.id,v_order.amount,v_now,'confirmed');
  update public.members set
    current_plan_id=v_order.plan_id,
    plan_started_at=coalesce(v_member.plan_started_at,v_now),
    plan_expires_at=greatest(v_now,coalesce(v_member.plan_expires_at,v_now))
      + pg_catalog.make_interval(days => v_duration),
    is_lifetime=false,
    auto_renew=false
  where id=v_order.member_id;
  return pg_catalog.jsonb_build_object('orderId',v_order.id,'status','confirmed');
end;
$$;
revoke all on function public.ecpay_payment_confirm(text,text,text,integer) from public, anon, authenticated;
grant execute on function public.ecpay_payment_confirm(text,text,text,integer) to service_role;

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
        'status',case when payment.status in ('refunded','chargeback','cancelled')
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
        'status',case when payment.status in ('refunded','chargeback','cancelled')
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
revoke all on function public.member_payment_history_get() from public, anon;
grant execute on function public.member_payment_history_get() to authenticated;

notify pgrst, 'reload schema';
commit;
