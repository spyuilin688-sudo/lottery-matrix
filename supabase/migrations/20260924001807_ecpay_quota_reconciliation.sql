begin;

-- "reserved" is an upper bound on possible usage, never evidence of quota exhaustion.
-- Existing orders must be reconciled; local pending/confirmed timestamps are not
-- provider trade dates. Never release an unknown order solely because time passed.
alter table public.ecpay_orders
  add column quota_state text not null default 'reserved'
    check (quota_state in ('reserved','occupied','released')),
  add column quota_at timestamptz,
  add column quota_payment_type text,
  add column quota_provider_status text,
  add column quota_trade_no text,
  add column quota_checked_at timestamptz,
  add column quota_check_after timestamptz,
  add constraint ecpay_quota_date_check check (
    (quota_state = 'occupied' and quota_at is not null)
    or (quota_state <> 'occupied' and quota_at is null)
  );
create index ecpay_quota_usage_idx on public.ecpay_orders(merchant_id,quota_state,quota_at);

create table public.ecpay_quota_reconciliation (
  merchant_id text primary key check (merchant_id ~ '^[0-9]{1,10}$'),
  retry_after timestamptz not null
);
alter table public.ecpay_quota_reconciliation enable row level security;
revoke all on public.ecpay_quota_reconciliation from public, anon, authenticated;
grant select, insert, update on public.ecpay_quota_reconciliation to service_role;

