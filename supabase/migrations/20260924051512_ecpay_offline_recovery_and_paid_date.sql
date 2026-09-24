begin;

-- An issued offline number is an occupied quota entry, but an unpaid order
-- needs only hourly payment-state recovery. Keep the original five-minute
-- database tick and the ten-minute retry for unresolved first-time evidence.
create or replace function public.ecpay_quota_record(
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
  if v_order.quota_state='occupied' and p_state<>'occupied' then return; end if;
  if v_order.quota_trade_no is not null and p_trade_no is distinct from v_order.quota_trade_no then
    raise exception 'PAYMENT_CONFLICT';
  end if;
  -- An asynchronous issuance notification may arrive after verified payment.
  if p_provider_status <> '1' and
    (v_order.quota_provider_status='1' or v_order.status in ('confirmed','refund_required')) then return; end if;
  if v_order.quota_state='released' and p_state='reserved' then return; end if;
  update public.ecpay_orders set
    quota_state=p_state, quota_at=case when quota_state='occupied' then quota_at else p_occurred_at end,
    quota_payment_type=p_payment_type, quota_provider_status=p_provider_status,
    quota_trade_no=nullif(p_trade_no,''), quota_checked_at=pg_catalog.now(),
    quota_check_after=pg_catalog.now()+case
      when p_state='occupied' and p_provider_status='0'
        and p_payment_type ~ '^(ATM|CVS|BARCODE|WebATM)_[A-Za-z0-9]+$'
        then interval '1 hour'
      else interval '10 minutes' end
  where id=v_order.id;
end;
$$;

create or replace function public.ecpay_quota_reconcile_claim(p_merchant_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_after timestamptz; v_orders jsonb;
begin
  if p_merchant_id is null or p_merchant_id !~ '^[0-9]{1,10}$' then raise exception 'INVALID_ORDER'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ecpay-quota:' || p_merchant_id,0));
  select retry_after into v_after from public.ecpay_quota_reconciliation where merchant_id=p_merchant_id;
  if v_after > pg_catalog.now() then return '[]'::jsonb; end if;
  insert into public.ecpay_quota_reconciliation values(p_merchant_id,pg_catalog.now()+interval '2 minutes')
  on conflict (merchant_id) do update set retry_after=excluded.retry_after;
  with picked as (
    select id from public.ecpay_orders
    where merchant_id=p_merchant_id
      and (quota_state='reserved' or (quota_state='occupied' and status='pending'))
      and created_at <= pg_catalog.now()-interval '10 minutes'
      and (quota_check_after is null or quota_check_after <= pg_catalog.now())
    order by case when status='pending' then 0 else 1 end,
      quota_check_after nulls first,created_at,id limit 5
  ), claimed as (
    update public.ecpay_orders o set quota_check_after=pg_catalog.now()+case
      when o.quota_state='occupied' and o.quota_provider_status='0'
        and o.quota_payment_type ~ '^(ATM|CVS|BARCODE|WebATM)_[A-Za-z0-9]+$'
        then interval '1 hour'
      else interval '10 minutes' end
    from picked where o.id=picked.id returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'merchantId',merchant_id,'merchantTradeNo',merchant_trade_no,'amount',amount,
    'quotaState',quota_state,'quotaPaymentType',quota_payment_type,
    'quotaProviderStatus',quota_provider_status,'quotaTradeNo',quota_trade_no
  )),'[]'::jsonb) into v_orders from claimed;
  return v_orders;
end;
$$;

-- The fifth argument is the MAC-verified provider PaymentDate. Receipt time
-- must not move the entitlement grant time or expiry calculation backwards.
create function public.ecpay_payment_confirm(
  p_merchant_trade_no text, p_merchant_id text, p_trade_no text, p_amount integer,
  p_paid_at timestamptz
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
  if p_paid_at is null or p_paid_at > v_now+interval '5 minutes' then
    raise exception using errcode = '22023', message = 'INVALID_PROVIDER_PAYMENT_DATE';
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
  update public.ecpay_orders set status=v_status,trade_no=p_trade_no,paid_at=p_paid_at
  where id=v_order.id;
  insert into public.payments(
    member_id,plan_id,ecpay_order_id,amount,paid_at,status,
    entitlement_granted_at,entitlement_revision
  ) values (
    v_order.member_id,v_order.plan_id,v_order.id,v_order.amount,p_paid_at,v_status,
    case when not v_refund_required then v_now end,
    case when not v_refund_required then v_member.subscription_revision + 1 end
  );
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

-- Existing callers retain the original four-argument signature during
-- migration rollout; the current Edge callers pass the verified provider date.
create or replace function public.ecpay_payment_confirm(
  p_merchant_trade_no text, p_merchant_id text, p_trade_no text, p_amount integer
) returns jsonb language sql security invoker set search_path = '' as $$
  select public.ecpay_payment_confirm($1,$2,$3,$4,pg_catalog.now());
$$;

create function public.ecpay_paid_reconcile(
  p_merchant_id text, p_merchant_trade_no text, p_amount integer,
  p_state text, p_payment_type text, p_provider_status text,
  p_occurred_at timestamptz, p_trade_no text, p_paid_at timestamptz
) returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if p_provider_status is distinct from '1' or p_paid_at is null then
    raise exception 'INVALID_PAID_EVIDENCE';
  end if;
  perform public.ecpay_quota_record(
    p_merchant_id,p_merchant_trade_no,p_amount,p_state,p_payment_type,
    p_provider_status,p_occurred_at,p_trade_no
  );
  return public.ecpay_payment_confirm(p_merchant_trade_no,p_merchant_id,p_trade_no,p_amount,p_paid_at);
end;
$$;

revoke all on function public.ecpay_payment_confirm(text,text,text,integer,timestamptz)
  from public, anon, authenticated;
grant execute on function public.ecpay_payment_confirm(text,text,text,integer,timestamptz)
  to service_role;
revoke all on function public.ecpay_paid_reconcile(text,text,integer,text,text,text,timestamptz,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.ecpay_paid_reconcile(text,text,integer,text,text,text,timestamptz,text,timestamptz)
  to service_role;

notify pgrst, 'reload schema';
commit;
