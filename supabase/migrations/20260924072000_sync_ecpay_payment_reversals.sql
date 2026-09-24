begin;

-- A recorded external reversal is a terminal state for the linked ECPay order.
-- Keep the paid trade and provider quota evidence; a refund does not free a
-- merchant transaction quota or erase the original payment.
alter table public.ecpay_orders drop constraint ecpay_orders_status_check;
alter table public.ecpay_orders add constraint ecpay_orders_status_check
  check (status in ('pending', 'confirmed', 'refund_required', 'refunded', 'chargeback', 'cancelled'));
alter table public.ecpay_orders drop constraint ecpay_orders_confirmed_has_trade;
alter table public.ecpay_orders add constraint ecpay_orders_confirmed_has_trade check (
  (status = 'pending' and trade_no is null and paid_at is null)
  or (status in ('confirmed', 'refund_required', 'refunded', 'chargeback', 'cancelled')
    and trade_no is not null and paid_at is not null)
);

-- Repair reversals recorded before order synchronization existed, provided
-- the original order and payment still agree on member, plan, amount and date.
update public.ecpay_orders as orders
set status = payment.status
from public.payments as payment
where payment.ecpay_order_id = orders.id
  and payment.status in ('refunded', 'chargeback', 'cancelled')
  and orders.status in ('confirmed', 'refund_required')
  and orders.member_id = payment.member_id
  and orders.plan_id = payment.plan_id
  and orders.amount = payment.amount
  and orders.paid_at = payment.paid_at;

create function public.sync_ecpay_order_reversal()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.ecpay_order_id is null
    or old.status not in ('confirmed', 'refund_required')
    or new.status not in ('refunded', 'chargeback', 'cancelled') then
    return new;
  end if;
  update public.ecpay_orders as orders
  set status = new.status
  where orders.id = new.ecpay_order_id
    and orders.status in ('confirmed', 'refund_required')
    and orders.member_id = new.member_id
    and orders.plan_id = new.plan_id
    and orders.amount = new.amount
    and orders.paid_at = new.paid_at;
  if not found then
    raise exception using errcode = 'P0001', message = 'PAYMENT_ORDER_MISMATCH';
  end if;
  return new;
end;
$$;
create trigger sync_ecpay_order_reversal_after_payment
  after update of status on public.payments
  for each row when (old.status is distinct from new.status)
  execute function public.sync_ecpay_order_reversal();

-- Both old (four-argument) and current (five-argument) confirmations resolve
-- here. A late duplicate callback must preserve a recorded reversal.
create or replace function public.ecpay_payment_confirm(
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
  if v_order.status in ('confirmed', 'refund_required', 'refunded', 'chargeback', 'cancelled') then
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

-- A delayed offline issuance must also leave reversed paid evidence intact.
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
    (v_order.quota_provider_status='1' or v_order.status in ('confirmed','refund_required','refunded','chargeback','cancelled')) then return; end if;
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

revoke all on function public.sync_ecpay_order_reversal() from public, anon, authenticated;
revoke all on function public.ecpay_payment_confirm(text,text,text,integer,timestamptz)
  from public, anon, authenticated;
grant execute on function public.ecpay_payment_confirm(text,text,text,integer,timestamptz)
  to service_role;
notify pgrst, 'reload schema';
commit;