create function public.ecpay_order_create_with_quota(
  p_auth_user_id uuid, p_plan_code text, p_merchant_trade_no text, p_merchant_id text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_order jsonb;
  v_occupied bigint;
  v_reserved bigint;
  v_cutoff timestamptz := ((pg_catalog.now() at time zone 'Asia/Taipei')::date - 29)::timestamp at time zone 'Asia/Taipei';
begin
  if p_merchant_id is null or p_merchant_id !~ '^[0-9]{1,10}$' then
    raise exception 'INVALID_ORDER';
  end if;
  -- The lock precedes the read and insert and is shared with evidence updates.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ecpay-quota:' || p_merchant_id, 0));
  -- Reuse every existing eligibility and server-price check. Raising below rolls
  -- this provisional insert back; no rejected checkout leaves a phantom order.
  v_order := public.ecpay_order_create(p_auth_user_id,p_plan_code,p_merchant_trade_no,p_merchant_id);
  select
    coalesce(sum(amount) filter (where quota_state='occupied' and quota_at >= v_cutoff),0),
    coalesce(sum(amount) filter (where quota_state='reserved'),0)
  into v_occupied,v_reserved
  from public.ecpay_orders
  where merchant_id=p_merchant_id and merchant_trade_no<>p_merchant_trade_no;
  -- The user's approved rolling 30-day merchant limit is TWD 200,000.
  if v_occupied + (v_order->>'amount')::integer > 200000 then
    raise exception 'ECPAY_QUOTA_LIMIT';
  end if;
  if v_occupied + v_reserved + (v_order->>'amount')::integer > 200000 then
    raise exception 'ECPAY_QUOTA_UNCERTAIN';
  end if;
  return v_order;
end;
$$;

create function public.ecpay_quota_record(
  p_merchant_id text, p_merchant_trade_no text, p_amount integer,
  p_state text, p_payment_type text, p_provider_status text,
  p_occurred_at timestamptz, p_trade_no text
) returns void language plpgsql security invoker set search_path = '' as $$
declare v_order public.ecpay_orders%rowtype;
begin
  if p_merchant_id is null or p_merchant_id !~ '^[0-9]{1,10}$'
    or p_state is null or p_state not in ('reserved','occupied','released')
    or p_provider_status is null or p_payment_type is null
    or p_amount is null or p_amount <= 0 then raise exception 'INVALID_QUOTA_EVIDENCE'; end if;
  if p_state='occupied' and (
      p_occurred_at is null or p_occurred_at > pg_catalog.now()+interval '5 minutes'
      or p_trade_no is null or p_trade_no !~ '^[A-Za-z0-9]{1,20}$'
      or not (
        (p_provider_status='1' and (p_payment_type ~ '^(Credit|ApplePay|ATM|CVS|BARCODE|WebATM)_[A-Za-z0-9]+$' or p_payment_type='Flexible_Installment'))
        or (p_provider_status='0' and p_payment_type ~ '^(ATM|CVS|BARCODE|WebATM)_[A-Za-z0-9]+$')
      )
    ) then raise exception 'INVALID_QUOTA_EVIDENCE'; end if;
  if (p_state='released' and not (p_provider_status='10200095'
      or (p_provider_status='1' and p_payment_type in ('TWQR_OPAY','BNPL_URICH','WeiXin_OPAY'))))
    or (p_state='reserved' and p_provider_status not in ('0','1'))
    or (p_provider_status<>'10200095' and (p_trade_no is null or p_trade_no !~ '^[A-Za-z0-9]{1,20}$'))
    or (p_state<>'occupied' and p_occurred_at is not null) then
    raise exception 'INVALID_QUOTA_EVIDENCE';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ecpay-quota:' || p_merchant_id,0));
  select * into v_order from public.ecpay_orders where merchant_trade_no=p_merchant_trade_no for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.merchant_id is distinct from p_merchant_id or v_order.amount is distinct from p_amount then
    raise exception 'ORDER_MISMATCH';
  end if;
  -- A late unpaid/failed response must never erase a verified issued/paid order.
  if v_order.quota_state='occupied' and p_state<>'occupied' then return; end if;
  if v_order.quota_trade_no is not null and p_trade_no is distinct from v_order.quota_trade_no then
    raise exception 'PAYMENT_CONFLICT';
  end if;
  if v_order.quota_state='released' and p_state='reserved' then return; end if;
  update public.ecpay_orders set
    quota_state=p_state, quota_at=case when quota_state='occupied' then quota_at else p_occurred_at end,
    quota_payment_type=p_payment_type, quota_provider_status=p_provider_status,
    quota_trade_no=nullif(p_trade_no,''), quota_checked_at=pg_catalog.now(),
    quota_check_after=pg_catalog.now()+interval '10 minutes'
  where id=v_order.id;
end;
$$;

create function public.ecpay_quota_reconcile_claim(p_merchant_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_after timestamptz; v_orders jsonb;
begin
  if p_merchant_id is null or p_merchant_id !~ '^[0-9]{1,10}$' then raise exception 'INVALID_ORDER'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ecpay-quota:' || p_merchant_id,0));
  select retry_after into v_after from public.ecpay_quota_reconciliation where merchant_id=p_merchant_id;
  if v_after > pg_catalog.now() then return '[]'::jsonb; end if;
  -- One bounded batch across all concurrent callers. This is a query lease,
  -- not a payment expiry; no financial reservation is released by this timer.
  insert into public.ecpay_quota_reconciliation values(p_merchant_id,pg_catalog.now()+interval '2 minutes')
  on conflict (merchant_id) do update set retry_after=excluded.retry_after;
  with picked as (
    select id from public.ecpay_orders
    where merchant_id=p_merchant_id and quota_state='reserved'
      and created_at <= pg_catalog.now()-interval '10 minutes'
      and (quota_check_after is null or quota_check_after <= pg_catalog.now())
    -- Claims advance this timestamp even when the provider query fails, so a
    -- permanently unqueryable batch cannot starve later unresolved orders.
    order by quota_check_after nulls first,created_at,id limit 5
  ), claimed as (
    update public.ecpay_orders o set quota_check_after=pg_catalog.now()+interval '10 minutes'
    from picked where o.id=picked.id returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'merchantId',merchant_id,'merchantTradeNo',merchant_trade_no,'amount',amount
  )),'[]'::jsonb) into v_orders from claimed;
  return v_orders;
end;
$$;

create function public.ecpay_quota_query_backoff(p_merchant_id text)
returns void language sql security invoker set search_path = '' as $$
  insert into public.ecpay_quota_reconciliation values(p_merchant_id,pg_catalog.now()+interval '30 minutes')
  on conflict (merchant_id) do update set retry_after=greatest(
    public.ecpay_quota_reconciliation.retry_after,excluded.retry_after);
$$;

revoke all on function public.ecpay_order_create_with_quota(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.ecpay_quota_record(text,text,integer,text,text,text,timestamptz,text) from public,anon,authenticated;
revoke all on function public.ecpay_quota_reconcile_claim(text) from public,anon,authenticated;
revoke all on function public.ecpay_quota_query_backoff(text) from public,anon,authenticated;
grant execute on function public.ecpay_order_create_with_quota(uuid,text,text,text) to service_role;
grant execute on function public.ecpay_quota_record(text,text,integer,text,text,text,timestamptz,text) to service_role;
grant execute on function public.ecpay_quota_reconcile_claim(text) to service_role;
grant execute on function public.ecpay_quota_query_backoff(text) to service_role;
commit;
