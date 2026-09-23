-- A payment reversal is recorded only after it has completed externally.
-- Keep the linked ECPay order in the same terminal state in that transaction.
begin;
set local lock_timeout = '5s';

alter table public.ecpay_orders drop constraint ecpay_orders_status_check;
alter table public.ecpay_orders add constraint ecpay_orders_status_check
  check (status in ('pending', 'confirmed', 'refund_required', 'refunded', 'chargeback', 'cancelled'));
alter table public.ecpay_orders drop constraint ecpay_orders_confirmed_has_trade;
alter table public.ecpay_orders add constraint ecpay_orders_confirmed_has_trade check (
  (status = 'pending' and trade_no is null and paid_at is null)
  or (status in ('confirmed', 'refund_required', 'refunded', 'chargeback', 'cancelled')
    and trade_no is not null and paid_at is not null)
);

-- Prevent a reversal from committing between the historical repair and
-- installation of the trigger. The lock ends when this migration commits.
lock table public.payments in share row exclusive mode;

-- Repair reversals recorded before the order state was synchronized.
update public.ecpay_orders as orders
set status = payment.status
from public.payments as payment
where payment.ecpay_order_id = orders.id
  and payment.status in ('refunded', 'chargeback', 'cancelled')
  and orders.status in ('confirmed', 'refund_required')
  and payment.member_id = orders.member_id
  and payment.plan_id = orders.plan_id
  and payment.amount = orders.amount;

create function private.ecpay_order_record_reversal()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.status not in ('confirmed', 'refund_required') then
    raise exception using errcode = 'P0001', message = 'ECPAY_ORDER_REVERSAL_CONFLICT';
  end if;
  update public.ecpay_orders as orders set status = new.status
  where orders.id = new.ecpay_order_id
    and orders.status = old.status
    and orders.member_id = new.member_id
    and orders.plan_id = new.plan_id
    and orders.amount = new.amount;
  if not found then
    raise exception using errcode = 'P0001', message = 'ECPAY_ORDER_REVERSAL_CONFLICT';
  end if;
  return new;
end;
$$;
revoke all on function private.ecpay_order_record_reversal() from public, anon, authenticated;

create trigger ecpay_order_record_reversal
after update of status on public.payments
for each row
when (new.ecpay_order_id is not null
  and new.status in ('refunded', 'chargeback', 'cancelled')
  and new.status is distinct from old.status)
execute function private.ecpay_order_record_reversal();

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

-- A previously recorded payment is durable proof for acknowledging its exact
-- signed callback again, even when the provider's current query is unavailable.
create function public.ecpay_paid_notification_recorded(
  p_merchant_trade_no text, p_merchant_id text, p_trade_no text, p_amount integer
) returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1
    from public.ecpay_orders as orders
    join public.payments as payment on payment.ecpay_order_id = orders.id
    where orders.merchant_trade_no = p_merchant_trade_no
      and orders.merchant_id = p_merchant_id
      and orders.trade_no = p_trade_no
      and orders.amount = p_amount
      and orders.paid_at is not null
      and orders.status in ('confirmed', 'refund_required', 'refunded', 'chargeback', 'cancelled')
      and payment.status = orders.status
      and payment.amount = orders.amount
      and payment.member_id = orders.member_id
      and payment.plan_id = orders.plan_id
      and payment.paid_at is not null
  );
$$;
revoke all on function public.ecpay_paid_notification_recorded(text,text,text,integer) from public, anon, authenticated;
grant execute on function public.ecpay_paid_notification_recorded(text,text,text,integer) to service_role;

notify pgrst, 'reload schema';
commit;
